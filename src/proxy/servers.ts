import type { IncomingMessage, ServerResponse } from 'node:http';
import { proxyPlaylistUrl, serveProxyHls } from './hls.js';

type ProxyServerDef = {
  name: string;
  referer: boolean;
  segmentType?: string;
};

const DEFS: ProxyServerDef[] = [
  { name: 'Orbit', referer: true, segmentType: 'video/mp2t' },
  { name: 'Supreme', referer: true },
  { name: 'Prime', referer: false },
  { name: 'Horizon', referer: true, segmentType: 'video/mp4' },
];

const byName = new Map(DEFS.map((d) => [d.name, d]));

export function playbackForServer(origin: string, url: string, name: string) {
  const def = byName.get(name);
  if (!def) return { url, proxy: false, referer: false };
  return {
    url,
    proxy: true,
    referer: def.referer,
    play: proxyPlaylistUrl(origin, url, def.name),
  };
}

export async function serveProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  params: URLSearchParams,
  origin: string,
) {
  const target = params.get('url');
  const name = params.get('server');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('url required');
    return;
  }

  const def = name ? byName.get(name) : undefined;
  if (!def) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('proxy not required');
    return;
  }

  try {
    await serveProxyHls(req, res, target, origin, def.name, {
      segmentType: def.segmentType,
    });
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(String((err as Error).message || err));
    }
  }
}
