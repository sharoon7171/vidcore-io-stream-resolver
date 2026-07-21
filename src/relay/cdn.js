import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Agent } from 'undici';
import { ua, vidcoreReferer } from '../env.js';

const agent = new Agent({
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 600_000,
  connections: 32,
});

function headers(range) {
  return {
    'user-agent': ua,
    referer: vidcoreReferer,
    accept: '*/*',
    ...(range ? { range } : {}),
  };
}

function fetchUpstream(url, init) {
  return fetch(url, { ...init, redirect: 'follow', dispatcher: agent });
}

export async function pull(url) {
  const response = await fetchUpstream(url, { headers: headers() });
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function relay(url, req, res, serverName) {
  const response = await fetchUpstream(url, { headers: headers(req.headers.range) });
  if (!response.ok && response.status !== 206) throw new Error(`upstream ${response.status}`);

  const upstreamType = response.headers.get('content-type') || '';
  const out = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': serverName === 'Prime' ? 'public, max-age=3600' : 'no-cache',
    'content-type': serverName === 'Prime' ? 'video/mp2t' : upstreamType || 'application/octet-stream',
  };
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) out[name] = value;
  }
  res.writeHead(response.status, out);

  if (!response.body) {
    res.end();
    return;
  }

  await pipeline(Readable.fromWeb(response.body), res);
}
