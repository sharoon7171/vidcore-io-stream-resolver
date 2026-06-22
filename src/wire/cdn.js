import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Agent } from 'undici';
import { ua, vidcoreReferer } from '../env.js';

const upstream = new Agent({
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 600_000,
  connections: 32,
});

function upstreamHeaders(range) {
  return {
    'user-agent': ua,
    referer: vidcoreReferer,
    accept: '*/*',
    ...(range ? { range } : {}),
  };
}

function upstreamFetch(url, init) {
  return fetch(url, { ...init, redirect: 'follow', dispatcher: upstream });
}

export async function pull(url) {
  const response = await upstreamFetch(url, { headers: upstreamHeaders() });
  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function relay(url, req, res) {
  const response = await upstreamFetch(url, {
    headers: upstreamHeaders(req.headers.range),
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`upstream ${response.status}`);
  }

  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }

  await pipeline(Readable.fromWeb(response.body), res);
}
