import { pull, relay } from './cdn.js';
import { isPlaylistUrl, needsReferer, relayLink } from './link.js';

const cors = { 'Access-Control-Allow-Origin': '*' };

function absUri(uri, base) {
  return uri.startsWith('http') ? uri : new URL(uri, base).href;
}

function proxied(uri, base, origin, server) {
  const abs = absUri(uri, base);
  if (needsReferer(server)) return relayLink(origin, abs, server);
  return abs;
}

function rewritePlaylist(text, base, origin, server) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (!trimmed.includes('URI="')) return line;
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxied(uri, base, origin, server)}"`);
      }
      return proxied(trimmed, base, origin, server);
    })
    .join('\n');
}

export async function serve(req, res, params, origin) {
  const target = params.get('url');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('url required');
    return;
  }

  const server = params.get('server') || undefined;
  if (!needsReferer(server)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('proxy not required');
    return;
  }

  try {
    if (isPlaylistUrl(target)) {
      const raw = await pull(target);
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      });
      res.end(rewritePlaylist(raw.toString('utf8'), target, origin, server));
      return;
    }
    await relay(target, req, res, server);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(String(err.message || err));
    }
  }
}
