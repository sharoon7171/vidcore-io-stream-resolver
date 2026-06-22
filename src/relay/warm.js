import { pull } from '../wire/cdn.js';

function absUri(uri, base) {
  return uri.startsWith('http') ? uri : new URL(uri, base).href;
}

function lines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function mediaPlaylists(text, base) {
  if (!text.includes('#EXT-X-STREAM-INF')) return [base];
  return lines(text).filter((line) => !line.startsWith('#')).map((line) => absUri(line, base));
}

function firstSegment(text, base) {
  const uri = lines(text).find((line) => !line.startsWith('#'));
  return uri ? absUri(uri, base) : null;
}

export async function warmProxy(url) {
  const root = (await pull(url)).toString('utf8');
  const medias = mediaPlaylists(root, url);
  await Promise.all(
    medias.map(async (media) => {
      const text = media === url && !root.includes('#EXT-X-STREAM-INF') ? root : (await pull(media)).toString('utf8');
      const seg = firstSegment(text, media);
      if (seg) await pull(seg);
    }),
  );
}
