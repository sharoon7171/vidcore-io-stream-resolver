const REFERER_HOSTS = ['shegu.org', 'anotherweather.com'];

export function needsBrowserProxy(targetUrl) {
  const host = new URL(targetUrl).hostname;
  return REFERER_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function relayLink(origin, targetUrl) {
  return `${origin}/api/hls?url=${encodeURIComponent(targetUrl)}`;
}

export function playUrl(origin, upstreamUrl) {
  return needsBrowserProxy(upstreamUrl) ? relayLink(origin, upstreamUrl) : upstreamUrl;
}
