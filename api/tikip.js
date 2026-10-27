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

    const json = await response.json();
    
    if (json.status === "error" || !json.data || !json.data.user) {
      throw new Error(json.error || 'Username tidak ditemukan atau akun private.');
    }

    const rawUser = json.data.user;
    const rawStats = json.data.stats || {};
    const regionCode = json.data.region || rawUser.current_region || null;
    const regionName = json.data.region_name || rawUser.current_region_name || null;

    // Fix 32-bit signed integer overflow pada heartCount TikTok
    let likes = rawStats.heartCount || 0;
    if (typeof likes === "number" && likes < 0) {
      likes = likes >>> 0;
    }

    let createdAtIso = null;
    if (rawUser.createTime) {
      try { createdAtIso = new Date(rawUser.createTime * 1000).toISOString(); } catch {}
    }

    // Kembalikan data yang udah dirapihin persis kayak script Node.js
    return res.status(200).json({
      user: {
        id: rawUser.id || null,
        username: rawUser.uniqueId || username,
        nickname: rawUser.nickname || null,
        sec_uid: rawUser.secUid || null,
        bio: rawUser.signature || null,
        bio_link: rawUser.bioLink ? rawUser.bioLink.link : null,
        verified: Boolean(rawUser.verified),
        private: Boolean(rawUser.privateAccount),
        language: rawUser.language || null,
        created_at: createdAtIso,
        profile_url: `https://www.tiktok.com/@${rawUser.uniqueId || username}`
      },
      region: {
        code: regionCode,
        country: regionName,
        current_region: rawUser.current_region || null,
        registered_region: rawUser.registered_region || null,
        locked_region: rawUser.locked_region || null
      },
      stats: {
        followers: rawStats.followerCount || 0,
        following: rawStats.followingCount || 0,
        likes: likes,
        videos: rawStats.videoCount || 0
      },
      avatar: {
        hd: rawUser.avatarLarger || null,
        medium: rawUser.avatarMedium || null
      }
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gagal mengambil data dari server.' });
  }
}