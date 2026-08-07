import { siteOrigin, userAgent } from '../config.js';

export const scraperHeaders: Record<string, string> = {
  'user-agent': userAgent,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
};

export function absoluteUrl(input: string | URL): string | URL {
  return typeof input === 'string' && input.startsWith('/') ? `${siteOrigin}${input}` : input;
}

export function mergeHeaders(
  referer: string,
  initHeaders: ConstructorParameters<typeof Headers>[0] | undefined,
  jar: Map<string, string> | undefined,
): Headers {
  const headers = new Headers(scraperHeaders);
  headers.set('referer', referer);
  headers.set('origin', siteOrigin);
  if (jar) {
    const cookies = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    if (cookies) headers.set('cookie', cookies);
  }
  if (initHeaders) {
    new Headers(initHeaders).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}
