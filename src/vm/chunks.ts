import { siteOrigin, userAgent } from '../config.js';

export type PlayerChunks = {
  react: string;
  emotion: string;
  shared: string;
  crypto: string;
  player: string;
  playerUrl: string;
};

const CHUNK_RE = /\/_next\/static\/chunks\/[^"']+\.js/g;

async function fetchText(path: string) {
  const response = await fetch(`${siteOrigin}${path}`, {
    headers: {
      'user-agent': userAgent,
      accept: '*/*',
      referer: `${siteOrigin}/`,
    },
  });
  if (!response.ok) throw new Error(`chunk fetch failed: ${path} ${response.status}`);
  return response.text();
}

function pick(paths: string[], test: (path: string, body: string) => boolean, bodies: Map<string, string>) {
  for (const path of paths) {
    const body = bodies.get(path);
    if (body && test(path, body)) return { path, body };
  }
  return null;
}

export async function loadPlayerChunks(samplePath = '/movie/550'): Promise<PlayerChunks> {
  const page = await fetch(`${siteOrigin}${samplePath}`, {
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml',
      referer: `${siteOrigin}/`,
    },
  });
  if (!page.ok) throw new Error(`embed fetch failed: ${page.status}`);
  const html = await page.text();
  const paths = [...new Set(html.match(CHUNK_RE) || [])];
  if (!paths.length) throw new Error('no next chunks in embed html');

  const bodies = new Map<string, string>();
  await Promise.all(
    paths.map(async (path) => {
      bodies.set(path, await fetchText(path));
    }),
  );

  const react = pick(paths, (p) => p.includes('255-'), bodies);
  const emotion = pick(paths, (p) => p.includes('687-'), bodies);
  const shared = pick(paths, (p) => /\/213-/.test(p), bodies);
  const crypto = pick(paths, (_, b) => b.includes('3018:(') && b.includes('createHash'), bodies);
  const player = pick(
    paths,
    (p, b) => /\/281-/.test(p) || (b.includes('webpackChunk_N_E') && b.includes('xZ/aW~D6:U0_]EVA')),
    bodies,
  );

  if (!react || !emotion || !shared || !crypto || !player) {
    throw new Error(
      `missing player chunks react=${!!react} emotion=${!!emotion} shared=${!!shared} crypto=${!!crypto} player=${!!player}`,
    );
  }

  return {
    react: react.body,
    emotion: emotion.body,
    shared: shared.body,
    crypto: crypto.body,
    player: player.body,
    playerUrl: player.path,
  };
}

export function mintStreamAction(
  playerSource: string,
  salted: (index: number, key: string) => string,
) {
  const match = playerSource.match(
    /iY\((\d+),"([^"]+)"\),"\/"\)\[i[A-Za-z]+\(\d+\)\]\(r\[/,
  );
  if (!match) throw new Error('stream action indices not found in player chunk');
  return salted(Number(match[1]), match[2]);
}

export function mintCatalogBase(
  playerSource: string,
  unsalted: (index: number) => string,
) {
  const match = playerSource.match(/fetch\(""\[[^\]]+\]\(i[EQ]\((\d+)\),"\/"\)/);
  if (!match) throw new Error('catalog base index not found in player chunk');
  return unsalted(Number(match[1]));
}
