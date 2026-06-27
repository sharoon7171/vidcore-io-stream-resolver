import { pull, relay } from './cdn.js';
import { needsBrowserProxy, relayLink } from './link.js';

const cors = { 'Access-Control-Allow-Origin': '*' };

function isPlaylist(url) {
  const parsed = new URL(url);
  return parsed.pathname.endsWith('.m3u8') || parsed.searchParams.get('type') === 'hls';
}

function absUri(uri, base) {
  return uri.startsWith('http') ? uri : new URL(uri, base).href;
}

function proxied(uri, base, origin) {
  const abs = absUri(uri, base);
  return needsBrowserProxy(abs) ? relayLink(origin, abs) : abs;
}

function rewritePlaylist(text, base, origin) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (!trimmed.includes('URI="')) return line;
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxied(uri, base, origin)}"`);
      }
      return proxied(trimmed, base, origin);
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

  if (!needsBrowserProxy(target)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('proxy not required');
    return;
  }

  try {
    if (isPlaylist(target)) {
      const raw = await pull(target);
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      });
      res.end(rewritePlaylist(raw.toString('utf8'), target, origin));
      return;
    }
    await relay(target, req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(String(err.message || err));
    }
  }
}
