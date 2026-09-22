import { siteReferer, userAgent } from '../config.js';

export function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': userAgent,
    accept: '*/*',
    'accept-encoding': 'identity',
    ...extra,
  };
}

export function withSiteReferer(headers: Record<string, string>): Record<string, string> {
  return { ...headers, Referer: siteReferer };
}

export async function fetchWithSiteReferer(
  url: string,
  headers: Record<string, string> = browserHeaders(),
): Promise<Response> {
  return fetch(url, { headers: withSiteReferer(headers) });
}
