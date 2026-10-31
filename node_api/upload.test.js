import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.js';

const env = { GEOLABEL_BACKEND_URL: 'https://internal.example/', BLOB_READ_WRITE_TOKEN: 'test-only' };
const intent = { dataset_id: 'dataset_1', asset_id: 'asset_1', filename: 'tile.png', content_type: 'image/png', size_bytes: 123 };
const pathname = 'geolabel/org/dataset_1/asset_1/original_tile.png';
const body = { type: 'blob.generate-client-token', payload: { pathname, clientPayload: JSON.stringify(intent) } };
const authorized = () => ({ pathname, content_type: 'image/png', maximum_size_bytes: 123, allowed_content_types: ['image/png'], valid_until_ms: Date.now() + 60000 });

async function start(t, options = {}) {
  const app = createApp({ env, ...options });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (requestBody = body, headers = { authorization: 'Bearer member-session' }) => fetch(`http://127.0.0.1:${server.address().port}/api/blob-upload`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(requestBody),
  });
}

const invokeToken = async options => {
  const constraints = await options.onBeforeGenerateToken(options.body.payload.pathname, options.body.payload.clientPayload);
  return { type: 'blob.generate-client-token', constraints };
};

test('missing configuration, missing member token, and cross-origin requests fail before SDK execution', async t => {
  let calls = 0;
  const uploadHandler = async () => { calls++; throw new Error('must not run'); };
  const missing = await start(t, { env: {}, uploadHandler });
  assert.equal((await missing()).status, 503);
  const request = await start(t, { uploadHandler });
  assert.equal((await request(body, {})).status, 401);
  assert.equal((await request(body, { authorization: 'Bearer member-session', origin: 'https://untrusted.example' })).status, 403);
  assert.equal(calls, 0);
});

test('token constraints come from the same authenticated intent with exact bytes, MIME and expiry', async t => {
  let observed;
  const request = await start(t, {
    uploadHandler: invokeToken,
    fetchBackend: async (url, options) => {
      assert.equal(url.pathname, '/api/datasets/dataset_1/assets/upload-authorize');
      assert.equal(options.headers.authorization, 'Bearer member-session');
      assert.deepEqual(JSON.parse(options.body), { asset_id: 'asset_1', filename: 'tile.png', content_type: 'image/png', size_bytes: 123 });
      observed = authorized();
      return { ok: true, json: async () => observed };
    },
  });
  const response = await request();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.constraints.allowedContentTypes, ['image/png']);
  assert.equal(result.constraints.maximumSizeInBytes, 123);
  assert.equal(result.constraints.validUntil, observed.valid_until_ms);
  assert.equal(result.constraints.allowOverwrite, false);
  assert.equal(result.constraints.addRandomSuffix, false);
});

test('mismatched path, oversized authorization and expired intent are rejected without upstream details', async t => {
  for (const patch of [{ pathname: 'geolabel/other/file' }, { maximum_size_bytes: 999 }, { valid_until_ms: 1 }]) {
    const request = await start(t, { uploadHandler: invokeToken, fetchBackend: async () => ({ ok: true, json: async () => ({ ...authorized(), ...patch }) }) });
    const response = await request();
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'The private upload request could not be authorized.' });
  }
});

test('backend denial prevents token issuance and does not leak provider errors', async t => {
  const request = await start(t, { uploadHandler: invokeToken, fetchBackend: async () => ({ ok: false }) });
  const response = await request();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'The private upload request could not be authorized.');
});

test('forged completion callbacks are verified and rejected by the real official SDK', async t => {
  const request = await start(t, { fetchBackend: async () => { throw new Error('completion must not authorize a new upload'); } });
  const response = await request({ type: 'blob.upload-completed', payload: {} }, {});
  assert.equal(response.status, 400);
});
