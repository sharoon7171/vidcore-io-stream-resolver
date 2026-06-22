export async function* pool(items, fn, n) {
  const q = items.map((item, index) => ({ item, index }));
  const live = new Map();

  const spawn = ({ item, index }) => {
    const id = Symbol();
    live.set(id, fn(item, index).then((value) => ({ id, index, item, value })));
  };

  while (q.length || live.size) {
    while (q.length && live.size < n) spawn(q.shift());
    if (!live.size) break;
    const out = await Promise.race(live.values());
    live.delete(out.id);
    yield out;
  }
}
