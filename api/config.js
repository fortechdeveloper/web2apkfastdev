// api/config.js — ESM handler, anti-crash
// Dipakai kalau package.json punya "type": "module"

export default function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      res.status(500).json({
        error: 'Env var belum di-set',
        message: 'SUPABASE_URL dan/atau SUPABASE_ANON_KEY tidak ditemukan.',
        hint: 'Vercel Dashboard → Settings → Environment Variables → tambah kedua var → Redeploy.',
        debug: {
          hasUrl: !!url,
          hasKey: !!anonKey,
          urlPrefix: url ? String(url).slice(0, 12) : null,
          keyPrefix: anonKey ? String(anonKey).slice(0, 12) : null,
        },
      });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    res.status(200).json({
      supabaseUrl: String(url).trim(),
      supabaseAnonKey: String(anonKey).trim(),
    });
  } catch (err) {
    try {
      res.status(500).json({
        error: 'Config handler crash',
        message: err && err.message ? String(err.message) : String(err),
        stack: err && err.stack ? String(err.stack).split('\n').slice(0, 6) : null,
      });
    } catch (_) {
      try {
        res.status(500).end('Config handler fatal error');
      } catch (_) {}
    }
  }
}