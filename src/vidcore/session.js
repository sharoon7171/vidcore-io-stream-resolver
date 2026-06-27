import { mergeHeaders, resolveUrl } from './headers.js';

const MO_CSRF = '0qv1jDQw6mHsiQm7fDjrWm1VNq9sqm2a';

function parseSetCookie(header, jar) {
  if (!header) return;
  for (const part of header.split(/,(?=\s*[^;,]+=[^;,]+)/)) {
    const segment = part.split(';')[0].trim();
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    jar.set(segment.slice(0, eq), segment.slice(eq + 1));
  }
}

function storeCookies(response, jar) {
  parseSetCookie(response.headers.getSetCookie?.()?.join(',') ?? response.headers.get('set-cookie'), jar);
}

export function collectCookies(response, jar = new Map()) {
  storeCookies(response, jar);
  return jar;
}

function createSessionFetch(referer, jar) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  return async (input, init = {}) => {
    const response = await nativeFetch(resolveUrl(input), {
      ...init,
      headers: mergeHeaders(referer, init.headers, jar),
    });
    storeCookies(response, jar);
    return response;
  };
}

function isMoRequest(url) {
  return /\/(?:u)?mo\//.test(String(url));
}

export function createResolverFetch(referer, jar) {
  const pageFetch = createSessionFetch(referer, jar);
  const nativeFetch = globalThis.fetch.bind(globalThis);
  return async (input, init = {}) => {
    const url = resolveUrl(input);
    if (!isMoRequest(url)) return pageFetch(input, init);
    const headers = mergeHeaders(referer, init.headers, jar);
    headers.set('accept', headers.get('accept') || '*/*');
    headers.set('x-csrf-token', headers.get('x-csrf-token') || MO_CSRF);
    headers.set('x-requested-with', 'XMLHttpRequest');
    const response = await nativeFetch(url, {
      ...init,
      method: init.method || 'POST',
      headers,
      body: init.body,
    });
    storeCookies(response, jar);
    return response;
  };
}
