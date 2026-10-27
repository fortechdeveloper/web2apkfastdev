export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username wajib diisi.' });
  }

  // Bersihkan @ dari username
  username = username.trim().replace(/^@+/, '');
  if (!username) {
    return res.status(400).json({ error: 'Username tidak valid.' });
  }

  const API_URL = `https://shinyfrydgdghfdgdgmouse-a6de.issam1996kech.workers.dev/api/v1/profile?username=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://tikip.us',
        'Referer': 'https://tikip.us/'
      }
    });

    const data = await response.json();
    
    if (data.status === "error") {
      throw new Error(data.error || 'Username tidak ditemukan atau akun private.');
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      status: 'error', 
      error: error.message || 'Gagal mengambil data dari server.' 
    });
  }
}