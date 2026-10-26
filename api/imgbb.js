const EXPIRATION_MAP = {
  never: "", "0": "", "5m": "PT5M", "15m": "PT15M", "30m": "PT30M",
  "1h": "PT1H", "3h": "PT3H", "6h": "PT6H", "12h": "PT12H",
  "1d": "P1D", "2d": "P2D", "3d": "P3D", "4d": "P4D", "5d": "P5D", "6d": "P6D",
  "1w": "P1W", "2w": "P2W", "3w": "P3W",
  "1mo": "P1M", "2mo": "P2M", "3mo": "P3M", "4mo": "P4M", "5mo": "P5M", "6mo": "P6M"
};

function normalizeExpiration(exp) {
  if (!exp) return "";
  const clean = String(exp).trim().toLowerCase();
  return EXPIRATION_MAP[clean] || "";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, source, expiration } = req.body;
  const expCode = normalizeExpiration(expiration);
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  try {
    // 1. Ambil Auth Token & Cookie
    const tokenRes = await fetch('https://id.imgbb.com/', {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    const html = await tokenRes.text();
    const cookies = tokenRes.headers.get('set-cookie') || '';
    const tokenMatch = html.match(/PF\.obj\.config\.auth_token\s*=\s*"([^"]+)"/);

    if (!tokenMatch) throw new Error('Gagal mengambil auth_token dari ImgBB.');
    const authToken = tokenMatch[1];

    // 2. Siapkan FormData
    const form = new FormData();
    form.append('action', 'upload');
    form.append('auth_token', authToken);
    if (expCode) form.append('expiration', expCode);

    if (type === 'url') {
      form.append('type', 'url');
      form.append('source', source);
    } else if (type === 'file') {
      // source adalah base64 string dari frontend
      const base64Data = source.split(',')[1] || source;
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: 'image/png' });
      form.append('type', 'file');
      form.append('source', blob, 'image.png');
    } else {
      throw new Error('Tipe sumber tidak valid');
    }

    // 3. Upload ke ImgBB
    const uploadRes = await fetch('https://id.imgbb.com/json', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Referer': 'https://id.imgbb.com/',
        'Accept': 'application/json',
        'Cookie': cookies.split(';')[0] // Ambil cookie pertama (PHPSESSID)
      },
      body: form
    });

    const data = await uploadRes.json();

    if (data.status_code !== 200 || !data.image) {
      throw new Error(data.error?.message || data.status_txt || 'Gagal mengunggah ke ImgBB');
    }

    const img = data.image;
    return res.status(200).json({
      status: true,
      directUrl: img.url,
      viewerUrl: img.url_viewer,
      deleteUrl: img.delete_url,
      thumbUrl: img.thumb?.url || img.display_url,
      filename: img.filename,
      size: img.size_formatted || `${img.size} bytes`,
      width: img.width,
      height: img.height,
      expirationCode: expCode || "never"
    });

  } catch (error) {
    return res.status(500).json({ status: false, error: error.message || 'Terjadi kesalahan server.' });
  }
}