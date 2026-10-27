export function installWidget(client, { mount = document.body, appName = 'Account' } = {}) {
  const host = document.createElement('div');
  host.setAttribute('aria-label', `${appName} account`);
  const root = host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./widget.css', import.meta.url).href;
  root.append(stylesheet);
  const container = document.createElement('div');
  container.innerHTML = `<div class="account"><button id="open" type="button">Account</button><dialog id="dialog" aria-labelledby="title"><form method="dialog" id="form"><h2 id="title">${appName}</h2><p id="status" role="status" aria-live="polite"></p><div id="auth"><label>Email <input id="email" type="email" autocomplete="email" required></label><label>Password <input id="password" type="password" autocomplete="current-password" required></label><menu><button id="signin" type="button">Sign in</button><button id="signup" type="button">Sign up</button><button id="reset" type="button">Reset password</button></menu><button id="google" type="button">Continue with Google</button></div><div id="signed" hidden><p id="who"></p><label>Private notes<textarea id="notes" autocomplete="off"></textarea></label><menu><button id="save" type="button">Save notes</button><button id="clear" type="button">Clear</button><button id="out" type="button">Sign out</button></menu></div><button id="close" type="submit">Close</button></form></dialog></div>`;
  root.append(container);
  const $ = id => root.getElementById(id);
  let dirty = false, lastUid = null;
  const status = text => { $('status').textContent = text || ''; };
  const clearAuthInputs = () => { $('email').value = ''; $('password').value = ''; };
  const run = async fn => { try { await fn(); } catch (e) { status(e?.message || 'Something went wrong.'); } };
  const open = (mode = 'signin') => { const d = $('dialog'); if (!d.open) d.showModal(); if (mode === 'signup') $('password').autocomplete = 'new-password'; else $('password').autocomplete = 'current-password'; if (!client.authenticated) $('email').focus(); };
  const refresh = ({ user, authenticated, loading, error }) => {
    $('open').textContent = authenticated ? (user.displayName || user.email || 'Account') : 'Account';
    $('auth').hidden = authenticated; $('signed').hidden = !authenticated;
    if (authenticated) {
      if (lastUid !== null && lastUid !== user.uid) clearAuthInputs();
      $('password').value = '';
      $('who').textContent = `Signed in as ${user.email || user.uid}`;
      if (lastUid !== user.uid) { lastUid = user.uid; dirty = false; $('notes').value = client.get('private-notes') || ''; }
      else if (!dirty && client.keys().includes('private-notes')) $('notes').value = client.get('private-notes') || '';
      status(loading ? 'Loading private memory…' : error ? error.message : '');
    } else { lastUid = null; dirty = false; $('notes').value = ''; clearAuthInputs(); status(loading ? 'Checking account…' : 'Sign in to use private memory.'); }
  };
  $('open').onclick = () => open('signin'); $('close').onclick = () => $('dialog').close();
  $('signin').onclick = () => run(() => client.adapter.signInEmail($('email').value, $('password').value));
  $('signup').onclick = () => run(() => { $('password').autocomplete = 'new-password'; return client.adapter.signUpEmail($('email').value, $('password').value); });
  $('reset').onclick = () => run(async () => { await client.adapter.resetPassword($('email').value); status('Password reset email sent.'); });
  $('google').onclick = () => run(() => client.adapter.signInGoogle());
  $('out').onclick = () => run(() => client.adapter.signOut());
  $('notes').oninput = () => { dirty = true; };
  $('save').onclick = () => run(async () => { await client.set('private-notes', $('notes').value); dirty = false; status('Saved privately.'); });
  $('clear').onclick = () => run(async () => { await client.remove('private-notes'); $('notes').value = ''; dirty = false; status('Cleared.'); });
  const unsubscribe = client.subscribe(refresh); mount.append(host);
  return { host, open, destroy() { unsubscribe?.(); host.remove(); } };
}
