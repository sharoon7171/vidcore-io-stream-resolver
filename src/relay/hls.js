import { pull, relay } from '../wire/cdn.js';
import { needsProxy, relayLink } from './link.js';

const cors = { 'Access-Control-Allow-Origin': '*' };

function isPlaylistUrl(url) {
  const u = new URL(url);
  if (u.pathname.endsWith('.m3u8')) return true;
  return u.searchParams.get('type') === 'hls';
}

function absUri(uri, base) {
  return uri.startsWith('http') ? uri : new URL(uri, base).href;
}

function relayUri(uri, base, origin) {
  const abs = absUri(uri, base);
  return needsProxy(abs) ? relayLink(origin, abs) : abs;
}

function rewrite(text, base, origin) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (!trimmed.includes('URI="')) return line;
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${relayUri(uri, base, origin)}"`);
      }
      return relayUri(trimmed, base, origin);
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

  if (!needsProxy(target)) {
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
      res.end(rewrite(raw.toString('utf8'), target, origin));
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
