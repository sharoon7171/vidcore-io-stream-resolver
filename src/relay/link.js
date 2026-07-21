const DIRECT_SERVER_NAMES = new Set(['Orbit']);
const PROXY_SERVER_NAMES = new Set(['Prime']);

export function isPlaylistUrl(targetUrl) {
  return new URL(targetUrl).pathname.endsWith('.m3u8');
}

export function needsReferer(serverName) {
  if (!serverName) return false;
  if (DIRECT_SERVER_NAMES.has(serverName)) return false;
  return PROXY_SERVER_NAMES.has(serverName);
}

export function relayLink(origin, targetUrl, serverName) {
  const params = new URLSearchParams({ url: targetUrl });
  if (serverName) params.set('server', serverName);
  return `${origin}/api/hls?${params}`;
}

export function playUrl(origin, upstreamUrl, serverName) {
  return needsReferer(serverName) ? relayLink(origin, upstreamUrl, serverName) : upstreamUrl;
}
