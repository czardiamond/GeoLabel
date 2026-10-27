const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const APP_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_PAYLOAD_BYTES = 180 * 1024;
const VERSION = 1;

export function validateKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new TypeError('Invalid memory key');
  return key;
}
export function validateAppId(appId) {
  if (typeof appId !== 'string' || !APP_RE.test(appId)) throw new TypeError('Invalid appId');
  return appId;
}

function encodedSize(payload) { return new TextEncoder().encode(payload).length; }
function usableUser(user) { return !!(user && typeof user.uid === 'string' && user.uid && user.isAnonymous !== true); }
function serialize(value) {
  if (value === undefined) throw new TypeError('Memory value must not be undefined');
  let payload;
  try { payload = JSON.stringify(value); } catch { throw new TypeError('Memory value must be JSON-serializable'); }
  if (payload === undefined) throw new TypeError('Memory value must be JSON-serializable');
  if (encodedSize(payload) > MAX_PAYLOAD_BYTES) throw new RangeError('Memory payload exceeds 180KB');
  return payload;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

export function createMemoryClient({ appId, adapter }) {
  validateAppId(appId);
  if (!adapter || typeof adapter.onAuthStateChanged !== 'function') throw new TypeError('adapter.onAuthStateChanged is required');

  const listeners = new Set();
  const cache = new Map();
  let user = null, generation = 0, loading = true, error = null, destroyed = false, hasAuthState = false;
  let currentReady = deferred();
  let writeTail = Promise.resolve();
  let writeFailure = null;
  const ready = currentReady.promise;
  const snapshot = () => ({ user, authenticated: usableUser(user), loading, error, keys: [...cache.keys()] });
  const notify = () => { for (const fn of listeners) { try { fn(snapshot()); } catch {} } };
  const assertCurrent = (target, token) => {
    if (destroyed || token !== generation || user?.uid !== target?.uid || !usableUser(user)) throw new Error('Account changed during operation');
  };

  async function load(target, token) {
    if (!usableUser(target) || typeof adapter.load !== 'function') return;
    const records = await adapter.load(target.uid, appId);
    assertCurrent(target, token);
    const next = new Map();
    if (records && typeof records === 'object' && !Array.isArray(records)) {
      for (const [key, value] of Object.entries(records)) {
        try { validateKey(key); serialize(value); next.set(key, value); } catch {}
      }
    }
    cache.clear();
    for (const [key, value] of next) cache.set(key, value);
  }

  async function change(next) {
    if (destroyed) return;
    const token = ++generation;
    user = next || null;
    loading = true;
    error = null;
    cache.clear();
    if (hasAuthState) {
      currentReady.reject(new Error('Account changed during load'));
      currentReady = deferred();
    }
    hasAuthState = true;
    notify();
    try {
      await load(user, token);
      if (usableUser(user)) assertCurrent(user, token);
      error = null;
      currentReady.resolve(client);
    } catch (e) {
      if (token !== generation) return;
      error = e instanceof Error ? e : new Error(String(e));
      cache.clear();
      currentReady.reject(error);
    } finally {
      if (token === generation) { loading = false; notify(); }
    }
  }

  let unsubscribeAuth;
  try { unsubscribeAuth = adapter.onAuthStateChanged(value => { void change(value); }); }
  catch (e) { error = e instanceof Error ? e : new Error(String(e)); loading = false; currentReady.reject(error); notify(); }

  const client = {
    adapter,
    get appId() { return appId; },
    get ready() { return ready; },
    whenReady() { return currentReady.promise; },
    get user() { return user; },
    get authenticated() { return usableUser(user); },
    get loading() { return loading; },
    get error() { return error; },
    onAuth(fn) { listeners.add(fn); try { fn(snapshot()); } catch {} return () => listeners.delete(fn); },
    subscribe(fn) { return this.onAuth(fn); },
    get(key) { validateKey(key); return cache.get(key); },
    keys() { return [...cache.keys()]; },
    async set(key, value) {
      validateKey(key);
      const payload = serialize(value);
      const target = user, token = generation;
      if (!usableUser(target)) throw new Error('Authenticated non-anonymous user required');
      const wait = currentReady.promise;
      const operation = writeTail.then(async () => {
        await wait;
        assertCurrent(target, token);
        if (typeof adapter.set !== 'function') throw new Error('Adapter does not support writes');
        assertCurrent(target, token);
        await adapter.set(target.uid, appId, key, { payload, schemaVersion: VERSION });
        assertCurrent(target, token);
        cache.set(key, JSON.parse(payload));
        notify();
        return JSON.parse(payload);
      });
      writeTail = operation.catch(error => { writeFailure = error; });
      return operation;
    },
    async remove(key) {
      validateKey(key);
      const target = user, token = generation;
      if (!usableUser(target)) throw new Error('Authenticated non-anonymous user required');
      const wait = currentReady.promise;
      const operation = writeTail.then(async () => {
        await wait;
        assertCurrent(target, token);
        if (typeof adapter.remove !== 'function') throw new Error('Adapter does not support deletes');
        assertCurrent(target, token);
        await adapter.remove(target.uid, appId, key);
        assertCurrent(target, token);
        cache.delete(key); notify();
      });
      writeTail = operation.catch(error => { writeFailure = error; });
      return operation;
    },
    async flush() { await writeTail; if (writeFailure) throw writeFailure; },
    destroy() { destroyed = true; generation++; cache.clear(); listeners.clear(); unsubscribeAuth?.(); }
  };
  return client;
}
export const constants = { MAX_PAYLOAD_BYTES, VERSION, KEY_RE, APP_RE };
