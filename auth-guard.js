/* ============================================================
   Auth Guard — wajib login untuk semua halaman kecuali login.html
   - Fetch /api/config (Vercel serverless function)
   - Inisialisasi Supabase client
   - Cek session, redirect ke login.html kalau kosong
   - Set window.supabaseClient, window.currentUser, window.currentProfile
   - Dispatch event 'authready' untuk listener halaman
   ============================================================ */

(function () {
  'use strict';

  const html = document.documentElement;
  const LOGIN_URL = 'login.html';
  const CONFIG_ENDPOINT = '/api/config';
  const STORAGE_KEY = 'fortech-auth-session';

  const textEl = document.getElementById('authGuardText');
  const setStatus = (text) => { if (textEl) textEl.textContent = text; };

  // Skip guard kalau lagi di login.html
  if (location.pathname.indexOf('login.html') !== -1) {
    html.classList.remove('auth-pending');
    return;
  }

  function redirectToLogin(reason) {
    try {
      if (reason) sessionStorage.setItem('auth-redirect-reason', reason);
    } catch (_) { /* ignore */ }
    window.location.replace(LOGIN_URL);
  }

  async function run() {
    setStatus('Memuat konfigurasi…');

    try {
      // 1. Ambil konfigurasi dari server
      const res = await fetch(CONFIG_ENDPOINT, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Konfigurasi server tidak tersedia (HTTP ' + res.status + ').');
      }
      const cfg = await res.json();
      if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        throw new Error('Konfigurasi Supabase tidak lengkap.');
      }

      // 2. Pastikan library Supabase sudah termuat
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Library Supabase gagal dimuat.');
      }

      // 3. Inisialisasi client
      const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: STORAGE_KEY,
        },
      });
      window.supabaseClient = sb;

      // 4. Cek session
      setStatus('Memeriksa sesi…');
      const { data: { session } } = await sb.auth.getSession();

      if (!session || !session.user) {
        redirectToLogin();
        return;
      }

      window.currentUser = session.user;

      // 5. Pantau perubahan auth (logout, refresh)
      sb.auth.onAuthStateChange((event, s) => {
        if (event === 'SIGNED_OUT') {
          redirectToLogin();
        } else if (event === 'TOKEN_REFRESHED' && s) {
          window.currentUser = s.user;
        }
      });

      // 6. Ambil profile dari tabel public.profiles
      setStatus('Memuat profil…');
      try {
        const { data, error } = await sb
          .from('profiles')
          .select('username, full_name, whatsapp, updated_at')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!error && data) {
          window.currentProfile = data;
        }
      } catch (e) {
        // Profile fetch gagal bukan blocker — user tetap bisa akses halaman
        console.warn('[auth-guard] Profile fetch gagal:', e);
      }

      // 7. Selesai — tampilkan body
      html.classList.remove('auth-pending');

      // 8. Dispatch event untuk halaman yang butuh data user
      window.dispatchEvent(new CustomEvent('authready', {
        detail: {
          user: window.currentUser,
          profile: window.currentProfile || null,
        },
      }));

    } catch (err) {
      console.error('[auth-guard]', err);
      setStatus('Gagal memuat. Mengalihkan ke login…');
      // Tetap arahkan ke login supaya user bisa retry
      setTimeout(() => redirectToLogin('guard-error'), 700);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();