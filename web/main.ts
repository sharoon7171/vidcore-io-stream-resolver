import { el } from './ui/dom.js';
import { bindCopyButtons, bindExports } from './ui/exports.js';
import { syncType, queryParams, type ResolveForm } from './ui/form.js';
import { createHlsPlayer } from './player/hls.js';
import { fetchResolveStream, readNdjson } from './api/resolve.js';
import { renderServers } from './ui/servers.js';
import { createPlayTimer } from './ui/timing.js';

const form = el('form') as HTMLFormElement;
const resolveForm: ResolveForm = {
  type: el('type') as HTMLSelectElement,
  id: el('id') as HTMLInputElement,
  idLabel: el('id-label'),
  tvFields: el('tv-fields'),
  hintMovie: el('hint-movie'),
  hintTv: el('hint-tv'),
  season: el('season') as HTMLInputElement,
  episode: el('episode') as HTMLInputElement,
};
const panel = el('out');
const heading = el('title');
const err = el('err');
const btn = form.querySelector('button')!;
const exportEls = {
  direct: el('direct') as HTMLInputElement,
  browser: el('browser') as HTMLInputElement,
  browserRow: el('export-browser'),
  vlc: el('vlc') as HTMLInputElement,
  mpv: el('mpv') as HTMLInputElement,
};
const serversEl = el('servers');
const player = createHlsPlayer(el('video') as HTMLVideoElement);
const timer = createPlayTimer(el('play-timing'));

let lastLabel = '';
let lastServers: Array<Record<string, unknown> & { name: string; ok?: boolean; play?: string; url?: string }> = [];
let lastActive = '';
let playing = false;
let viaProxy = false;

function showErr(message: string) {
  err.textContent = message;
  err.hidden = false;
}

function selectServer(name: string) {
  const entry = lastServers.find((s) => s.name === name);
  if (!entry?.ok) return null;
  lastActive = name;
  viaProxy = Boolean(entry.play);
  heading.textContent = `${lastLabel} · ${name}`;
  renderServers(serversEl, lastServers, lastActive);
  bindExports(exportEls, { entry: entry as { url: string; referer?: boolean; play?: string }, label: lastLabel, viaProxy });
  return entry;
}

async function playEntry(entry: { play?: string; url?: string }) {
  viaProxy = Boolean(entry.play);
  bindExports(exportEls, {
    entry: entry as { url: string; referer?: boolean; play?: string },
    label: lastLabel,
    viaProxy,
  });
  const clock = timer.start();
  try {
    await player.play(viaProxy ? entry.play! : entry.url!);
    err.hidden = true;
    clock.markPlay();
  } catch (e) {
    timer.stop();
    throw e;
  }
}

bindCopyButtons();

serversEl.addEventListener('click', async (event) => {
  const node = (event.target as HTMLElement).closest('[data-name]') as HTMLButtonElement | null;
  if (!node || node.disabled || node.dataset.name === lastActive) return;
  const entry = selectServer(node.dataset.name!);
  if (!entry) return;
  err.hidden = true;
  try {
    await playEntry(entry);
  } catch (e) {
    showErr((e as Error).message);
  }
});

resolveForm.type.addEventListener('change', () => syncType(resolveForm));
syncType(resolveForm);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  btn.disabled = true;
  err.hidden = true;
  panel.hidden = true;
  player.stop();
  timer.stop();
  lastServers = [];
  lastActive = '';
  playing = false;
  viaProxy = false;
  try {
    const res = await fetchResolveStream(queryParams(resolveForm));
    await readNdjson(res, (evt) => {
      if (evt.event === 'error') throw new Error(`${evt.stage || 'error'}: ${evt.error || 'resolve failed'}`);
      if (evt.event === 'meta') {
        lastLabel = evt.year ? `${evt.title} (${evt.year})` : String(evt.title);
        panel.hidden = false;
        heading.textContent = lastLabel;
      }
      if (evt.event === 'serverlist') {
        const list = evt.servers as Array<{ name: string }>;
        lastServers = list.map((s) => ({ name: s.name }));
        renderServers(serversEl, lastServers, lastActive);
      }
      if (evt.event === 'server') {
        const server = evt.server as (typeof lastServers)[number];
        const idx = lastServers.findIndex((s) => s.name === server.name);
        if (idx >= 0) lastServers[idx] = server;
        else lastServers.push(server);
        renderServers(serversEl, lastServers, lastActive);
        if (server.ok && !playing) {
          playing = true;
          selectServer(server.name);
          playEntry(server).catch((e) => showErr((e as Error).message));
        }
      }
    });
    if (!lastServers.some((s) => s.ok)) throw new Error('no working server');
  } catch (e) {
    timer.stop();
    showErr((e as Error).message);
  } finally {
    btn.disabled = false;
  }
});
