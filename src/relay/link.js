export function relayLink(origin, targetUrl) {
  return `${origin}/api/hls?url=${encodeURIComponent(targetUrl)}`;
}
