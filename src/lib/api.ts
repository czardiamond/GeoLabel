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

export function formatApiError(body: unknown, status: number): string {
  const message = (value: unknown, depth = 0): string => {
    if (depth > 5) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(item => message(item, depth + 1)).filter(Boolean).join('; ');
    if (!value || typeof value !== 'object') return '';

    const error = value as Record<string, unknown>;
    for (const key of ['detail', 'message', 'msg', 'error']) {
      const text = message(error[key], depth + 1);
      if (!text) continue;
      if (key === 'msg' && Array.isArray(error.loc)) {
        const path = error.loc.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number');
        if (['body', 'query', 'path', 'header', 'cookie'].includes(String(path[0]))) path.shift();
        const field = path.join('.').replace(/_/g, ' ');
        if (field) return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${text}`;
      }
      return text;
    }
    return '';
  };

  // Validation bodies can contain passwords/tokens in `input` or `ctx`.
  // Read only recognized message fields; never stringify the whole response.
  return message(body) || `Request failed (${status})`;
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(formatApiError(body, response.status));
  return body as T;
}
