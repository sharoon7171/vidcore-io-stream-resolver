const MAX_BYTES = 96 * 1024 * 1024;
const MAX_ITEM = 12 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

type Item = { body: Buffer; type: string; exp: number };

const map = new Map<string, Item>();
let total = 0;

function drop(key: string) {
  const item = map.get(key);
  if (!item) return;
  map.delete(key);
  total -= item.body.length;
}

function evict(now = Date.now()) {
  for (const [key, item] of map) {
    if (item.exp < now) drop(key);
  }
  while (total > MAX_BYTES && map.size) {
    const key = map.keys().next().value;
    if (key === undefined) break;
    drop(key);
  }
}

export function cacheGet(url: string): Item | null {
  const item = map.get(url);
  if (!item) return null;
  if (item.exp < Date.now()) {
    drop(url);
    return null;
  }
  map.delete(url);
  map.set(url, item);
  return item;
}

export function cacheSet(url: string, body: Buffer, type: string) {
  if (body.length === 0 || body.length > MAX_ITEM) return;
  if (map.has(url)) drop(url);
  evict();
  if (total + body.length > MAX_BYTES) evict();
  map.set(url, { body, type, exp: Date.now() + TTL_MS });
  total += body.length;
}
