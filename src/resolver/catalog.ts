import { encryptResolveToken } from './crypto/token.js';
import { decryptResolvePayload } from './crypto/payload.js';
import type { ScraperFetch } from '../scraper/session.js';

const CATALOG_BASE = '/ja/1000018218870967';
const LIST_ACTION = 'E9AC6-y0Mng';
const STREAM_ACTION = 'UnTuCgorJGE';

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
