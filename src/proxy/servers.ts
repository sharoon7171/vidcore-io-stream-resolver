import type { IncomingMessage, ServerResponse } from 'node:http';
import { profileByName } from '../servers/index.js';
import { parseProxyPath, proxyPlaylistUrl, resolveProxyProfile, serveProxyHls } from './hls.js';

export { parseProxyPath };

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
  let profile;
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
