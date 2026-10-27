// api/_auth.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

export async function verifyUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) { const e = new Error('missing-token'); e.status = 401; throw e; }
  try { return await admin.auth().verifyIdToken(token); }
  catch (e) { const err = new Error('invalid-token'); err.status = 401; throw err; }
}

export async function getUserProfile(uid) {
  const snap = await admin.database().ref('profiles/' + uid).get();
  if (!snap.exists()) return null;
  return { id: uid, ...snap.val() };
}

export async function requireUser(req) {
  const decoded = await verifyUser(req);
  const profile = await getUserProfile(decoded.uid);
  const role = (profile && profile.role) || 'free';
  return { user: decoded, profile, role };
}

export function adminDb() { return admin.database(); }