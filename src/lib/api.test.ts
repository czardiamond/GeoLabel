import assert from 'node:assert/strict';
import test from 'node:test';
import { formatApiError, normalizeApiBase, readApiResponse } from './api.ts';

test('normalizes HTTPS API base URLs and optional path prefixes', () => {
  assert.equal(normalizeApiBase('https://api.example.test/'), 'https://api.example.test');
  assert.equal(normalizeApiBase('https://api.example.test/geolabel/v1/'), 'https://api.example.test/geolabel/v1');
});

test('allows plain HTTP only for loopback development hosts', () => {
  assert.equal(normalizeApiBase('http://localhost:8000/'), 'http://localhost:8000');
  assert.equal(normalizeApiBase('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  assert.equal(normalizeApiBase('http://[::1]:8000'), 'http://[::1]:8000');
  assert.throws(() => normalizeApiBase('http://api.example.test'), /Use HTTPS/);
  assert.throws(() => normalizeApiBase('http://localhost.example.test:8000'), /Use HTTPS/);
});

test('allows safe same-origin API paths for a co-hosted deployment', () => {
  assert.equal(normalizeApiBase('/api/'), '/api');
  assert.equal(normalizeApiBase('/geolabel/v1'), '/geolabel/v1');
  assert.throws(() => normalizeApiBase('//api.example.test'), /absolute HTTPS API URL/);
  assert.throws(() => normalizeApiBase('/api?token=secret'), /same-origin API path/);
  assert.throws(() => normalizeApiBase('/api/../admin'), /same-origin API path/);
});

test('rejects non-HTTPS schemes, embedded credentials, query strings, and fragments', () => {
  assert.throws(() => normalizeApiBase('ftp://api.example.test'), /Use HTTPS/);
  assert.throws(() => normalizeApiBase('https://user:secret@api.example.test'), /must not contain embedded credentials/);
  assert.throws(() => normalizeApiBase('https://api.example.test?token=secret'), /must not contain/);
  assert.throws(() => normalizeApiBase('https://api.example.test/#private'), /must not contain/);
  assert.throws(() => normalizeApiBase('relative/path'), /absolute HTTPS API URL/);
});

test('formats FastAPI invitation validation details with field names, without echoing submitted secrets', () => {
  const body = { detail: [
    { loc: ['body', 'password'], msg: 'String should have at least 12 characters', type: 'string_too_short', input: 'private-password', ctx: { min_length: 12 } },
    { loc: ['body', 'display_name'], msg: 'String should have at least 2 characters', input: 'X' },
    { loc: ['body', 'token'], msg: 'String should have at least 32 characters', input: 'private-invitation-token' },
  ] };
  const text = formatApiError(body, 422);
  assert.equal(text, 'Password: String should have at least 12 characters; Display name: String should have at least 2 characters; Token: String should have at least 32 characters');
  assert.doesNotMatch(text, /\[object Object\]|private-password|private-invitation-token|input|ctx/);
});

test('preserves string auth errors and handles nested structured messages', () => {
  assert.equal(formatApiError({ detail: 'Email or password is incorrect.' }, 401), 'Email or password is incorrect.');
  assert.equal(formatApiError({ detail: { message: 'This invitation is invalid, expired, or already used.' } }, 400), 'This invitation is invalid, expired, or already used.');
  assert.equal(formatApiError({ message: 'Please try again later.' }, 429), 'Please try again later.');
  assert.equal(formatApiError('Service unavailable', 503), 'Service unavailable');
});

test('uses a status fallback for unknown or empty errors instead of stringifying objects', () => {
  for (const body of [null, '', [], {}, { detail: {} }, { input: 'private-password', ctx: { secret: 'private-token' } }]) {
    assert.equal(formatApiError(body, 422), 'Request failed (422)');
  }
});

test('workspace response parser rejects a 422 with the readable field validation message', async () => {
  const response = Response.json({ detail: [{ loc: ['body', 'password'], msg: 'String should have at least 12 characters', input: 'private-password' }] }, { status: 422 });
  await assert.rejects(readApiResponse(response), { name: 'Error', message: 'Password: String should have at least 12 characters' });
});

test('workspace response parser preserves 401 errors and supports empty and non-JSON error bodies', async () => {
  await assert.rejects(readApiResponse(Response.json({ detail: 'Email or password is incorrect.' }, { status: 401 })), { message: 'Email or password is incorrect.' });
  await assert.rejects(readApiResponse(new Response('', { status: 502 })), { message: 'Request failed (502)' });
  await assert.rejects(readApiResponse(new Response('Upstream unavailable', { status: 503 })), { message: 'Upstream unavailable' });
});

test('workspace response parser leaves successful JSON and empty responses unchanged', async () => {
  assert.deepEqual(await readApiResponse(Response.json({ user: { id: 'test-user' }, organizations: [] })), { user: { id: 'test-user' }, organizations: [] });
  assert.equal(await readApiResponse(new Response(null, { status: 204 })), null);
});
