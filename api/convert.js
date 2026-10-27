// api/convert.js
const BASE_API = 'https://api.freeconvert.com/v1/process/jobs';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const MAX_WAIT_MS = 55000;
const POLL_INTERVAL = 2000;

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '5mb' } }
};

function sendJson(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function resolveInput(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Input kosong.');
  }
  const src = input.trim();

  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;,]+)?(;base64)?,(.+)$/);
    if (!match) throw new Error('Format data URL tidak valid.');
    const mimeType = match[1] || 'application/octet-stream';
    const isBase64 = match[2] === ';base64';
    const raw = match[3];
    const buffer = isBase64
      ? Buffer.from(raw, 'base64')
      : Buffer.from(decodeURIComponent(raw), 'utf-8');
    return { buffer, fileName: null, mimeType };
  }

  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`Gagal download file sumber: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength === 0) throw new Error('File sumber kosong.');
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    let fileName = null;
    try {
      const parsed = new URL(res.url || src);
      const base = parsed.pathname.split('/').filter(Boolean).pop();
      if (base && base.includes('.')) fileName = decodeURIComponent(base);
    } catch (_) {}
    return { buffer: Buffer.from(ab), fileName, mimeType };
  }

  throw new Error('Input harus URL (http/https) atau data URL.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { status: false, error: 'Gunakan metode POST.' });
  }

  const body = req.body || {};
  const { input, targetFormat, fileName: providedName } = body;

  if (!input || !targetFormat) {
    return sendJson(res, 400, { status: false, error: 'File/URL dan format tujuan wajib diisi.' });
  }

  const cleanFormat = String(targetFormat).toLowerCase().replace(/^\./, '').trim();
  if (!/^[a-z0-9]{1,10}$/.test(cleanFormat)) {
    return sendJson(res, 400, { status: false, error: 'Format tujuan tidak valid.' });
  }

  let jobId = null;

  try {
    const { buffer, fileName: detectedName, mimeType } = await resolveInput(input);
    const fileName = (providedName && String(providedName).trim()) || detectedName || `file_${Date.now()}.${cleanFormat}`;

    const jobRes = await fetch(BASE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.freeconvert.com',
        'Referer': 'https://www.freeconvert.com/'
      },
      body: JSON.stringify({
        tasks: {
          'import-1': { operation: 'import/upload' },
          'convert-1': { operation: 'convert', input: 'import-1', output_format: cleanFormat },
          'export-1': { operation: 'export/url', input: ['convert-1'] }
        }
      })
    });

    if (!jobRes.ok) {
      const errText = await jobRes.text().catch(() => '');
      throw new Error(`Gagal membuat job konversi (${jobRes.status}). ${errText.slice(0, 200)}`);
    }

    const jobData = await jobRes.json();
    jobId = jobData.id;
    const importTask = (jobData.tasks || []).find((t) => t.name === 'import-1');
    if (!importTask || !importTask.result || !importTask.result.form || !importTask.result.form.url) {
      throw new Error('Respons job tidak valid: upload form tidak tersedia.');
    }

    const formUrl = importTask.result.form.url;
    const formParams = importTask.result.form.parameters || {};

    const fd = new FormData();
    for (const key of Object.keys(formParams)) {
      fd.append(key, String(formParams[key]));
    }
    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
    fd.append('file', blob, fileName);

    const upRes = await fetch(formUrl, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT },
      body: fd
    });

    if (!upRes.ok) {
      const upErr = await upRes.text().catch(() => '');
      throw new Error(`Upload file ke FreeConvert gagal (${upRes.status}). ${upErr.slice(0, 200)}`);
    }

    const startTime = Date.now();
    while (Date.now() - startTime < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollRes = await fetch(`${BASE_API}/${jobId}`, {
        headers: {
          'User-Agent': USER_AGENT,
          'Origin': 'https://www.freeconvert.com',
          'Referer': 'https://www.freeconvert.com/'
        }
      }).catch(() => null);

      if (!pollRes || !pollRes.ok) continue;

      const currentJob = await pollRes.json().catch(() => null);
      if (!currentJob) continue;

      if (currentJob.status === 'completed') {
        const exportTask = (currentJob.tasks || []).find((t) => t.name === 'export-1');
        const resultUrl = exportTask && exportTask.result ? exportTask.result.url : null;
        if (!resultUrl) throw new Error('Konversi selesai tapi URL export tidak tersedia.');
        return sendJson(res, 200, {
          status: true,
          jobId,
          fileName,
          targetFormat: cleanFormat,
          fileSize: (exportTask.result && exportTask.result.size) || null,
          downloadUrl: resultUrl
        });
      }

      if (currentJob.status === 'failed') {
        const failedTask = (currentJob.tasks || []).find((t) => t.status === 'failed');
        const errMsg = (failedTask && failedTask.result && failedTask.result.msg) || 'Konversi gagal.';
        throw new Error(errMsg);
      }
    }

    throw new Error('Konversi memakan waktu terlalu lama. Coba file lebih kecil atau format lain.');
  } catch (err) {
    return sendJson(res, 500, {
      status: false,
      jobId,
      error: err && err.message ? err.message : 'Terjadi kesalahan saat konversi.'
    });
  }
}