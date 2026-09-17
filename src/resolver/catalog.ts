import { decryptCatalogBody } from '../crypto/catalog-decrypt.js';
import { sealEn } from '../crypto/seal.js';
import { loadPlayerMaterial, type CatalogRoutes } from '../scraper/player-material.js';
import type { ScraperFetch } from '../scraper/session.js';

export type CatalogServer = {
  name: string;
  data?: string;
};

async function routes(html: string): Promise<CatalogRoutes> {
  const material = await loadPlayerMaterial({ html });
  return material.routes;
}

export async function listCatalogServers(
  en: string,
  scraperFetch: ScraperFetch,
  html: string,
): Promise<CatalogServer[]> {
  const r = await routes(html);
  const response = await scraperFetch(`${r.base}/${r.listAction}/${sealEn(en)}`, {
    method: r.method,
    headers: r.headers,
  });
  if (!response.ok) throw Object.assign(new Error(`catalog list failed: ${response.status}`), { stage: 'resolve' });
  const body = await response.text();
  if (!body) throw Object.assign(new Error('catalog list empty body'), { stage: 'resolve' });
  const decrypted = decryptCatalogBody(body);
  if (!Array.isArray(decrypted) || !decrypted.length) {
    throw Object.assign(new Error('server list empty'), { stage: 'resolve' });
  }
  return decrypted as CatalogServer[];
}

export async function unlockCatalogStream(
  server: CatalogServer,
  scraperFetch: ScraperFetch,
  html: string,
) {
  if (!server?.data) throw new Error('server missing data token');
  const r = await routes(html);
  const response = await scraperFetch(`${r.base}/${r.streamAction}/${server.data}`, {
    method: r.method,
    headers: r.headers,
  });
  if (!response.ok) throw new Error(`stream unlock failed: ${response.status}`);
  const body = await response.text();
  if (!body) throw new Error('stream unlock empty body');
  const config = decryptCatalogBody(body) as { url?: string };
  if (!config.url) throw new Error('decrypt missing stream url');
  return config as { url: string };
}
