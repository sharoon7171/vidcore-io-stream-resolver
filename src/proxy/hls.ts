import http from 'node:http';
import https from 'node:https';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { siteReferer, userAgent } from '../config.js';
import { browserHeaders, withSiteReferer } from '../http/upstream.js';
import { profileByName, type ServerProfile } from '../servers/index.js';
import { cacheGet, cacheSet } from './segment-cache.js';
import { mintProxyId, resolveProxyId } from './store.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 256,
  maxFreeSockets: 64,
  scheduling: 'lifo',
});
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 256,
  maxFreeSockets: 64,
  scheduling: 'lifo',
});
const REQ_MS = 30000;
const UP_RETRY = 4;

function proxyPlaylistUrl(origin: string, url: string, server: string) {
  return `${origin}/api/hls/${encodeURIComponent(server)}/${mintProxyId(url)}`;
}

function abs(uri: string, base: string) {
  return new URL(uri, base).href;
}

function contentTypeIsPlaylist(contentType: string | undefined) {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('mpegurl') || ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl');
}

function sortMasterVariants(text: string) {
  if (!text.includes('#EXT-X-STREAM-INF:')) return text;
  const lines = text.split('\n');
  const header: string[] = [];
  const variants: { inf: string; uri: string; bandwidth: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const uri = (lines[i + 1] || '').trim();
      const bw = Number(/BANDWIDTH=(\d+)/i.exec(line)?.[1] || 0);
      if (uri && !uri.startsWith('#')) {
        variants.push({ inf: line, uri, bandwidth: bw });
        i += 2;
        continue;
      }
    }
    if (variants.length === 0) header.push(line);
    i += 1;
  }
  if (variants.length < 2) return text;
  variants.sort((a, b) => a.bandwidth - b.bandwidth);
  const out = header.filter((line, idx) => !(idx === header.length - 1 && line.trim() === ''));
  for (const variant of variants) {
    out.push(variant.inf, variant.uri);
  }
  out.push('');
  return out.join('\n');
}

function rewritePlaylist(text: string, base: string, origin: string, server: string) {
  return sortMasterVariants(text)
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        if (!t.includes('URI="')) return line;
        return t.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${proxyPlaylistUrl(origin, abs(uri, base), server)}"`);
      }
      return proxyPlaylistUrl(origin, abs(t, base), server);
    })
    .join('\n');
}

function open(url: string, headers: Record<string, string>) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  return lib.request({
    hostname: u.hostname,
    port: u.port || undefined,
    path: `${u.pathname}${u.search}`,
    method: 'GET',
    headers,
    agent: u.protocol === 'https:' ? httpsAgent : httpAgent,
    timeout: REQ_MS,
  });
}

function onceUpstream(url: string, headers: Record<string, string>): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = open(url, headers);
    const fail = (err: Error) => {
      req.destroy();
      reject(err);
    };
    req.setTimeout(REQ_MS, () => fail(new Error('upstream timeout')));
    req.on('error', fail);
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        onceUpstream(new URL(res.headers.location, url).href, headers).then(resolve, reject);
        return;
      }
      resolve(res);
    });
    req.end();
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function onceUpstreamRetried(url: string, headers: Record<string, string>) {
  let last: IncomingMessage | null = null;
  for (let attempt = 0; attempt <= UP_RETRY; attempt++) {
    const up = await onceUpstream(url, headers);
    if (up.statusCode !== 502 && up.statusCode !== 503) return up;
    up.resume();
    last = up;
    if (attempt < UP_RETRY) await sleep(50 * 2 ** attempt);
  }
  return last!;
}

function readBuffer(stream: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function assertUpstream(target: string) {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('invalid upstream url');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`unsupported upstream protocol ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0'
  ) {
    throw new Error('localhost upstream not allowed');
  }
}

function segmentContentType(profile: ServerProfile, upstream: string | undefined, target: string) {
  if (profile.segmentType) return profile.segmentType;
  if (upstream) return upstream;
  const path = new URL(target).pathname.toLowerCase();
  if (path.endsWith('.m4s') || path.endsWith('.mp4') || path.endsWith('.cmfv') || path.endsWith('.cmfa')) {
    return 'video/mp4';
  }
  if (path.endsWith('.ts') || path.endsWith('.m2ts')) return 'video/mp2t';
  return 'application/octet-stream';
}

function writePlaylist(res: ServerResponse, text: string) {
  res.writeHead(200, {
    ...cors,
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'no-cache',
  });
  res.end(text);
}

function writeSegmentHead(
  res: ServerResponse,
  status: number,
  type: string,
  up: IncomingMessage | null,
  length?: number,
) {
  const out: Record<string, string> = {
    ...cors,
    'content-type': type,
    'cache-control': String(up?.headers['cache-control'] || 'public, max-age=60'),
  };
  if (up) {
    for (const name of ['content-length', 'content-range', 'accept-ranges'] as const) {
      if (up.headers[name]) out[name] = String(up.headers[name]);
    }
  } else if (length !== undefined) {
    out['content-length'] = String(length);
  }
  if (!out['accept-ranges'] && status === 200) out['accept-ranges'] = 'bytes';
  res.writeHead(status, out);
}

async function serveProxyHls(
  req: IncomingMessage,
  res: ServerResponse,
  target: string,
  origin: string,
  profile: ServerProfile,
) {
  assertUpstream(target);

  const pathLooksPlaylist = new URL(target).pathname.toLowerCase().endsWith('.m3u8');
  const range = req.headers.range && !pathLooksPlaylist ? String(req.headers.range) : '';
  const cacheable = !pathLooksPlaylist && !range;

  if (cacheable) {
    const hit = cacheGet(target);
    if (hit) {
      writeSegmentHead(res, 200, hit.type, null, hit.body.length);
      res.end(hit.body);
      return;
    }
  }

  const headers = withSiteReferer(
    browserHeaders(range ? { range } : {}),
  );

  const up = await onceUpstreamRetried(target, headers);
  let closed = false;
  const onClose = () => {
    closed = true;
    up.destroy();
  };
  req.on('close', onClose);

  try {
    if (!up.statusCode || up.statusCode >= 400) {
      const errBody = await readBuffer(up);
      throw new Error(`upstream ${up.statusCode}: ${errBody.subarray(0, 120).toString('utf8')}`);
    }

    const upstreamType = up.headers['content-type'];

    if (contentTypeIsPlaylist(upstreamType) || pathLooksPlaylist) {
      const body = rewritePlaylist((await readBuffer(up)).toString('utf8'), target, origin, profile.name);
      writePlaylist(res, body);
      return;
    }

    const type = segmentContentType(profile, upstreamType, target);

    if (up.statusCode !== 200 && up.statusCode !== 206) {
      up.resume();
      throw new Error(`upstream ${up.statusCode}`);
    }

    writeSegmentHead(res, up.statusCode, type, up);

    if (!cacheable || up.statusCode !== 200) {
      try {
        await pipeline(up, res);
      } catch {
        up.destroy();
      }
      return;
    }

    const chunks: Buffer[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        up.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          if (!res.write(chunk)) up.pause();
        });
        res.on('drain', () => up.resume());
        up.on('end', () => {
          res.end();
          if (!closed) cacheSet(target, Buffer.concat(chunks), type);
          resolve();
        });
        up.on('error', reject);
        res.on('error', reject);
      });
    } catch {
      up.destroy();
    }
  } finally {
    req.off('close', onClose);
  }
}

function resolveProxyProfile(name: string): ServerProfile {
  const profile = profileByName(name);
  if (!profile) throw new Error(`no proxy profile for ${name}`);
  if (!profile.needsProxy) throw new Error(`${name} does not use proxy`);
  return profile;
}

export function parseProxyPath(pathname: string): { server: string; url: string } | null {
  const match = pathname.match(/^\/api\/hls\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const server = decodeURIComponent(match[1]!);
  const url = resolveProxyId(match[2]!);
  if (!url) return null;
  return { server, url };
}

export function playbackForServer(origin: string, url: string, name: string) {
  const profile = profileByName(name);
  if (!profile) throw new Error(`unknown server: ${name}`);
  const id = profile.needsProxy ? mintProxyId(url) : null;
  const wantUa = profile.cli ? Boolean(profile.cli.userAgent) : profile.refererRequired;
  return {
    url,
    proxy: profile.needsProxy,
    play: id ? `${origin}/api/hls/${encodeURIComponent(profile.name)}/${id}` : null,
    referer: profile.refererRequired,
    refererUrl: profile.refererRequired ? siteReferer : null,
    userAgent: wantUa ? userAgent : null,
    cli: profile.cli
      ? {
          vlcArgs: [...(profile.cli.vlcArgs ?? [])],
          mpvArgs: [...(profile.cli.mpvArgs ?? [])],
          mediaTitle: profile.cli.mediaTitle !== false,
        }
      : null,
  };
}

export async function serveProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  params: { url: string; server: string },
  origin: string,
) {
  let profile: ServerProfile;
  try {
    profile = resolveProxyProfile(params.server);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end((err as Error).message);
    return;
  }

  try {
    await serveProxyHls(req, res, params.url, origin, profile);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(String((err as Error).message || err));
    }
  }
}
