import type { ScraperFetch } from '../scraper/session.js';
import { getVmSession, type CatalogServer } from '../vm/runtime.js';

export type { CatalogServer };

export async function listCatalogServers(
  en: string,
  scraperFetch: ScraperFetch,
  referer: string,
): Promise<CatalogServer[]> {
  const vm = await getVmSession();
  try {
    return await vm.listServers(en, scraperFetch, referer);
  } catch (err) {
    const e = err as Error & { stage?: string };
    e.stage = e.stage || 'resolve';
    throw e;
  }
}

export async function unlockCatalogStream(
  server: CatalogServer,
  scraperFetch: ScraperFetch,
  en: string,
) {
  const vm = await getVmSession();
  return vm.unlockServer(server, scraperFetch, en);
}
