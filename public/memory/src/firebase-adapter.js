const V = '12.19.0';
const [appMod, authMod, fsMod] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
]);
const { initializeApp, getApps } = appMod;
const { initializeAuth, getAuth, browserSessionPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, onAuthStateChanged } = authMod;
const { initializeFirestore, collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp, memoryLocalCache } = fsMod;
import { validateFirebaseBinding } from './firebase-config.js';

export { validateFirebaseBinding } from './firebase-config.js';

export function createFirebaseAdapter(config, binding) {
  const bound = validateFirebaseBinding(config, binding);
  const firebaseAppName = `auth-memory:${bound.appId}`;
  const existing = getApps().find(a => a.name === firebaseAppName);
  if (existing) {
    if (existing.options?.projectId !== bound.expectedProjectId || existing.options?.projectId !== config.projectId) {
      throw new Error('Firebase app binding is already attached to a different project');
    }
    for (const field of ['apiKey', 'authDomain', 'appId']) {
      if (existing.options?.[field] !== config[field]) throw new Error('Firebase app binding config does not match the existing Firebase app');
    }
  }
  const app = existing || initializeApp(config, firebaseAppName);
  let auth;
  try { auth = initializeAuth(app, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver }); }
  catch (e) {
    // A second adapter for the same Firebase app reuses the existing Auth instance.
    if (!/already been initialized|already exists/i.test(String(e?.message))) throw e;
    auth = getAuth(app);
  }
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  const records = (uid, appId) => {
    if (appId !== bound.appId) throw new Error('Memory app namespace does not match the bound app ID');
    return collection(db, 'users', uid, 'apps', appId, 'records');
  };
  return {
    auth, db,
    onAuthStateChanged(fn) { return onAuthStateChanged(auth, fn); },
    currentUser() { return auth.currentUser; },
    async load(uid, appId) {
      const snapshot = await getDocs(records(uid, appId)); const out = {};
      snapshot.forEach(s => { const d = s.data(); try { out[s.id] = JSON.parse(d.payload); } catch {} });
      return out;
    },
    async set(uid, appId, key, { payload, schemaVersion }) { await setDoc(doc(records(uid, appId), key), { payload, schemaVersion, updatedAt: serverTimestamp() }); },
    async remove(uid, appId, key) { await deleteDoc(doc(records(uid, appId), key)); },
    signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider()); },
    signInEmail(email, password) { return signInWithEmailAndPassword(auth, email, password); },
    signUpEmail(email, password) { return createUserWithEmailAndPassword(auth, email, password); },
    signOut() { return signOut(auth); },
    resetPassword(email) { return sendPasswordResetEmail(auth, email); }
  };
}
export const FIREBASE_SDK_VERSION = V;
