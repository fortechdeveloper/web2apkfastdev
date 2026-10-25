// api/chat.js
// Menggunakan Vercel Edge Runtime untuk bypass blokir Cloudflare WAF
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const API_URL = 'https://9routeruncensored.my.id/v1/chat/completions';
  const API_KEY = 'jv-pub-QLZym5vrm1wUVvcPlyAaHlGw3PaEEG9Kp___MRA2Eck';
  const MODEL = 'Asep/deepseek-ai/DeepSeek-V4-Flash-0731-uncensored';

  try {
    const body = await req.json();
    const { messages, stream } = body;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'HTTP-Referer': 'https://web2apk.fastdev.my.id',
        'X-Title': 'Web2APK Chat AI'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages || [],
        stream: !!stream,
      }),
    });

    // Cek jika masih ditolak oleh Cloudflare
    const contentType = response.headers.get('Content-Type') || '';
    if (!response.ok && contentType.includes('text/html')) {
      const htmlText = await response.text();
      if (htmlText.includes('Just a moment...')) {
        return new Response(JSON.stringify({ 
          error: 'Diblokir oleh keamanan Cloudflare Server AI.',
          detail: 'IP Vercel masih diblokir. Coba lagi nanti atau gunakan proxy lain.'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Kembalikan response stream ke frontend
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType || 'application/json',
        // Teruskan header jika perlu
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}