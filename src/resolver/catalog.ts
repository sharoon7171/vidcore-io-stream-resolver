import { encryptResolveToken } from './crypto/token.js';
import { decryptResolvePayload } from './crypto/payload.js';
import type { ScraperFetch } from '../scraper/session.js';

const CATALOG_BASE =
  '/838f93f8-02b6-5507-9b61-ab3717b54df2/a5022a41c59655396826d539c0a45fcf2396f987/1000063215035220/mo/n/e0ff7e8f0cbd036e8b03e8feb783f354c0b215853cc14afd119f9a3a2bab8aa2';
const LIST_ACTION = 'sB2_etpff40';
const STREAM_ACTION = '2ihd9UxHIsM';

export type CatalogServer = {
  name: string;
  data?: string;
};

export async function listCatalogServers(
  en: string,
  scraperFetch: ScraperFetch,
): Promise<CatalogServer[]> {
  const token = encryptResolveToken(en);
  const response = await scraperFetch(`${CATALOG_BASE}/${LIST_ACTION}/${token}`, {
    method: 'POST',
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    body: '',
  });
  if (!response.ok) {
    const err = new Error(`list mo failed: ${response.status}`) as Error & { stage?: string };
    err.stage = 'resolve';
    throw err;
  }
  const servers = decryptResolvePayload(await response.text());
  if (!Array.isArray(servers) || !servers.length) {
    const err = new Error('server list empty') as Error & { stage?: string };
    err.stage = 'resolve';
    throw err;
  }
  return servers as CatalogServer[];
}

export async function unlockCatalogStream(server: CatalogServer, scraperFetch: ScraperFetch) {
  if (!server?.data) throw new Error('server missing data token');
  const response = await scraperFetch(`${CATALOG_BASE}/${STREAM_ACTION}/${server.data}`, {
    method: 'POST',
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    body: '',
  });
  if (!response.ok) throw new Error(`stream mo failed: ${response.status}`);
  const config = decryptResolvePayload(await response.text()) as { url?: string };
  if (!config.url) throw new Error('decrypt missing stream url');
  return config as { url: string };
}
