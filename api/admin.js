// api/admin.js
import { requireUser, adminDb } from './_auth.js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'fortech.developer@gmail.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ROLE_WHITELIST = ['free', 'pro', 'promax'];
const MAX_LIST = 200;

function sendJson(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function isAdmin(auth) {
  const email = (auth?.user?.email || '').toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return true;
  if (auth?.role === 'promax') return true;
  return false;
}

function sanitizeProfile(uid, raw) {
  const p = raw || {};
  const username = typeof p.username === 'string' ? p.username : '';
  const whatsapp = typeof p.whatsapp === 'string' ? p.whatsapp : null;
  const role = ROLE_WHITELIST.includes(p.role) ? p.role : 'free';
  const created_at = typeof p.created_at === 'string' ? p.created_at : null;
  const updated_at = typeof p.updated_at === 'string' ? p.updated_at : null;
  return {
    uid,
    username,
    username_lower: typeof p.username_lower === 'string' ? p.username_lower : username.toLowerCase(),
    whatsapp,
    role,
    created_at,
    updated_at
  };
}

async function listUsers(search) {
  const db = adminDb();
  const snap = await db.ref('profiles').once('value');
  const val = snap.val() || {};
  const all = Object.keys(val).map((uid) => sanitizeProfile(uid, val[uid]));

  const q = String(search || '').trim().toLowerCase();
  const filtered = q
    ? all.filter((u) =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.username_lower || '').includes(q) ||
        (u.uid || '').toLowerCase().includes(q)
      )
    : all;

  filtered.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return filtered.slice(0, MAX_LIST);
}

async function listEmails(uids) {
  const auth = adminDb().app.auth();
  const out = {};
  const chunks = [];
  for (let i = 0; i < uids.length; i += 100) chunks.push(uids.slice(i, i + 100));
  for (const chunk of chunks) {
    try {
      const result = await auth.getUsers(chunk.map((uid) => ({ uid })));
      result.users.forEach((u) => { if (u) out[u.uid] = u.email || ''; });
    } catch (_) {}
  }
  return out;
}

async function updateRole(targetUid, newRole) {
  if (!targetUid || typeof targetUid !== 'string') {
    const e = new Error('targetUid wajib diisi.'); e.status = 400; throw e;
  }
  if (!ROLE_WHITELIST.includes(newRole)) {
    const e = new Error('Role tidak valid. Gunakan free, pro, atau promax.'); e.status = 400; throw e;
  }
  const db = adminDb();
  const targetRef = db.ref('profiles/' + targetUid);
  const snap = await targetRef.get();
  if (!snap.exists()) {
    const e = new Error('User tidak ditemukan.'); e.status = 404; throw e;
  }
  await targetRef.update({ role: newRole, updated_at: new Date().toISOString() });
  return { uid: targetUid, role: newRole };
}

async function getStats() {
  const db = adminDb();
  const snap = await db.ref('profiles').once('value');
  const val = snap.val() || {};
  const total = Object.keys(val).length;
  let free = 0, pro = 0, promax = 0;
  for (const uid in val) {
    const r = val[uid] && val[uid].role;
    if (r === 'promax') promax++;
    else if (r === 'pro') pro++;
    else free++;
  }
  return { total, free, pro, promax };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, error: 'Gunakan metode POST.' });
  }

  let auth;
  try {
    auth = await requireUser(req);
  } catch (err) {
    return sendJson(res, err.status || 401, { success: false, error: err.message });
  }

  if (!isAdmin(auth)) {
    return sendJson(res, 403, { success: false, error: 'Akses ditolak. Halaman ini hanya untuk admin.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || '').trim();

  try {
    if (action === 'stats') {
      const stats = await getStats();
      return sendJson(res, 200, { success: true, stats });
    }

    if (action === 'list') {
      const search = typeof body.search === 'string' ? body.search : '';
      const users = await listUsers(search);
      const emails = await listEmails(users.map((u) => u.uid));
      const enriched = users.map((u) => ({ ...u, email: emails[u.uid] || '' }));
      return sendJson(res, 200, { success: true, total: enriched.length, users: enriched });
    }

    if (action === 'update_role') {
      const result = await updateRole(body.targetUid, body.role);
      return sendJson(res, 200, { success: true, ...result });
    }

    return sendJson(res, 400, { success: false, error: 'Action tidak valid.' });
  } catch (err) {
    console.error('[admin] error:', err);
    return sendJson(res, err.status || 500, { success: false, error: err.message || 'Terjadi kesalahan server.' });
  }
}