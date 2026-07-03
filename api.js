let _client = null;

function client() {
  if (!_client) throw new Error('Supabase not connected');
  return _client;
}

function initSupabase(url, anonKey) {
  _client = window.supabase.createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function normPhone(p) {
  return (p || '').replace(/\D/g, '');
}

const COUNT_TABLES = [
  'customers', 'products', 'sales', 'expenses', 'ledger_entries', 'stock_movements',
];

const TABLE_LABELS = {
  customers: 'Customers',
  products: 'Products',
  sales: 'Sales',
  expenses: 'Expenses',
  ledger_entries: 'Ledger',
  stock_movements: 'Stock',
};

async function fetchRevokedIds() {
  try {
    const { data } = await client().from('account_revocations').select('business_id');
    return new Set((data || []).map((r) => r.business_id));
  } catch {
    return new Set();
  }
}

async function selectAllBusinessIds(table) {
  const out = [];
  let start = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await client()
      .from(table)
      .select('business_id')
      .range(start, start + page - 1);
    if (error) break;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < page) break;
    start += page;
  }
  return out;
}

async function fetchEntryCounts() {
  const result = {};
  for (const table of COUNT_TABLES) {
    try {
      const rows = await selectAllBusinessIds(table);
      for (const row of rows) {
        const id = row.business_id || '';
        if (!id) continue;
        if (!result[id]) result[id] = {};
        result[id][table] = (result[id][table] || 0) + 1;
      }
    } catch (_) {}
  }
  return result;
}

async function fetchAllBusinesses() {
  const revoked = await fetchRevokedIds();
  const { data: bizRows, error } = await client()
    .from('businesses')
    .select('id, phone, name, type, created_at, plan_type')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: subRows } = await client()
    .from('pro_subscriptions')
    .select('business_id, pro_expires_at');

  const subMap = {};
  for (const r of subRows || []) {
    if (r.pro_expires_at) subMap[r.business_id] = r.pro_expires_at;
  }

  const counts = await fetchEntryCounts();

  return (bizRows || [])
    .filter((r) => !revoked.has(r.id))
    .map((r) => ({
      ...r,
      pro_expires_at: subMap[r.id] || null,
      entryCounts: counts[r.id] || {},
      totalEntries: Object.values(counts[r.id] || {}).reduce((a, b) => a + b, 0),
    }));
}

async function fetchStats() {
  const businesses = await fetchAllBusinesses();
  const now = new Date().toISOString();
  const { count } = await client()
    .from('pro_subscriptions')
    .select('business_id', { count: 'exact', head: true })
    .gt('pro_expires_at', now);
  return {
    totalUsers: businesses.length,
    proUsers: count || 0,
    freeUsers: businesses.length - (count || 0),
  };
}

async function businessIdsForPhone(phone) {
  const target = normPhone(phone);
  const { data } = await client().from('businesses').select('id, phone');
  return (data || [])
    .filter((r) => normPhone(r.phone) === target)
    .map((r) => r.id);
}

async function assignPlanTier(phone, tier, expiresAt, notes = '') {
  const planType = { pro: 'Pro', proplus: 'Pro+', enterprise: 'Enterprise', free: 'free' }[tier] || tier;
  const ids = await businessIdsForPhone(phone);
  const exp = expiresAt.toISOString();
  for (const id of ids) {
    await client().from('businesses').update({ plan_type: planType }).eq('id', id);
    if (planType === 'free') {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      await client().from('pro_subscriptions').upsert({
        business_id: id,
        pro_expires_at: yesterday,
        activated_by: 'admin',
        activated_at: new Date().toISOString(),
        notes: 'Revoked by admin',
      });
    } else {
      await client().from('pro_subscriptions').upsert({
        business_id: id,
        pro_expires_at: exp,
        activated_by: 'admin',
        activated_at: new Date().toISOString(),
        notes: notes || tier,
      });
    }
  }
  return ids.length;
}

async function deleteAccount(businessId, phone) {
  const ids = new Set([businessId]);
  const same = await businessIdsForPhone(phone);
  same.forEach((id) => ids.add(id));

  const childTables = [
    'expenses', 'payments', 'supplier_payments', 'ledger_entries',
    'purchase_items', 'purchases', 'sale_items', 'sales',
    'stock_movements', 'products', 'suppliers', 'customers',
  ];

  for (const id of ids) {
    let ph = phone;
    if (!ph) {
      const { data } = await client().from('businesses').select('phone').eq('id', id).maybeSingle();
      ph = data?.phone || '';
    }
    await client().from('account_revocations').upsert({
      business_id: id,
      phone: ph,
      revoked_at: new Date().toISOString(),
      revoked_by: 'admin',
    });
    for (const table of childTables) {
      try {
        await client().from(table).delete().eq('business_id', id);
      } catch (_) {}
    }
    try {
      await client().from('pro_subscriptions').delete().eq('business_id', id);
    } catch (_) {}
    await client().from('businesses').delete().eq('id', id);
  }
  return ids.size;
}

async function getAppConfig(keys) {
  const { data } = await client().from('app_config').select('key, value').in('key', keys);
  const map = {};
  for (const r of data || []) map[r.key] = r.value ?? '';
  return map;
}

async function setAppConfig(entries) {
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(entries)) {
    await client().from('app_config').upsert({ key, value: String(value), updated_at: now });
  }
}

async function fetchAdConfig() {
  const m = await getAppConfig(['ads_enabled', 'ads_link', 'ads_title', 'ads_description']);
  return {
    enabled: m.ads_enabled === 'true',
    link: m.ads_link || '',
    title: m.ads_title || '',
    description: m.ads_description || '',
  };
}

async function fetchAiConfig() {
  const m = await getAppConfig([
    'ai_enabled', 'ai_provider', 'ai_model', 'ai_api_key',
    'ai_free_limited_access', 'ai_free_daily_limit', 'ai_pro_full_access',
  ]);
  return {
    enabled: m.ai_enabled === 'true',
    provider: m.ai_provider || 'offline_local',
    model: m.ai_model || 'local-smart-rules',
    apiKey: m.ai_api_key || '',
    freeLimited: m.ai_free_limited_access !== 'false',
    freeDailyLimit: parseInt(m.ai_free_daily_limit, 10) || 10,
    proFullAccess: m.ai_pro_full_access !== 'false',
  };
}

async function fetchOtpPolicy() {
  const m = await getAppConfig(['otp_verification_enabled']);
  return m.otp_verification_enabled !== 'false';
}

async function fetchTrialConfig() {
  const m = await getAppConfig([
    'trial_campaign_active', 'trial_duration_hours',
    'trial_target_audience', 'trial_campaign_started_at',
  ]);
  return {
    active: m.trial_campaign_active === 'true',
    hours: parseInt(m.trial_duration_hours, 10) || 24,
    audience: m.trial_target_audience || 'BOTH_ALL_USERS',
    startedAt: m.trial_campaign_started_at || '',
  };
}

const YT_KEYS = [
  'dashboard', 'khata', 'stock', 'sales', 'new_sale', 'expenses',
  'reports', 'due_list', 'customer', 'business_setup', 'reminders',
];

async function fetchYoutubeLinks() {
  const keys = YT_KEYS.map((k) => `youtube_link_${k}`);
  const m = await getAppConfig(keys);
  const out = {};
  for (const k of YT_KEYS) out[k] = m[`youtube_link_${k}`] || '';
  return out;
}

async function saveYoutubeLinks(links) {
  const entries = {};
  for (const [k, v] of Object.entries(links)) {
    entries[`youtube_link_${k}`] = v;
  }
  await setAppConfig(entries);
}

async function fetchNotifications() {
  const { data, error } = await client()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createNotification(title, message) {
  await client().from('notifications').insert({ title, message, is_active: true });
}

async function updateNotification(id, title, message, isActive) {
  await client().from('notifications').update({
    title, message, is_active: isActive,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

async function deleteNotification(id) {
  await client().from('notifications').delete().eq('id', id);
}

async function fetchPendingSubs() {
  const { data, error } = await client()
    .from('pending_subscriptions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

async function approvePendingSub(row, months = 1) {
  const tier = row.package_type === 'enterprise' ? 'enterprise' : 'pro';
  const exp = new Date();
  exp.setMonth(exp.getMonth() + months);
  await assignPlanTier(row.phone_number, tier, exp, `Easypaisa ${row.trx_id}`);
  await client().from('pending_subscriptions').delete().eq('id', row.id);
}

async function fetchGooglePlayPurchases() {
  const { data, error } = await client()
    .from('google_play_purchases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return data || [];
}

function planBadge(planType) {
  const p = (planType || 'free').toLowerCase();
  if (p === 'enterprise') return 'badge-enterprise';
  if (p === 'pro+') return 'badge-proplus';
  if (p === 'pro') return 'badge-pro';
  return 'badge-free';
}

function planLabel(planType, expiresAt) {
  const p = planType || 'free';
  if (p !== 'free' && p) return p;
  if (expiresAt && new Date(expiresAt) > new Date()) return 'Pro';
  if (expiresAt) return 'Expired';
  return 'Free';
}

window.AdminApi = {
  initSupabase,
  fetchAllBusinesses,
  fetchStats,
  assignPlanTier,
  deleteAccount,
  fetchAdConfig,
  fetchAiConfig,
  fetchOtpPolicy,
  fetchTrialConfig,
  fetchYoutubeLinks,
  saveYoutubeLinks,
  setAppConfig,
  fetchNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  fetchPendingSubs,
  approvePendingSub,
  fetchGooglePlayPurchases,
  businessIdsForPhone,
  planBadge,
  planLabel,
  TABLE_LABELS,
  YT_KEYS,
  YT_LABELS: {
    dashboard: 'Dashboard', khata: 'Khata', stock: 'Stock', sales: 'Sales',
    new_sale: 'New Sale', expenses: 'Expenses', reports: 'Reports',
    due_list: 'Due List', customer: 'Customer', business_setup: 'Business Setup',
    reminders: 'Reminders',
  },
};
