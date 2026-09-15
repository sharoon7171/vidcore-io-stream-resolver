import { decryptCatalogBody } from '../crypto/catalog-decrypt.js';
import { sealEn } from '../crypto/seal.js';
import type { ScraperFetch } from '../scraper/session.js';

export type CatalogServer = {
  name: string;
  data?: string;
};

const CATALOG_BASE =
  '/29009e57-6139-51aa-ab38-8eafb5ac6f87/zos/f50d8ce19993cb96937450907624a32dca065e4874c2cb05fbf8664d8a7458de/c58702025ea9181aff8cacc57443a0d3ee16d3b0/neod';
const LIST_ACTION = 'STonXcCrikw';
const STREAM_ACTION = 'eEqO6NCqG98';

export async function listCatalogServers(en: string, scraperFetch: ScraperFetch): Promise<CatalogServer[]> {
  const response = await scraperFetch(`${CATALOG_BASE}/${LIST_ACTION}/${sealEn(en)}`);
  if (!response.ok) throw Object.assign(new Error(`catalog list failed: ${response.status}`), { stage: 'resolve' });
  const body = await response.text();
  if (!body) throw Object.assign(new Error('catalog list empty body'), { stage: 'resolve' });
  const decrypted = decryptCatalogBody(body);
  if (!Array.isArray(decrypted) || !decrypted.length) {
    throw Object.assign(new Error('server list empty'), { stage: 'resolve' });
  }
  return decrypted as CatalogServer[];
}

export async function unlockCatalogStream(server: CatalogServer, scraperFetch: ScraperFetch) {
  if (!server?.data) throw new Error('server missing data token');
  const response = await scraperFetch(`${CATALOG_BASE}/${STREAM_ACTION}/${server.data}`);
  if (!response.ok) throw new Error(`stream unlock failed: ${response.status}`);
  const body = await response.text();
  if (!body) throw new Error('stream unlock empty body');
  const config = decryptCatalogBody(body) as { url?: string };
  if (!config.url) throw new Error('decrypt missing stream url');
  return config as { url: string };
}
