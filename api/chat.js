export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_URL = 'https://9routeruncensored.my.id/v1/chat/completions';
  const API_KEY = 'jv-pub-QLZym5vrm1wUVvcPlyAaHlGw3PaEEG9Kp___MRA2Eck';
  const MODEL = 'Asep/deepseek-ai/DeepSeek-V4-Flash-0731-uncensored';

  // Vercel otomatis nge-parse JSON body
  const { messages, stream } = req.body;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages || [],
        stream: !!stream,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    // Teruskan header Content-Type dari server AI (JSON atau SSE stream)
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json');

    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Looping stream data dari server AI dan teruskan ke browser (streaming teks ngetik)
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