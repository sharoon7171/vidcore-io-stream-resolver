export const port = Number(process.env.PORT) || 3000;

export const vidcoreOrigin = process.env.VIDCORE_ORIGIN || 'https://vidcore.net';

export const vidcoreReferer = `${vidcoreOrigin}/`;

export const ua =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
