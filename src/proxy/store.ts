import { randomBytes } from 'node:crypto';

const TTL_MS = 6 * 60 * 60 * 1000;
const ID_BYTES = 9;
const MAX_ENTRIES = 50_000;

type Entry = { url: string; exp: number };

const byId = new Map<string, Entry>();
const byUrl = new Map<string, string>();

function sweep(now = Date.now()) {
  if (byId.size < MAX_ENTRIES && byId.size % 256 !== 0) return;
  for (const [id, entry] of byId) {
    if (entry.exp > now) continue;
    byId.delete(id);
    if (byUrl.get(entry.url) === id) byUrl.delete(entry.url);
  }
}

export function mintProxyId(url: string): string {
  const now = Date.now();
  sweep(now);
  const existing = byUrl.get(url);
  if (existing) {
    const entry = byId.get(existing);
    if (entry && entry.exp > now) {
      entry.exp = now + TTL_MS;
      return existing;
    }
  }

  let id = randomBytes(ID_BYTES).toString('base64url');
  while (byId.has(id)) id = randomBytes(ID_BYTES).toString('base64url');
  byId.set(id, { url, exp: now + TTL_MS });
  byUrl.set(url, id);
  return id;
}

export function resolveProxyId(id: string): string | null {
  const entry = byId.get(id);
  if (!entry) return null;
  if (entry.exp < Date.now()) {
    byId.delete(id);
    if (byUrl.get(entry.url) === id) byUrl.delete(entry.url);
    return null;
  }
  return entry.url;
}
