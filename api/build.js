import { Readable } from 'stream';

// Matikan body parser bawaan Vercel agar bisa menerima raw multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Ambil API Key dari Environment Variable Vercel
  const apiKey = process.env.APIKEYYRF;
  
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      error: 'Sistem Error: Environment Variable APIKEYYRF belum disetting di Vercel.' 
    });
  }

  try {
    const targetUrl = 'https://rfweb2apk.rfdevv.com/api/apk/build-api';
    
    // Konversi Node.js stream ke Web Stream agar bisa di-forward
    const bodyStream = Readable.toWeb(req);
    
    // Tembak API asli menggunakan API Key dari server
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'],
        'X-API-Key': apiKey,
      },
      body: bodyStream,
      duplex: 'half'
    });

    const data = await response.json();
    
    // Kembalikan response JSON ke frontend
    return res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Gagal terhubung ke server utama: ' + error.message 
    });
  }
}