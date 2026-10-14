import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApiBase } from './api.ts';

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

test('rejects non-HTTPS schemes, embedded credentials, query strings, and fragments', () => {
  assert.throws(() => normalizeApiBase('ftp://api.example.test'), /Use HTTPS/);
  assert.throws(() => normalizeApiBase('https://user:secret@api.example.test'), /must not contain embedded credentials/);
  assert.throws(() => normalizeApiBase('https://api.example.test?token=secret'), /must not contain/);
  assert.throws(() => normalizeApiBase('https://api.example.test/#private'), /must not contain/);
  assert.throws(() => normalizeApiBase('/relative/path'), /absolute API URL/);
});
