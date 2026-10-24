/* ============================================================
   Auth Guard v3 — fail-closed
   - Sync check sudah dilakukan inline di <head>
   - File ini: verify session di background, redirect kalau invalid
   - Kalau ada error apapun → redirect ke login (bukan biarkan lolos)
   ============================================================ */

(function () {
  'use strict';

  const html = document.documentElement;
  const LOGIN_URL = 'login.html';
  const CONFIG_ENDPOINT = '/api/config';
  const STORAGE_KEY = 'fortech-auth-session';
  const CONFIG_CACHE_KEY = 'fortech-config-cache:v1';
  const CONFIG_CACHE_TTL = 60 * 60 * 1000;

  const textEl = document.getElementById('authGuardText');
  const setStatus = (text) => { if (textEl) textEl.textContent = text; };

  if (location.pathname.indexOf('login.html') !== -1) {
    html.classList.remove('auth-pending');
    return;
  }

  let redirected = false;
  function bail(reason) {
    if (redirected) return;
    redirected = true;
    if (reason) {
      try { sessionStorage.setItem('auth-redirect-reason', reason); } catch (_) {}
    }
    window.location.replace(LOGIN_URL);
  }

  function readConfigCache() {
    try {
      const raw = localStorage.getItem(CONFIG_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.supabaseUrl || !parsed.supabaseAnonKey) return null;
      if (parsed.cachedAt && (Date.now() - parsed.cachedAt) > CONFIG_CACHE_TTL) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function writeConfigCache(cfg) {
    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
        supabaseUrl: cfg.supabaseUrl,
        supabaseAnonKey: cfg.supabaseAnonKey,
        cachedAt: Date.now(),
      }));
    } catch (_) {}
  }

  async function loadConfig() {
    const cached = readConfigCache();
    if (cached) return cached;

    const res = await fetch(CONFIG_ENDPOINT, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('config-http-' + res.status);
    const cfg = await res.json();
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('config-incomplete');
    }
    writeConfigCache(cfg);
    return cfg;
  }

  async function verify() {
    setStatus('Memuat konfigurasi…');

    let cfg;
    try {
      cfg = await loadConfig();
    } catch (err) {
      console.error('[auth-guard] config gagal:', err);
      setStatus('Gagal memuat. Mengalihkan…');
      setTimeout(() => bail('config-error'), 500);
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('[auth-guard] Supabase JS belum termuat');
      setStatus('Gagal memuat library. Mengalihkan…');
      setTimeout(() => bail('supabase-lib-missing'), 500);
      return;
    }

    let sb;
    try {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: STORAGE_KEY,
        },
      });
      window.supabaseClient = sb;
    } catch (err) {
      console.error('[auth-guard] createClient gagal:', err);
      bail('client-init-failed');
      return;
    }

    setStatus('Memeriksa sesi…');

    let session = null;
    try {
      const result = await sb.auth.getSession();
      session = result && result.data ? result.data.session : null;
    } catch (err) {
      console.error('[auth-guard] getSession error:', err);
      bail('session-error');
      return;
    }

    if (!session || !session.user) {
      try { await sb.auth.signOut(); } catch (_) {}
      bail('no-session');
      return;
    }

    window.currentUser = session.user;

    sb.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') {
        bail('signed-out');
      } else if (event === 'TOKEN_REFRESHED' && s) {
        window.currentUser = s.user;
      }
    });

    setStatus('Memuat profil…');
    try {
      const { data, error } = await sb
        .from('profiles')
        .select('username, full_name, whatsapp, updated_at')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!error && data) {
        window.currentProfile = data;
        window.dispatchEvent(new CustomEvent('authprofile', {
          detail: { profile: data, user: session.user },
        }));
      }
    } catch (_) { /* profile gagal bukan blocker */ }

    html.classList.remove('auth-pending');

    window.dispatchEvent(new CustomEvent('authready', {
      detail: {
        user: window.currentUser,
        profile: window.currentProfile || null,
      },
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', verify);
  } else {
    verify();
  }
})();