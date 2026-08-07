import { playbackForServer } from '../proxy/servers.js';
import { scrapeEmbedPage } from '../scraper/embed.js';
import { createScraperFetch } from '../scraper/session.js';
import { listCatalogServers, unlockCatalogStream, type CatalogServer } from './catalog.js';
import type { ResolveRequest } from './request.js';

const ORDER = ['Orbit', 'Supreme', 'Prime', 'Premiere 4K', 'Horizon'];

function ordered(servers: CatalogServer[]) {
  const byName = new Map(servers.filter((s) => s?.data).map((s) => [s.name, s]));
  return ORDER.map((name) => byName.get(name)).filter(Boolean) as CatalogServer[];
}

async function unlockOne(
  server: CatalogServer,
  scraperFetch: ReturnType<typeof createScraperFetch>,
  origin: string,
) {
  const started = Date.now();
  try {
    const config = await unlockCatalogStream(server, scraperFetch);
    return {
      name: server.name,
      ok: true as const,
      ms: Date.now() - started,
      ...playbackForServer(origin, config.url, server.name),
    };
  } catch {
    return { name: server.name, ok: false as const, ms: Date.now() - started };
  }
}

export async function* resolvePlayback(request: ResolveRequest, origin: string) {
  let embed;
  try {
    embed = await scrapeEmbedPage(request.kind, request.id, {
      season: request.kind === 'tv' ? request.season : undefined,
      episode: request.kind === 'tv' ? request.episode : undefined,
    });
  } catch (err) {
    const e = err as Error & { stage?: string };
    yield { event: 'error' as const, stage: e.stage || 'resolve', error: e.message };
    return;
  }

  yield { event: 'meta' as const, title: embed.meta.title, year: embed.meta.year };

  const scraperFetch = createScraperFetch(embed.referer, embed.jar);
  let servers;
  try {
    servers = await listCatalogServers(embed.en, scraperFetch);
  } catch (err) {
    const e = err as Error & { stage?: string };
    yield { event: 'error' as const, stage: e.stage || 'resolve', error: e.message };
    return;
  }

  const targets = ordered(servers);
  if (!targets.length) {
    yield { event: 'error' as const, stage: 'resolve', error: 'server list empty' };
    return;
  }

  yield { event: 'serverlist' as const, servers: targets.map((s) => ({ name: s.name })) };

  let found = false;
  for (const server of targets) {
    const result = await unlockOne(server, scraperFetch, origin);
    yield { event: 'server' as const, server: result };
    if (result.ok) found = true;
  }

  if (!found) yield { event: 'error' as const, stage: 'resolve', error: 'no working server' };
}
