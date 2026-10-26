import gplayModule from 'google-play-scraper';

const gplay = gplayModule.default || gplayModule;
const CREATOR = 'IzzXd';
const SALURAN = 'https://whatsapp.com/channel/0029VbCv97v9Bb5tC5cZFl0K';

function formatApp(app) {
    if (!app) return null;
    const appId = app.appId || '';

    return {
        title: app.title || '',
        appId: appId,
        url: app.url || `https://play.google.com/store/apps/details?id=${appId}`,
        links: {
            playStore: `https://play.google.com/store/apps/details?id=${appId}`,
            market: `market://details?id=${appId}`,
            apkCombo: `https://apkcombo.com/app/${appId}/download/apk`,
            apkPure: `https://apkpure.com/p/${appId}`
        },
        developer: {
            name: app.developer || '',
            id: app.developerId || '',
            email: app.developerEmail || null,
            website: app.developerWebsite || null,
            address: app.developerAddress || null
        },
        score: app.score || 0,
        scoreText: app.scoreText || String(app.score || '0'),
        ratings: app.ratings || 0,
        reviews: app.reviews || 0,
        installs: app.installs || '0+',
        minInstalls: app.minInstalls || 0,
        maxInstalls: app.maxInstalls || 0,
        price: app.price || 0,
        free: !!app.free,
        currency: app.currency || 'USD',
        priceText: app.priceText || (app.free ? 'Gratis' : `${app.price}`),
        genre: app.genre || '',
        genreId: app.genreId || '',
        categories: Array.isArray(app.categories) ? app.categories.map(c => c.name || c) : [],
        icon: app.icon || '',
        headerImage: app.headerImage || '',
        screenshots: Array.isArray(app.screenshots) ? app.screenshots : [],
        video: app.video || null,
        previewVideo: app.previewVideo || null,
        version: app.version || 'Varies with device',
        updated: app.updated ? new Date(app.updated).toISOString() : (app.released || null),
        released: app.released || null,
        contentRating: app.contentRating || '',
        summary: app.summary || '',
        description: app.description || '',
        recentChanges: app.recentChanges || ''
    };
}

export default async function handler(req, res) {
    // CORS Setup (biar aman)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { action, query, appId } = req.body;

    try {
        if (action === 'search') {
            if (!query) throw new Error('Kata kunci pencarian tidak boleh kosong');
            const results = await gplay.search({ term: query, num: 12, lang: 'id', country: 'id', fullDetail: true });
            const apps = results.map(formatApp).filter(Boolean);
            
            return res.status(200).json({
                Creator: CREATOR, Saluran: SALURAN, status: true,
                query: query, total: apps.length, results: apps
            });
        } 
        
        if (action === 'detail') {
            if (!appId) throw new Error('ID paket atau link Play Store tidak boleh kosong');
            let cleanAppId = appId.trim();
            const match = cleanAppId.match(/[?&]id=([a-zA-Z0-9._]+)/i);
            if (match) cleanAppId = match[1];

            const rawApp = await gplay.app({ appId: cleanAppId, lang: 'id', country: 'id' });
            return res.status(200).json({
                Creator: CREATOR, Saluran: SALURAN, status: true,
                data: formatApp(rawApp)
            });
        }

        return res.status(400).json({ success: false, error: 'Action tidak valid.' });

    } catch (err) {
        return res.status(500).json({ Creator: CREATOR, Saluran: SALURAN, status: false, error: err.message });
    }
}