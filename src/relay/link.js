const PROXY_HOST = 'anotherweather.com';

export function needsProxy(targetUrl) {
  const host = new URL(targetUrl).hostname;
  return host === PROXY_HOST || host.endsWith(`.${PROXY_HOST}`);
}

export function relayLink(origin, targetUrl) {
  return `${origin}/api/hls?url=${encodeURIComponent(targetUrl)}`;
}

export function playUrl(origin, upstreamUrl) {
  return needsProxy(upstreamUrl) ? relayLink(origin, upstreamUrl) : upstreamUrl;
}
