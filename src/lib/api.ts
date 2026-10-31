const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeApiBase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (trimmed.includes('\\') || trimmed.includes('?') || trimmed.includes('#') || trimmed.split('/').includes('..')) {
      throw new Error('A same-origin API path must not contain a query, fragment, backslash, or parent traversal.');
    }
    let path = trimmed;
    while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Enter an absolute HTTPS API URL or a same-origin path such as /api.');
  }

  const isLoopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('Use HTTPS for the API URL. Plain HTTP is allowed only for localhost development.');
  }
  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('The API base URL must not contain embedded credentials, a query string, or a fragment.');
  }

  let normalized = url.toString();
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}
