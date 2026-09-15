import http from 'node:http';
import https from 'node:https';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { profileByName, type ServerProfile } from '../servers/index.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const REQ_MS = 30000;

function encodeProxyTarget(url: string) {
  return Buffer.from(url).toString('base64url');
}

function decodeProxyTarget(encoded: string) {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

export function proxyPlaylistUrl(origin: string, url: string, server: string) {
  return `${origin}/api/hls/${encodeURIComponent(server)}/${encodeProxyTarget(url)}`;
}

function abs(uri: string, base: string) {
  return new URL(uri, base).href;
}

function rewrite(text: string, base: string, origin: string, server: string) {
  return text
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

function readText(stream: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

export async function serveProxyHls(
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

  const playlist = new URL(target).pathname.endsWith('.m3u8');
  const headers: Record<string, string> = {
    ...profile.headers,
    accept: '*/*',
    ...(!playlist && req.headers.range ? { range: String(req.headers.range) } : {}),
  };

  const up = await onceUpstream(target, headers);
  req.on('close', () => up.destroy());

  if (playlist) {
    if (up.statusCode !== 200) {
      up.resume();
      throw new Error(`upstream ${up.statusCode}`);
    }
    const body = rewrite(await readText(up), target, origin, profile.name);
    res.writeHead(200, {
      ...cors,
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    return;
  }

  if (up.statusCode !== 200 && up.statusCode !== 206) {
    up.resume();
    throw new Error(`upstream ${up.statusCode}`);
  }

  const out: Record<string, string> = {
    ...cors,
    'content-type': profile.segmentType || up.headers['content-type'] || 'application/octet-stream',
    'cache-control': 'public, max-age=60',
  };
  for (const name of ['content-length', 'content-range', 'accept-ranges'] as const) {
    if (up.headers[name]) out[name] = String(up.headers[name]);
  }
  res.writeHead(up.statusCode!, out);
  try {
    await pipeline(up, res);
  } catch {
    up.destroy();
  }
}

export function resolveProxyProfile(name: string): ServerProfile {
  const profile = profileByName(name);
  if (!profile) throw new Error(`no proxy profile for ${name}`);
  if (!profile.needsProxy) throw new Error(`${name} does not use proxy`);
  return profile;
}

export function parseProxyPath(pathname: string): { server: string; url: string } | null {
  const match = pathname.match(/^\/api\/hls\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return {
    server: decodeURIComponent(match[1]!),
    url: decodeProxyTarget(match[2]!),
  };
}
