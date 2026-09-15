import http from 'node:http';
import https from 'node:https';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { profileByName, type ServerProfile } from '../servers/index.js';
import { mintProxyId, resolveProxyId } from './store.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64 });
const REQ_MS = 45000;

function decodeLegacyTarget(encoded: string) {
  try {
    const url = Buffer.from(encoded, 'base64url').toString('utf8');
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
  } catch {
    return null;
  }
  return null;
}

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

function readBuffer(stream: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function readPrefix(stream: IncomingMessage, size: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const onData = (c: Buffer) => {
      chunks.push(c);
      total += c.length;
      if (total >= size) {
        stream.off('data', onData);
        stream.off('error', reject);
        stream.pause();
        resolve(Buffer.concat(chunks));
      }
    };
    stream.on('data', onData);
    stream.once('error', reject);
    stream.once('end', () => {
      stream.off('data', onData);
      resolve(Buffer.concat(chunks));
    });
  });
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

function writeSegmentHeaders(
  res: ServerResponse,
  status: number,
  profile: ServerProfile,
  up: IncomingMessage,
  target: string,
) {
  const out: Record<string, string> = {
    ...cors,
    'content-type': segmentContentType(profile, up.headers['content-type'], target),
    'cache-control': String(up.headers['cache-control'] || 'public, max-age=60'),
  };
  for (const name of ['content-length', 'content-range', 'accept-ranges'] as const) {
    if (up.headers[name]) out[name] = String(up.headers[name]);
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
  const host = new URL(target).hostname;
  if (!profile.hosts.some((item) => host === item || host.endsWith(`.${item}`))) {
    throw new Error(`host ${host} not allowed for ${profile.name}`);
  }

  const headers: Record<string, string> = {
    ...profile.headers,
    accept: '*/*',
    'accept-encoding': 'identity',
  };
  if (req.headers.range) headers.range = String(req.headers.range);

  const up = await onceUpstream(target, headers);
  req.on('close', () => up.destroy());

  if (!up.statusCode || up.statusCode >= 400) {
    const errBody = await readBuffer(up);
    throw new Error(`upstream ${up.statusCode}: ${errBody.subarray(0, 120).toString('utf8')}`);
  }

  const upstreamType = up.headers['content-type'];
  const pathLooksPlaylist = new URL(target).pathname.toLowerCase().endsWith('.m3u8');

  if (contentTypeIsPlaylist(upstreamType) || pathLooksPlaylist) {
    const body = rewritePlaylist((await readBuffer(up)).toString('utf8'), target, origin, profile.name);
    writePlaylist(res, body);
    return;
  }

  const prefix = await readPrefix(up, 8);
  if (prefix.toString('utf8').startsWith('#EXTM3U')) {
    up.resume();
    const rest = await readBuffer(up);
    const body = rewritePlaylist(Buffer.concat([prefix, rest]).toString('utf8'), target, origin, profile.name);
    writePlaylist(res, body);
    return;
  }

  if (up.statusCode !== 200 && up.statusCode !== 206) {
    up.resume();
    throw new Error(`upstream ${up.statusCode}`);
  }

  writeSegmentHeaders(res, up.statusCode, profile, up, target);
  res.write(prefix);
  up.resume();
  try {
    await pipeline(up, res);
  } catch {
    up.destroy();
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
  const token = match[2]!;
  const url = resolveProxyId(token) ?? decodeLegacyTarget(token);
  if (!url) return null;
  return { server, url };
}

export function playbackForServer(origin: string, url: string, name: string) {
  const profile = profileByName(name);
  if (!profile) throw new Error(`unknown server: ${name}`);
  return {
    url,
    proxy: profile.needsProxy,
    play: profile.needsProxy ? proxyPlaylistUrl(origin, url, profile.name) : null,
    referer: profile.refererRequired,
    directPlayable: profile.directPlayable,
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
