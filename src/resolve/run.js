import { fetchEmbed } from '../vidcore/page.js';
import { createResolverFetch } from '../vidcore/session.js';
import { runResolver } from '../vm/runtime.js';
import { relayLink } from '../relay/link.js';
import { unlockServer } from './stream.js';
import { pool } from './pool.js';

function listActive(servers) {
  const outer = servers.at(-1);
  return outer ? outer.filter((entry) => entry?.data) : [];
}

function sortProbes(entries) {
  return [...entries].sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1));
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
    return { name: server.name, ok: true, ms: ms(), url, relay: relayLink(origin, url) };
  } catch (err) {
    return { name: server.name, ok: false, ms: ms(), error: err.message };
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

  const probes = [];
  for await (const hit of pool(targets, (server) => probeOne(server, sessionFetch, vmCtx, origin), targets.length)) {
    probes.push(hit.value);
    if (hit.value.ok) yield { event: 'server', server: hit.value };
  }

  const ok = sortProbes(probes).filter((entry) => entry.ok);
  if (!ok.length) {
    yield { event: 'error', stage: 'resolve', error: 'no working server' };
    return;
  }

  yield { event: 'done', server: ok[0].name, servers: ok };
}
