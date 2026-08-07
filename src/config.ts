export const port = Number(process.env.PORT) || 3000;

export const siteOrigin = process.env.VIDCORE_ORIGIN || 'https://vidcore.net';

export const siteReferer = `${siteOrigin}/`;

export const userAgent =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
