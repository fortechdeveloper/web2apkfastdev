// api/uc.js
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractPwdId(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  const match = clean.match(/\/s\/([a-zA-Z0-9]+)/) || clean.match(/^([a-zA-Z0-9]{8,32})$/);
  return match ? match[1] : null;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function extract(inputUrl, options = {}) {
  if (!inputUrl || typeof inputUrl !== 'string' || !inputUrl.trim()) {
    throw new Error('URL atau kode UC Share tidak boleh kosong');
  }

  const pwdId = extractPwdId(inputUrl);
  if (!pwdId) {
    throw new Error('URL atau kode UC Share tidak valid. Contoh: https://uc-share.com/s/331d1c222fd54');
  }

  const passcode = options.passcode || '';

  const detailRes = await fetch('https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/v2/detail?pr=UCBrowser&fr=h5', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'Origin': 'https://drive.ucweb.com',
      'Referer': `https://drive.ucweb.com/s/${pwdId}?la=id`
    },
    body: JSON.stringify({
      pwd_id: pwdId,
      passcode: passcode,
      force: 0,
      page: 1,
      size: 50,
      fetch_banner: 1,
      fetch_share: 1,
      fetch_total: 1,
      sort: '',
      banner_platform: 'others',
      fetch_error_background: 1,
      web_platform: 'ios',
      fetch_follow_status: 1,
      ip_limit: ''
    })
  });

  const detailJson = await detailRes.json().catch(() => ({}));
  if (detailJson.code !== 0) {
    if (detailJson.code === 14002 || (detailJson.message && detailJson.message.toLowerCase().includes('passcode'))) {
      throw new Error('Share link ini memerlukan kata sandi / passcode');
    }
    throw new Error(detailJson.message || `Gagal mengambil data share (code ${detailJson.code})`);
  }

  const data = detailJson.data || {};
  const tokenInfo = data.token_info || {};
  const shareInfo = data.detail_info && data.detail_info.share ? data.detail_info.share : {};
  const stoken = tokenInfo.stoken || '';

  const rootList = data.detail_info && data.detail_info.list ? data.detail_info.list : [];
  const queue = [...rootList];
  const files = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.dir) {
      const subRes = await fetch(`https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/detail?pwd_id=${pwdId}&stoken=${encodeURIComponent(stoken)}&pdir_fid=${current.fid}&force=0&_page=1&_size=100&_fetch_banner=0&_fetch_share=0&_fetch_total=1&_sort=&pr=UCBrowser&fr=h5`, {
        headers: {
          'User-Agent': USER_AGENT,
          'Origin': 'https://drive.ucweb.com',
          'Referer': `https://drive.ucweb.com/s/${pwdId}?la=id`
        }
      });
      const subJson = await subRes.json().catch(() => ({}));
      if (subJson.data && subJson.data.list) {
        queue.push(...subJson.data.list);
      }
    } else {
      let downloadUrl = null;
      let streamUrl = null;
      let previewImage = current.thumbnail || null;
      let videoMeta = null;

      const isVideo = current.category === 1 || current.file_type === 1 || (current.format_type && current.format_type.includes('video')) || (current.file_name && current.file_name.match(/\.(mp4|mkv|mov|avi|flv|webm|m4v|3gp)$/i));

      if (isVideo && current.share_fid_token) {
        try {
          const vpParams = new URLSearchParams({
            pwd_id: pwdId,
            stoken: stoken,
            fid: current.fid,
            fid_token: current.share_fid_token,
            pr: 'UCBrowser',
            fr: 'h5'
          });
          const vpRes = await fetch(`https://m-intldrive.ucweb.com/1/clouddrive/share/sharepage/video_preview?${vpParams.toString()}`, {
            headers: {
              'x-clouddrive-st': stoken,
              'User-Agent': USER_AGENT,
              'Origin': 'https://drive.ucweb.com',
              'Referer': `https://drive.ucweb.com/s/${pwdId}?la=id`
            }
          });
          const vpJson = await vpRes.json();
          if (vpJson.data && vpJson.data.play_info && vpJson.data.play_info.url) {
            downloadUrl = vpJson.data.play_info.url;
            streamUrl = vpJson.data.play_info.url;
            previewImage = vpJson.data.preview_url || previewImage;
            videoMeta = {
              duration: vpJson.data.duration || current.duration || 0,
              resolution: vpJson.data.play_info.resolution || null,
              width: vpJson.data.play_info.width || current.video_width || null,
              height: vpJson.data.play_info.height || current.video_height || null,
              bitrate: vpJson.data.play_info.bitrate || null,
              codec: vpJson.data.play_info.codec || null,
              fps: vpJson.data.play_info.fps || null
            };
          }
        } catch (_) {}
      }

      files.push({
        fid: current.fid,
        file_name: current.file_name,
        size: current.size,
        size_formatted: formatBytes(current.size),
        format_type: current.format_type || '',
        thumbnail: previewImage,
        stream_url: streamUrl,
        download_url: downloadUrl,
        video: videoMeta
      });
    }
  }

  return {
    Creator: 'IzzXd',
    Saluran: 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K',
    status: true,
    source: inputUrl,
    pwd_id: pwdId,
    title: tokenInfo.title || shareInfo.title || 'UC Drive Share',
    author: {
      nickname: tokenInfo.author && tokenInfo.author.nick_name ? tokenInfo.author.nick_name : null,
      avatar: tokenInfo.author && tokenInfo.author.avatar_url ? tokenInfo.author.avatar_url : null
    },
    total_files: files.length,
    total_size: shareInfo.size || 0,
    total_size_formatted: formatBytes(shareInfo.size || 0),
    created_at: shareInfo.created_at || null,
    expired_at: shareInfo.expired_at || null,
    files: files
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: false, error: 'Gunakan metode POST.' });
  }

  const { url, passcode } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ status: false, error: 'URL atau kode UC Share wajib diisi.' });
  }

  try {
    const result = await extract(url, { passcode: passcode || '' });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ status: false, error: err.message || 'Gagal mengambil data UC Share.' });
  }
}