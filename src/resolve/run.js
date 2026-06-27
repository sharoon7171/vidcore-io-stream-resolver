import { fetchEmbed } from '../vidcore/page.js';
import { createResolverFetch } from '../vidcore/session.js';
import { needsBrowserProxy, playUrl } from '../relay/link.js';
import { runResolver } from '../vm/runtime.js';
import { unlockServer } from './unlock.js';
import { pool } from './pool.js';

function activeServers(servers) {
  const list = servers.at(-1);
  return list ? list.filter((entry) => entry?.data) : [];
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
  const targets = activeServers(listMo.servers);
  if (!targets.length) throw Object.assign(new Error('server list empty'), { stage: 'resolve' });
  return { embed, sessionFetch, vmCtx: listMo.vmCtx, targets };
}

async function probeOne(server, sessionFetch, vmCtx, origin) {
  const started = Date.now();
  try {
    const config = await unlockServer(server, sessionFetch, vmCtx);
    const url = config.url;
    return {
      name: server.name,
      ok: true,
      ms: Date.now() - started,
      url,
      play: playUrl(origin, url),
      proxy: needsBrowserProxy(url),
    };
  } catch {
    return { name: server.name, ok: false, ms: Date.now() - started };
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
  for await (const hit of pool(
    targets,
    (server) => probeOne(server, sessionFetch, vmCtx, origin),
    targets.length,
  )) {
    if (!hit.value.ok) continue;
    found = true;
    yield { event: 'server', server: hit.value };
  }

  if (!found) yield { event: 'error', stage: 'resolve', error: 'no working server' };
}
