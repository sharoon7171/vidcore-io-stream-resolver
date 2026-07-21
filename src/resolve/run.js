import { fetchEmbed } from '../vidcore/page.js';
import { createResolverFetch } from '../vidcore/session.js';
import { needsReferer, playUrl } from '../relay/link.js';
import { runResolver } from '../vm/runtime.js';
import { unlockServer } from './unlock.js';

function activeServers(servers) {
  const list = servers.at(-1);
  return list ? list.filter((entry) => entry?.data) : [];
}

function probeOrder(targets) {
  const seen = new Set();
  const out = [];
  const add = (entry) => {
    if (!entry || seen.has(entry.name)) return;
    seen.add(entry.name);
    out.push(entry);
  };
  add(targets.find((entry) => entry.name === 'Orbit'));
  add(targets.find((entry) => entry.selected));
  for (const entry of targets) add(entry);
  return out;
}

async function probeOne(server, sessionFetch, vmCtx, origin) {
  const started = Date.now();
  try {
    const config = await unlockServer(server, sessionFetch, vmCtx);
    const url = config.url;
    const referer = needsReferer(server.name);
    return {
      name: server.name,
      ok: true,
      ms: Date.now() - started,
      url,
      play: playUrl(origin, url, server.name),
      proxy: referer,
      referer,
    };
  } catch {
    return { name: server.name, ok: false, ms: Date.now() - started };
  }
}

export async function* stream(input, origin) {
  let embed;
  try {
    embed = await fetchEmbed(input.kind, input.id, {
      season: input.season,
      episode: input.episode,
    });
  } catch (err) {
    yield { event: 'error', stage: err.stage || 'resolve', error: err.message };
    return;
  }

  yield { event: 'meta', title: embed.meta.title, year: embed.meta.year };

  const sessionFetch = createResolverFetch(embed.referer, embed.jar);
  let listMo;
  try {
    listMo = await runResolver(embed.en, {
      ...embed.props,
      type: embed.type,
      id: embed.id,
      season: input.season,
      episode: input.episode,
      referer: embed.referer,
      fetch: sessionFetch,
    });
  } catch (err) {
    yield { event: 'error', stage: err.stage || 'resolve', error: err.message };
    return;
  }

  const targets = probeOrder(activeServers(listMo.servers));
  if (!targets.length) {
    yield { event: 'error', stage: 'resolve', error: 'server list empty' };
    return;
  }

  yield { event: 'serverlist', servers: targets.map((entry) => ({ name: entry.name })) };

  let found = false;
  for (const server of targets) {
    const result = await probeOne(server, sessionFetch, listMo.vmCtx, origin);
    yield { event: 'server', server: result };
    if (result.ok) found = true;
  }

  if (!found) yield { event: 'error', stage: 'resolve', error: 'no working server' };
}
