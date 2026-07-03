const AUTH_KEY = 'ak_admin_auth_v2';
const LOCK_KEY = 'ak_admin_lock_v2';
const MAX_FAIL = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_MS = 2 * 60 * 60 * 1000;

async function sha256(text) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveAuth(data) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

function isLocked() {
  const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
  if (!lock?.until) return false;
  if (Date.now() < lock.until) return lock;
  localStorage.removeItem(LOCK_KEY);
  return false;
}

function recordFail() {
  const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || '{"count":0}');
  lock.count = (lock.count || 0) + 1;
  if (lock.count >= MAX_FAIL) {
    lock.until = Date.now() + LOCK_MS;
    lock.count = 0;
  }
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}

function clearFails() {
  localStorage.removeItem(LOCK_KEY);
}

function isSessionValid() {
  const a = getAuth();
  if (!a?.pinHash || !a?.url || !a?.anonKey) return false;
  if (!a.sessionUntil || Date.now() > a.sessionUntil) return false;
  return true;
}

async function setupAdmin(url, anonKey, pin) {
  if (!url?.startsWith('https://') || !anonKey || pin.length < 6) {
    throw new Error('URL, anon key aur PIN (min 6) zaroori hain.');
  }
  const pinHash = await sha256(pin.trim());
  saveAuth({
    url: url.trim(),
    anonKey: anonKey.trim(),
    pinHash,
    sessionUntil: Date.now() + SESSION_MS,
    createdAt: Date.now(),
  });
  clearFails();
}

async function loginPin(pin) {
  const lock = isLocked();
  if (lock) {
    const mins = Math.ceil((lock.until - Date.now()) / 60000);
    throw new Error(`Locked — ${mins} min baad try karein.`);
  }
  const a = getAuth();
  if (!a?.pinHash) throw new Error('Pehle setup karein.');
  const hash = await sha256(pin.trim());
  if (hash !== a.pinHash) {
    recordFail();
    throw new Error('Galat PIN.');
  }
  a.sessionUntil = Date.now() + SESSION_MS;
  saveAuth(a);
  clearFails();
}

async function verifyPin(pin) {
  const a = getAuth();
  if (!a?.pinHash) return false;
  return (await sha256(pin.trim())) === a.pinHash;
}

function touchSession() {
  const a = getAuth();
  if (!a) return;
  a.sessionUntil = Date.now() + SESSION_MS;
  saveAuth(a);
}

function logout() {
  const a = getAuth();
  if (a) {
    a.sessionUntil = 0;
    saveAuth(a);
  }
}

window.AdminAuth = {
  sha256,
  getAuth,
  saveAuth,
  clearAuth,
  isLocked,
  isSessionValid,
  setupAdmin,
  loginPin,
  verifyPin,
  touchSession,
  logout,
};
