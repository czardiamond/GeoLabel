(function () {
  const script = document.currentScript;
  const base = new URL('.', script && script.src ? script.src : location.href);
  const config = window.PROJECT_MEMORY_CONFIG;
  const state = { user: null, authenticated: false, loading: true, error: null, keys: [] };
  window.projectMemoryState = state;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  ready.catch(() => {});
  window.projectMemoryReady = ready;
  const pendingListeners = new Set();
  const transferred = new Map();
  const queuedOpens = [];
  let client = null;
  let widget = null;

  const snapshot = () => ({ ...state, keys: [...state.keys] });
  function notifyFacade() {
    const next = snapshot();
    for (const fn of pendingListeners) { try { fn(next); } catch {} }
  }
  function emit(name) {
    window.dispatchEvent(new CustomEvent(name, { detail: snapshot() }));
    notifyFacade();
  }
  function loadStylesheet(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    (document.head || document.body).append(link);
    return link;
  }
  loadStylesheet(new URL('./src/widget.css', base).href);

  // Publish a closed, API-compatible object before the async module import.
  // Its listeners are moved to the real client only after successful setup.
  const delegate = (name, fallback) => (...args) => {
    if (client && typeof client[name] === 'function') return client[name](...args);
    return fallback(...args);
  };
  const facade = {
    get adapter() { return client?.adapter; },
    get appId() { return client?.appId ?? config?.appId; },
    get ready() { return client?.ready ?? ready; },
    whenReady: delegate('whenReady', () => ready),
    get user() { return client?.user ?? state.user; },
    get authenticated() { return client?.authenticated ?? state.authenticated; },
    get loading() { return client?.loading ?? state.loading; },
    get error() { return client?.error ?? state.error; },
    onAuth(fn) {
      if (typeof fn !== 'function') throw new TypeError('Auth listener must be a function');
      if (client) {
        let unsubscribe;
        try { unsubscribe = client.subscribe(fn); } catch {}
        return () => { try { unsubscribe?.(); } catch {} };
      }
      pendingListeners.add(fn);
      try { fn(snapshot()); } catch {}
      return () => {
        pendingListeners.delete(fn);
        const unsubscribe = transferred.get(fn);
        if (unsubscribe) { transferred.delete(fn); try { unsubscribe(); } catch {} }
      };
    },
    subscribe(fn) { return this.onAuth(fn); },
    get: delegate('get', () => undefined),
    keys: delegate('keys', () => []),
    set: delegate('set', () => Promise.reject(new Error('Authenticated non-anonymous user required'))),
    remove: delegate('remove', () => Promise.reject(new Error('Authenticated non-anonymous user required'))),
    flush: delegate('flush', () => Promise.resolve()),
    destroy: delegate('destroy', () => {})
  };
  window.projectMemory = facade;

  function validConfig() {
    return !!(config && typeof config === 'object' && config.appId && config.appName &&
      config.firebaseConfig && typeof config.firebaseConfig === 'object' && config.expectedProjectId);
  }
  function pending() {
    state.loading = false;
    state.error = new Error('Account setup pending');
    emit('project-memory-change');
    resolveReady(null);
    const host = document.createElement('div');
    host.className = 'project-memory-pending';
    host.textContent = 'Account setup pending';
    document.body.append(host);
  }
  function fail(error) {
    state.loading = false;
    state.error = error instanceof Error ? error : new Error(String(error));
    emit('project-memory-change');
    resolveReady(null);
  }
  function transferSubscriptions(real) {
    for (const fn of [...pendingListeners]) {
      pendingListeners.delete(fn);
      try { transferred.set(fn, real.subscribe(fn)); } catch {}
    }
  }
  function flushOpens() {
    const opens = queuedOpens.splice(0);
    for (const mode of opens) { try { widget.open(mode); } catch {} }
  }

  window.openProjectAccount = mode => {
    const requested = mode === 'signup' ? 'signup' : 'signin';
    if (widget) { try { widget.open(requested); } catch {} return; }
    // Never turn an inactive/malformed configuration into a sign-in attempt.
    if (validConfig()) queuedOpens.push(requested);
  };

  if (!validConfig()) { pending(); return; }
  import(new URL('./src/index.js', base).href).then(({ createFirebaseAdapter, createMemoryClient, installWidget }) => {
    const adapter = createFirebaseAdapter(config.firebaseConfig, { appId: config.appId, expectedProjectId: config.expectedProjectId });
    const next = createMemoryClient({ appId: config.appId, adapter });
    const nextWidget = installWidget(next, { mount: document.body, appName: config.appName });
    client = next;
    widget = nextWidget;
    window.projectMemory = next;
    transferSubscriptions(next);
    next.subscribe(nextState => { Object.assign(state, nextState); emit('project-memory-change'); });
    flushOpens();
    return next.whenReady().catch(() => next).then(() => {
      emit('project-memory-ready');
      resolveReady(next);
      return next;
    });
  }).catch(fail);
})();
