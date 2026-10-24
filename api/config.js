// api/config.js
// Vercel serverless function: baca env var, kirim ke frontend sebagai JSON.
// Anon key memang public — ini cuma biar gak hardcode di HTML.

export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    res.status(500).json({
      error: 'Supabase env vars belum di-set. Periksa Settings → Environment Variables di Vercel.',
    });
    return;
  }

  // Cache 1 jam di CDN — config jarang berubah
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  res.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
  });
}