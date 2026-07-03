/* global AdminAuth, AdminApi, supabase */

let businesses = [];
let searchQuery = '';
let currentSection = 'dashboard';

function $(id) { return document.getElementById(id); }
function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderColor = isErr ? '#ef4444' : '#22c55e';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showScreen(name) {
  $('auth-screen').classList.toggle('hidden', name !== 'auth');
  $('setup-screen').classList.toggle('hidden', name !== 'setup');
  $('app-screen').classList.toggle('hidden', name !== 'app');
}

function initSupabaseFromAuth() {
  const a = AdminAuth.getAuth();
  AdminApi.initSupabase(a.url, a.anonKey);
}

async function boot() {
  if (AdminAuth.isLocked()) {
    const lock = AdminAuth.isLocked();
    $('login-err').textContent = `Locked — ${Math.ceil((lock.until - Date.now()) / 60000)} min wait.`;
  }
  if (!AdminAuth.getAuth()?.pinHash) {
    showScreen('setup');
    return;
  }
  if (!AdminAuth.isSessionValid()) {
    showScreen('auth');
    return;
  }
  initSupabaseFromAuth();
  showScreen('app');
  await refreshAll();
}

async function refreshAll() {
  AdminAuth.touchSession();
  try {
    const [stats, biz] = await Promise.all([
      AdminApi.fetchStats(),
      AdminApi.fetchAllBusinesses(),
    ]);
    businesses = biz;
    renderStats(stats);
    renderUsers();
    await loadSectionPanels();
  } catch (e) {
    toast(e.message || 'Load fail', true);
  }
}

function renderStats(s) {
  $('stat-total').textContent = s.totalUsers;
  $('stat-pro').textContent = s.proUsers;
  $('stat-free').textContent = s.freeUsers;
}

function filteredBusinesses() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return businesses;
  return businesses.filter((b) =>
    (b.phone || '').toLowerCase().includes(q) ||
    (b.name || '').toLowerCase().includes(q) ||
    (b.type || '').toLowerCase().includes(q) ||
    (b.id || '').toLowerCase().includes(q),
  );
}

function groupByPhone(list) {
  const map = new Map();
  for (const b of list) {
    const ph = (b.phone || 'unknown').replace(/\D/g, '') || 'unknown';
    if (!map.has(ph)) map.set(ph, []);
    map.get(ph).push(b);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

function renderUsers() {
  const tbody = $('users-tbody');
  if (!tbody) return;
  const groups = groupByPhone(filteredBusinesses());
  tbody.innerHTML = groups.map(([phone, rows]) => {
    const main = rows[0];
    const badge = AdminApi.planBadge(main.plan_type);
    const label = AdminApi.planLabel(main.plan_type, main.pro_expires_at);
    const total = rows.reduce((s, r) => s + (r.totalEntries || 0), 0);
    return `<tr data-phone="${phone}">
      <td><strong>${main.phone || '—'}</strong><br><span class="muted">${rows.length} karobar</span></td>
      <td>${main.name || '—'}</td>
      <td><span class="badge ${badge}">${label}</span></td>
      <td>${total}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-action="manage" data-phone="${phone}">Manage</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5">Koi user nahi</td></tr>';
}

async function loadSectionPanels() {
  if (currentSection === 'ads') await loadAds();
  if (currentSection === 'ai') await loadAi();
  if (currentSection === 'otp') await loadOtp();
  if (currentSection === 'trial') await loadTrial();
  if (currentSection === 'youtube') await loadYoutube();
  if (currentSection === 'notifications') await loadNotifications();
  if (currentSection === 'pending') await loadPending();
  if (currentSection === 'play') await loadPlay();
}

async function loadAds() {
  const c = await AdminApi.fetchAdConfig();
  $('ads-enabled').checked = c.enabled;
  $('ads-link').value = c.link;
  $('ads-title').value = c.title;
  $('ads-desc').value = c.description;
}

async function loadAi() {
  const c = await AdminApi.fetchAiConfig();
  $('ai-enabled').checked = c.enabled;
  $('ai-provider').value = c.provider;
  $('ai-model').value = c.model;
  $('ai-key').value = c.apiKey;
  $('ai-free-limit').checked = c.freeLimited;
  $('ai-daily').value = c.freeDailyLimit;
  $('ai-pro-full').checked = c.proFullAccess;
}

async function loadOtp() {
  $('otp-enabled').checked = await AdminApi.fetchOtpPolicy();
}

async function loadTrial() {
  const c = await AdminApi.fetchTrialConfig();
  $('trial-active').checked = c.active;
  $('trial-hours').value = c.hours;
  $('trial-audience').value = c.audience;
  $('trial-started').textContent = c.startedAt ? `Started: ${c.startedAt}` : 'Not started yet';
}

async function loadYoutube() {
  const links = await AdminApi.fetchYoutubeLinks();
  const box = $('youtube-fields');
  box.innerHTML = AdminApi.YT_KEYS.map((k) => `
    <div class="field">
      <label>${AdminApi.YT_LABELS[k]}</label>
      <input type="url" data-yt="${k}" value="${links[k] || ''}" placeholder="https://youtube.com/..." />
    </div>`).join('');
}

async function loadNotifications() {
  const rows = await AdminApi.fetchNotifications();
  $('notif-list').innerHTML = rows.map((n) => `
    <div class="panel" style="padding:12px">
      <strong>${n.title}</strong>
      <span class="badge ${n.is_active ? 'badge-pro' : 'badge-free'}">${n.is_active ? 'Active' : 'Off'}</span>
      <p style="margin:8px 0;font-size:0.85rem;color:var(--muted)">${n.message}</p>
      <button class="btn btn-ghost btn-sm" data-notif-edit="${n.id}">Edit</button>
      <button class="btn btn-danger btn-sm" data-notif-del="${n.id}">Delete</button>
    </div>`).join('') || '<p class="muted">Koi notification nahi</p>';
}

async function loadPending() {
  const rows = await AdminApi.fetchPendingSubs();
  $('pending-tbody').innerHTML = rows.map((r) => `
    <tr>
      <td>${r.phone_number}</td>
      <td>${r.package_type}</td>
      <td>${r.trx_id}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td><button class="btn btn-primary btn-sm" data-pending-approve="${r.id}">Approve Pro</button></td>
    </tr>`).join('') || '<tr><td colspan="5">Koi pending nahi</td></tr>';
  window._pendingRows = rows;
}

async function loadPlay() {
  const rows = await AdminApi.fetchGooglePlayPurchases();
  $('play-tbody').innerHTML = rows.map((r) => `
    <tr>
      <td>${r.phone_number || '—'}</td>
      <td>${r.plan_type || '—'}</td>
      <td>${r.product_id || '—'}</td>
      <td>${r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="4">Koi purchase nahi</td></tr>';
}

function showSection(id) {
  currentSection = id;
  document.querySelectorAll('[data-section]').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.section !== id);
  });
  document.querySelectorAll('.nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === id);
  });
  loadSectionPanels();
  $('sidebar')?.classList.remove('open');
}

function openUserModal(phone) {
  const rows = businesses.filter((b) => (b.phone || '').replace(/\D/g, '') === phone);
  if (!rows.length) return;
  const main = rows[0];
  $('modal-title').textContent = `Manage: ${main.phone}`;
  $('modal-body').innerHTML = `
    <p><strong>${rows.length}</strong> karobar is phone par</p>
    <ul style="font-size:0.85rem;color:var(--muted)">
      ${rows.map((r) => `<li>${r.name} (${r.type}) — ${AdminApi.planLabel(r.plan_type, r.pro_expires_at)}</li>`).join('')}
    </ul>
    <div class="field"><label>Plan</label>
      <select id="m-tier">
        <option value="pro">Pro</option>
        <option value="proplus">Pro+</option>
        <option value="enterprise">Enterprise</option>
        <option value="free">Free / Revoke</option>
      </select>
    </div>
    <div class="field"><label>Months</label>
      <select id="m-months">
        <option value="1">1 month</option>
        <option value="3">3 months</option>
        <option value="6">6 months</option>
        <option value="12">12 months</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="m-assign">Assign Plan</button>
      <button class="btn btn-danger" id="m-delete">Delete Account</button>
      <button class="btn btn-ghost" id="m-close">Close</button>
    </div>`;
  $('modal-overlay').classList.remove('hidden');
  $('m-close').onclick = () => $('modal-overlay').classList.add('hidden');
  $('m-assign').onclick = async () => {
    const tier = $('m-tier').value;
    const months = parseInt($('m-months').value, 10);
    const exp = new Date();
    if (tier === 'free') {
      await AdminApi.assignPlanTier(main.phone, 'free', exp);
    } else {
      exp.setMonth(exp.getMonth() + months);
      await AdminApi.assignPlanTier(main.phone, tier, exp);
    }
    toast('Plan updated');
    $('modal-overlay').classList.add('hidden');
    await refreshAll();
  };
  $('m-delete').onclick = async () => {
    const pin = prompt('Confirm delete — Admin PIN:');
    if (!pin || !(await AdminAuth.verifyPin(pin))) {
      toast('Galat PIN', true);
      return;
    }
    if (!confirm('POORA account cloud se delete? Undo nahi hoga.')) return;
    await AdminApi.deleteAccount(main.id, main.phone);
    toast('Account deleted');
    $('modal-overlay').classList.add('hidden');
    await refreshAll();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  $('setup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await AdminAuth.setupAdmin(
        $('setup-url').value,
        $('setup-key').value,
        $('setup-pin').value,
      );
      initSupabaseFromAuth();
      showScreen('app');
      await refreshAll();
      toast('Setup complete');
    } catch (err) {
      $('setup-err').textContent = err.message;
    }
  });

  $('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await AdminAuth.loginPin($('login-pin').value);
      initSupabaseFromAuth();
      showScreen('app');
      await refreshAll();
    } catch (err) {
      $('login-err').textContent = err.message;
    }
  });

  $('btn-logout')?.addEventListener('click', () => {
    AdminAuth.logout();
    showScreen('auth');
  });

  $('btn-refresh')?.addEventListener('click', () => refreshAll());

  $('global-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderUsers();
  });

  document.querySelectorAll('.nav button').forEach((btn) => {
    btn.addEventListener('click', () => showSection(btn.dataset.nav));
  });

  $('menu-toggle')?.addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
  });

  $('users-tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="manage"]');
    if (btn) openUserModal(btn.dataset.phone);
  });

  $('save-ads')?.addEventListener('click', async () => {
    await AdminApi.setAppConfig({
      ads_enabled: $('ads-enabled').checked,
      ads_link: $('ads-link').value,
      ads_title: $('ads-title').value,
      ads_description: $('ads-desc').value,
    });
    toast('Ads saved');
  });

  $('save-ai')?.addEventListener('click', async () => {
    await AdminApi.setAppConfig({
      ai_enabled: $('ai-enabled').checked,
      ai_provider: $('ai-provider').value,
      ai_model: $('ai-model').value,
      ai_api_key: $('ai-key').value,
      ai_free_limited_access: $('ai-free-limit').checked,
      ai_free_daily_limit: $('ai-daily').value,
      ai_pro_full_access: $('ai-pro-full').checked,
    });
    toast('AI config saved');
  });

  $('save-otp')?.addEventListener('click', async () => {
    await AdminApi.setAppConfig({ otp_verification_enabled: $('otp-enabled').checked });
    toast('OTP policy saved');
  });

  $('save-trial')?.addEventListener('click', async () => {
    const active = $('trial-active').checked;
    const entries = {
      trial_campaign_active: active,
      trial_duration_hours: $('trial-hours').value,
      trial_target_audience: $('trial-audience').value,
    };
    if (active) entries.trial_campaign_started_at = new Date().toISOString();
    await AdminApi.setAppConfig(entries);
    toast('Trial campaign saved');
    await loadTrial();
  });

  $('save-youtube')?.addEventListener('click', async () => {
    const links = {};
    document.querySelectorAll('[data-yt]').forEach((inp) => {
      links[inp.dataset.yt] = inp.value;
    });
    await AdminApi.saveYoutubeLinks(links);
    toast('YouTube links saved');
  });

  $('add-notif')?.addEventListener('click', async () => {
    const title = $('notif-title').value.trim();
    const message = $('notif-msg').value.trim();
    if (!title || !message) return toast('Title + message zaroori', true);
    await AdminApi.createNotification(title, message);
    $('notif-title').value = '';
    $('notif-msg').value = '';
    await loadNotifications();
    toast('Notification created');
  });

  $('pending-tbody')?.addEventListener('click', async (e) => {
    const id = e.target.dataset.pendingApprove;
    if (!id) return;
    const row = (window._pendingRows || []).find((r) => r.id === id);
    if (!row) return;
    await AdminApi.approvePendingSub(row);
    toast('Approved');
    await loadPending();
    await refreshAll();
  });

  $('notif-list')?.addEventListener('click', async (e) => {
    const delId = e.target.dataset.notifDel;
    if (delId) {
      if (!confirm('Delete notification?')) return;
      await AdminApi.deleteNotification(delId);
      await loadNotifications();
      toast('Deleted');
    }
  });

  // Default Supabase URL hint (same as app — user can change)
  if ($('setup-url') && !$('setup-url').value) {
    $('setup-url').value = 'https://cwbfmjplmusscpjcngcm.supabase.co';
  }

  boot();
});
