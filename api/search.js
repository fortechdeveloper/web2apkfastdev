import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, type } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query pencarian tidak boleh kosong.' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
  };

  try {
    if (type === 'image') {
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];

      $('a.iusc').each((i, el) => {
        const m = $(el).attr('m');
        if (m) {
          try {
            const parsed = JSON.parse(m);
            if (parsed.murl) results.push(parsed.murl);
          } catch (e) {}
        }
      });

      return res.status(200).json({ results: [...new Set(results)].slice(0, 24) });
    } else {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers });
      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];

      $('li.b_algo').each((i, el) => {
        const title = $(el).find('h2 a').text().trim();
        const rawUrl = $(el).find('h2 a').attr('href');
        const snippet = $(el).find('.b_caption p').text().trim() || '';

        if (title && rawUrl) {
          let finalUrl = rawUrl;
          if (rawUrl.includes('/ck/a?!')) {
            const uMatch = rawUrl.match(/&u=a1([^&]+)/);
            if (uMatch) {
              try { finalUrl = Buffer.from(uMatch[1], 'base64').toString(); } catch (e) {}
            }
          }
          results.push({ title, url: finalUrl, snippet });
        }
      });

      return res.status(200).json({ results: results.slice(0, 10) });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal mencari.' });
  }
}