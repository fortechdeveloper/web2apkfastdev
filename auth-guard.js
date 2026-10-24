/* ============================================================
   Auth Guard v2 — instan antar navigasi
   - Sync read session dari localStorage (persist Supabase)
   - Cache /api/config di localStorage (TTL 1 jam)
   - Verifikasi Supabase di background
   - Dispatch 'authready' (cache) + 'authprofile' (verified)
   ============================================================ */

(function () {
  'use strict';

  const html = document.documentElement;
  const LOGIN_URL = 'login.html';
  const CONFIG_ENDPOINT = '/api/config';
  const STORAGE_KEY = 'fortech-auth-session';
  const CONFIG_CACHE_KEY = 'fortech-config-cache:v1';
  const CONFIG_CACHE_TTL = 60 * 60 * 1000;
  const EXPIRY_BUFFER_MS = 60 * 1000;

  const textEl = document.getElementById('authGuardText');
  const setStatus = (text) => { if (textEl) textEl.textContent = text; };

  if (location.pathname.indexOf('login.html') !== -1) {
    html.classList.remove('auth-pending');
    return;
  }

  function redirectToLogin() {
    window.location.replace(LOGIN_URL);
  }

  /* ============================================================
     STEP 1 — SYNC: baca session dari localStorage
     ============================================================ */
  function readStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token || !parsed.user) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function isExpired(session) {
    if (!session || !session.expires_at) return false;
    return (session.expires_at * 1000) < (Date.now() - EXPIRY_BUFFER_MS);
  }

  const storedSession = readStoredSession();

  if (!storedSession) {
    redirectToLogin();
    return;
  }

  if (isExpired(storedSession) && !storedSession.refresh_token) {
    redirectToLogin();
    return;
  }

  /* ============================================================
     STEP 2 — OPTIMISTIC: session ada → tampilkan halaman
     ============================================================ */
  window.currentUser = storedSession.user;
  html.classList.remove('auth-pending');

  window.dispatchEvent(new CustomEvent('authready', {
    detail: {
      user: storedSession.user,
      profile: null,
      source: 'cache',
    },
  }));

  /* ============================================================
     STEP 3 — CONFIG CACHE
     ============================================================ */
  function readConfigCache() {
    try {
      const raw = localStorage.getItem(CONFIG_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.supabaseUrl || !parsed.supabaseAnonKey) return null;
      if (parsed.cachedAt && (Date.now() - parsed.cachedAt) > CONFIG_CACHE_TTL) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeConfigCache(cfg) {
    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
        supabaseUrl: cfg.supabaseUrl,
        supabaseAnonKey: cfg.supabaseAnonKey,
        cachedAt: Date.now(),
      }));
    } catch (_) { /* ignore */ }
  }

  async function loadConfig() {
    const cached = readConfigCache();
    if (cached) return cached;

    const res = await fetch(CONFIG_ENDPOINT, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Config HTTP ' + res.status);
    const cfg = await res.json();
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('Config tidak lengkap');
    }
    writeConfigCache(cfg);
    return cfg;
  }

  /* ============================================================
     STEP 4 — VERIFY DI BACKGROUND
     ============================================================ */
  async function verify() {
    try {
      const cfg = await loadConfig();

      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase JS belum termuat');
      }

      const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: STORAGE_KEY,
        },
      });
      window.supabaseClient = sb;

      const { data: { session }, error } = await sb.auth.getSession();

      if (error || !session || !session.user) {
        try { await sb.auth.signOut(); } catch (_) { /* ignore */ }
        redirectToLogin();
        return;
      }

      window.currentUser = session.user;

      sb.auth.onAuthStateChange((event, s) => {
        if (event === 'SIGNED_OUT') {
          redirectToLogin();
        } else if (event === 'TOKEN_REFRESHED' && s) {
          window.currentUser = s.user;
        }
      });

      try {
        const { data, error: pErr } = await sb
          .from('profiles')
          .select('username, full_name, whatsapp, updated_at')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!pErr && data) {
          window.currentProfile = data;
          window.dispatchEvent(new CustomEvent('authprofile', {
            detail: { profile: data, user: session.user },
          }));
        }
      } catch (_) {
        /* profile fetch gagal bukan blocker */
      }
    } catch (err) {
      console.warn('[auth-guard] verify gagal:', err);
      // Session ada di cache → biarkan halaman tampil
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', verify);
  } else {
    verify();
  }
})();