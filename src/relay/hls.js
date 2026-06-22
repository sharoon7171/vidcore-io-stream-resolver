import { pull } from '../wire/cdn.js';
import { relayLink } from './link.js';

const cors = { 'Access-Control-Allow-Origin': '*' };

function absUri(uri, base) {
  return uri.startsWith('http') ? uri : new URL(uri, base).href;
}

function rewrite(text, base, origin) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (!trimmed.includes('URI="')) return line;
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${relayLink(origin, absUri(uri, base))}"`);
      }
      return relayLink(origin, absUri(trimmed, base));
    })
    .join('\n');
}

export async function serve(res, params, origin) {
  const target = params.get('url');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('url required');
    return;
  }

  try {
    const raw = await pull(target);
    const text = raw.toString('utf8');
    const playlist = text.includes('#EXTM3U');
    res.writeHead(200, {
      ...cors,
      'Content-Type': playlist ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      'Cache-Control': 'no-cache',
    });
    res.end(playlist ? rewrite(text, target, origin) : raw);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(String(err.message || err));
    }
  }
}
