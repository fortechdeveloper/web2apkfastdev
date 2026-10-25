export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_URL = 'https://9routeruncensored.my.id/v1/chat/completions';
  const API_KEY = 'jv-pub-QLZym5vrm1wUVvcPlyAaHlGw3PaEEG9Kp___MRA2Eck';
  const MODEL = 'Asep/deepseek-ai/DeepSeek-V4-Flash-0731-uncensored';

  const { messages, stream } = req.body;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        // Trik 1: Berpura-pura jadi browser Chrome
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        // Trik 2: Header standar untuk platform penyedia LLM
        'HTTP-Referer': 'https://web2apk.fastdev.my.id',
        'X-Title': 'Web2APK Chat AI'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages || [],
        stream: !!stream,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('9router Error:', response.status, errorText);
      // Kirim detail error dari server ke frontend
      return res.status(response.status).json({ 
        error: `Server AI menolak (${response.status})`, 
        detail: errorText 
      });
    }

    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json');

    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const json = await response.json();
      return res.status(200).json(json);
    }
  } catch (error) {
    console.error('Chat Proxy Error:', error);
    return res.status(500).json({ error: error.message || 'Gagal menghubungi server AI.' });
  }
}