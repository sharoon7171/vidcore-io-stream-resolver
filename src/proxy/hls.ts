import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { userAgent, siteReferer } from '../config.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });

const MOON = 'moon.ironwallnet.net';
const EDU = 'studyedu.site';
const REQ_MS = 20000;

export function proxyPlaylistUrl(origin: string, url: string, server: string) {
  return `${origin}/api/hls?${new URLSearchParams({ url, server })}`;
}

function onMoon(url: string) {
  const u = new URL(url);
  if (u.pathname.startsWith('/vd/') && u.hostname !== MOON) {
    u.protocol = 'https:';
    u.host = MOON;
  }
  return u.href;
}

function onEdu(url: string) {
  const u = new URL(url);
  if (u.pathname.startsWith('/vd/')) {
    u.protocol = 'https:';
    u.host = EDU;
  }
  return u.href;
}

function abs(uri: string, base: string) {
  return onMoon(new URL(uri, base).href);
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

async function upstream(url: string, headers: Record<string, string>) {
  const primary = onMoon(url);
  try {
    const res = await onceUpstream(primary, headers);
    if (res.statusCode === 200 || res.statusCode === 206) return res;
    res.resume();
  } catch {
  }

  if (!new URL(url).pathname.startsWith('/vd/')) {
    throw new Error('upstream failed');
  }

  const res = await onceUpstream(onEdu(url), headers);
  if (res.statusCode !== 200 && res.statusCode !== 206) {
    res.resume();
    throw new Error(`upstream ${res.statusCode}`);
  }
  return res;
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
  server: string,
  opts: { segmentType?: string } = {},
) {
  const headers: Record<string, string> = {
    'user-agent': userAgent,
    referer: siteReferer,
    accept: '*/*',
    ...(req.headers.range ? { range: String(req.headers.range) } : {}),
  };

  const playlist = new URL(target).pathname.endsWith('.m3u8');
  const up = await upstream(target, headers);
  req.on('close', () => up.destroy());

  if (playlist) {
    if (up.statusCode !== 200) {
      up.resume();
      throw new Error(`upstream ${up.statusCode}`);
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl' });
    res.end(rewrite(await readText(up), target, origin, server));
    return;
  }

  if (up.statusCode !== 200 && up.statusCode !== 206) {
    up.resume();
    throw new Error(`upstream ${up.statusCode}`);
  }

  const out: Record<string, string> = {
    ...cors,
    'content-type': opts.segmentType || up.headers['content-type'] || 'application/octet-stream',
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
