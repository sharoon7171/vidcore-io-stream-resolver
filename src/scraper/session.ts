import { absoluteUrl, mergeHeaders } from './request.js';

function parseSetCookie(header: string | null | undefined, jar: Map<string, string>) {
  if (!header) return;
  for (const part of header.split(/,(?=\s*[^;,]+=[^;,]+)/)) {
    const segment = part.split(';')[0].trim();
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    jar.set(segment.slice(0, eq), segment.slice(eq + 1));
  }
}

function storeCookies(response: Response, jar: Map<string, string>) {
  parseSetCookie(
    response.headers.getSetCookie?.()?.join(',') ?? response.headers.get('set-cookie'),
    jar,
  );
}

export function collectCookies(response: Response, jar = new Map<string, string>()) {
  storeCookies(response, jar);
  return jar;
}

export function createScraperFetch(referer: string, jar: Map<string, string>) {
  return async (input: string, init: RequestInit = {}) => {
    const headers = mergeHeaders(referer, init.headers, jar);
    headers.set('accept', headers.get('accept') || '*/*');
    headers.set('x-requested-with', 'XMLHttpRequest');
    const response = await fetch(absoluteUrl(input), {
      ...init,
      method: init.method || 'POST',
      headers,
      body: init.body,
    });
    storeCookies(response, jar);
    return response;
  };
}

export type ScraperFetch = ReturnType<typeof createScraperFetch>;
