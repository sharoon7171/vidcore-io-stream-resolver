import { fetchEmbed } from '../vidcore/page.js';
import { createResolverFetch } from '../vidcore/session.js';
import { runResolver } from '../vm/runtime.js';
import { needsProxy, playUrl } from '../relay/link.js';
import { warmProxy } from '../relay/warm.js';
import { unlockServer } from './stream.js';
import { pool } from './pool.js';

function listActive(servers) {
  const outer = servers.at(-1);
  return outer ? outer.filter((entry) => entry?.data) : [];
}

async function prepare(input) {
  const embed = await fetchEmbed(input.kind, input.id, {
    season: input.season,
    episode: input.episode,
  });
  const sessionFetch = createResolverFetch(embed.referer, embed.jar);
  const listMo = await runResolver(embed.en, {
    ...embed.props,
    type: embed.type,
    id: embed.id,
    season: input.season,
    episode: input.episode,
    referer: embed.referer,
    fetch: sessionFetch,
  });
  const targets = listActive(listMo.servers);
  if (!targets.length) throw Object.assign(new Error('server list empty'), { stage: 'resolve' });
  return { embed, sessionFetch, vmCtx: listMo.vmCtx, targets };
}

async function probeOne(server, sessionFetch, vmCtx, origin) {
  const started = Date.now();
  const ms = () => Date.now() - started;
  try {
    const url = await unlockServer(server, sessionFetch, vmCtx);
    const proxy = needsProxy(url);
    if (proxy) warmProxy(url).catch(() => {});
    const play = playUrl(origin, url);
    return { name: server.name, ok: true, ms: ms(), url, play, proxy };
  } catch (err) {
    return { name: server.name, ok: false, ms: ms() };
  }
}

export async function* stream(input, origin) {
  let prepared;
  try {
    prepared = await prepare(input);
  } catch (err) {
    yield { event: 'error', stage: err.stage || 'resolve', error: err.message };
    return;
  }

  const { embed, sessionFetch, vmCtx, targets } = prepared;
  yield { event: 'meta', title: embed.meta.title, year: embed.meta.year };

  let found = false;

  for await (const hit of pool(targets, (server) => probeOne(server, sessionFetch, vmCtx, origin), targets.length)) {
    if (!hit.value.ok) continue;
    found = true;
    yield { event: 'server', server: hit.value };
  }

  if (!found) {
    yield { event: 'error', stage: 'resolve', error: 'no working server' };
  }
}
