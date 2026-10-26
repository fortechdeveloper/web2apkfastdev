export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL wajib diisi.' });
  }

  try {
    const apiUrl = `https://julzpreset-finder.vercel.app/api/find?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-API-Key': 'julzpreset',
        'X-AM-Key': 'julzpreset',
        'Referer': 'https://julzpreset-finder.vercel.app/',
        'Origin': 'https://julzpreset-finder.vercel.app'
      }
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Gagal menghubungi server AM Finder.' });
  }
}