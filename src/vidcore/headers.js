import { ua, vidcoreOrigin } from '../env.js';

export const browserHeaders = {
  'user-agent': ua,
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
};

export function resolveUrl(input) {
  return typeof input === 'string' && input.startsWith('/') ? `${vidcoreOrigin}${input}` : input;
}

export function mergeHeaders(referer, initHeaders, jar) {
  const headers = new Headers(browserHeaders);
  headers.set('referer', referer);
  headers.set('origin', vidcoreOrigin);
  if (jar) {
    const cookies = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    if (cookies) headers.set('cookie', cookies);
  }
  if (initHeaders) {
    new Headers(initHeaders).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}
