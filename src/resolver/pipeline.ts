import { playbackForServer } from '../proxy/hls.js';
import { scrapeEmbedPage, type EmbedSnapshot } from '../scraper/embed.js';
import { createScraperFetch } from '../scraper/session.js';
import { isServerName, profileByName, SERVER_ORDER } from '../servers/index.js';
import { ensureMasterForAbr } from '../servers/ladder.js';
import { listCatalogServers, unlockCatalogStream, type CatalogServer } from './catalog.js';
import type { ResolveRequest } from './request.js';

type CatalogReady = {
  key: string;
  embed: EmbedSnapshot;
  servers: CatalogServer[];
  scraperFetch: ReturnType<typeof createScraperFetch>;
  at: number;
};

const CACHE_TTL_MS = 120_000;
let catalogCache: CatalogReady | null = null;

function requestKey(request: ResolveRequest) {
  return request.kind === 'tv'
    ? `tv:${request.id}:${request.season}:${request.episode}`
    : `movie:${request.id}`;
}

function ordered(servers: CatalogServer[]) {
  const byName = new Map(servers.filter((s) => s?.data).map((s) => [s.name, s]));
  return SERVER_ORDER.map((name) => byName.get(name)).filter(Boolean) as CatalogServer[];
}

async function loadCatalog(request: ResolveRequest): Promise<CatalogReady> {
  const key = requestKey(request);
  if (catalogCache && catalogCache.key === key && Date.now() - catalogCache.at < CACHE_TTL_MS) {
    return catalogCache;
  }

  const embed = await scrapeEmbedPage(request.kind, request.id, {
    season: request.kind === 'tv' ? request.season : undefined,
    episode: request.kind === 'tv' ? request.episode : undefined,
  });
  const scraperFetch = createScraperFetch(embed.referer, embed.jar);
  const servers = ordered(await listCatalogServers(embed.en, scraperFetch));
  if (!servers.length) throw Object.assign(new Error('server list empty'), { stage: 'resolve' });

  catalogCache = { key, embed, servers, scraperFetch, at: Date.now() };
  return catalogCache;
}

async function unlockServerEvent(
  server: CatalogServer,
  scraperFetch: ReturnType<typeof createScraperFetch>,
  origin: string,
  started: number,
) {
  try {
    const config = await unlockCatalogStream(server, scraperFetch);
    const profile = profileByName(server.name);
    let url = config.url;
    if (profile?.abrMaster) {
      url = await ensureMasterForAbr(url, profile.headers);
    }
    return {
      event: 'server' as const,
      server: {
        name: server.name,
        status: 'ok' as const,
        ms: Date.now() - started,
        ...playbackForServer(origin, url, server.name),
      },
    };
  } catch (err) {
    return {
      event: 'server' as const,
      server: {
        name: server.name,
        status: 'fail' as const,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function* resolvePlayback(request: ResolveRequest, origin: string, serverName: string) {
  if (!isServerName(serverName)) {
    yield { event: 'error' as const, stage: 'input', error: `unknown server: ${serverName}` };
    return;
  }

  yield { event: 'server' as const, server: { name: serverName, status: 'loading' as const } };
  const started = Date.now();

  let catalog: CatalogReady;
  try {
    catalog = await loadCatalog(request);
  } catch (err) {
    const e = err as Error & { stage?: string };
    yield { event: 'error' as const, stage: e.stage || 'resolve', error: e.message };
    return;
  }

  yield {
    event: 'meta' as const,
    title: catalog.embed.meta.title,
    year: catalog.embed.meta.year,
  };

  const target = catalog.servers.find((s) => s.name === serverName);
  if (!target) {
    yield {
      event: 'error' as const,
      stage: 'resolve',
      error: `${serverName} not in catalog`,
    };
    return;
  }

  const evt = await unlockServerEvent(target, catalog.scraperFetch, origin, started);
  yield evt;
  if (evt.server.status === 'ok') return;

  yield {
    event: 'error' as const,
    stage: 'resolve',
    error: ('error' in evt.server && evt.server.error) || `${serverName} failed to unlock`,
  };
}
