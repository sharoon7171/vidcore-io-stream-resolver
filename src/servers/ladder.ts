import { browserHeaders, fetchWithSiteReferer } from '../http/upstream.js';

async function playlistText(url: string, headers: Record<string, string>) {
  const res = await fetchWithSiteReferer(url, headers);
  if (!res.ok) throw new Error(`playlist ${res.status}`);
  return res.text();
}

function masterSibling(url: string) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^(\/vd\/[^/]+)\//);
  if (!match) return null;
  parsed.pathname = `${match[1]}/master.m3u8`;
  return parsed.href;
}

export async function ensureMasterForAbr(url: string, headers: Record<string, string> = browserHeaders()) {
  const text = await playlistText(url, headers);
  if (text.includes('#EXT-X-STREAM-INF:')) return url;

  const master = masterSibling(url);
  if (!master || master === url) return url;

  try {
    const masterText = await playlistText(master, headers);
    if (masterText.includes('#EXT-X-STREAM-INF:')) return master;
  } catch {
    return url;
  }
  return url;
}
