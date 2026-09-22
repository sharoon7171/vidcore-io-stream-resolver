import { el } from './ui/dom.js';
import { bindCopyButtons, bindExports, clearExports, type ExportFields } from './ui/exports.js';
import { syncType, queryParams, type ResolveForm } from './ui/form.js';
import { idleServers, renderServers, type ServerEntry } from './ui/servers.js';
import { createTimers, fmtMs } from './ui/timing.js';
import { createHlsPlayer } from './player/hls.js';
import { applyOkFields, consumeResolve, type ResolveEvent } from './api/resolve.js';

const formEl = el('form') as HTMLFormElement;
const form: ResolveForm = {
  type: el('type') as HTMLSelectElement,
  id: el('id') as HTMLInputElement,
  idLabel: el('id-label'),
  tvFields: el('tv-fields'),
  hintMovie: el('hint-movie'),
  hintTv: el('hint-tv'),
  season: el('season') as HTMLInputElement,
  episode: el('episode') as HTMLInputElement,
};

const heading = el('title');
const err = el('err');
const playerCard = el('player-card');
const exportFields: ExportFields = {
  card: el('export-card'),
  direct: el('direct') as HTMLInputElement,
  directRow: el('export-direct'),
  browser: el('browser') as HTMLInputElement,
  browserRow: el('export-browser'),
  vlc: el('vlc') as HTMLInputElement,
  vlcRow: el('export-vlc'),
  mpv: el('mpv') as HTMLInputElement,
  mpvRow: el('export-mpv'),
};

const serversEl = el('servers');
const player = createHlsPlayer(el('video') as HTMLVideoElement, el('quality') as HTMLSelectElement);
const timers = createTimers(el('t-resolve'), el('t-play'));

let lastLabel = '';
let lastServers = idleServers();
let lastActive = '';
let lastQuery = '';
let selectGen = 0;
let endResolveLive: (() => void) | null = null;
let resolveAbort: AbortController | null = null;

function errText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function clearErr() {
  err.textContent = '';
  err.hidden = true;
}

function showResolveError(message: string) {
  err.textContent = `Resolve error: ${message}`;
  err.hidden = false;
}

function showPlaybackError(message: string) {
  err.textContent = `Playback error: ${message}`;
  err.hidden = false;
}

function paint() {
  renderServers(serversEl, lastServers, lastActive, fmtMs);
}

function findServer(name: string): ServerEntry {
  const entry = lastServers.find((item) => item.name === name);
  if (!entry) throw new Error(`unknown server: ${name}`);
  return entry;
}

function mediaSource(entry: ServerEntry): string {
  if (!entry.url) throw new Error(`${entry.name} has no stream URL`);
  if (entry.proxy) {
    if (!entry.play) throw new Error(`${entry.name} is missing a proxy URL`);
    return entry.play;
  }
  return entry.url;
}

function live(gen: number) {
  return gen === selectGen;
}

function formQuery() {
  return queryParams(form).toString();
}

function validateForm(): string | null {
  const id = form.id.value.trim();
  if (!id || !/^\d+$/.test(id)) return 'enter a valid TMDB id';
  if (form.type.value === 'tv') {
    const season = form.season.value.trim();
    const episode = form.episode.value.trim();
    if (!season || !/^\d+$/.test(season)) return 'enter a valid season';
    if (!episode || !/^\d+$/.test(episode)) return 'enter a valid episode';
  }
  return null;
}

function showPlayer() {
  playerCard.hidden = false;
}

function hidePlayer() {
  playerCard.hidden = true;
}

function resetPlayback() {
  player.stop();
  clearExports(exportFields);
  hidePlayer();
  endResolveLive?.();
  endResolveLive = null;
}

function clearLoadingServers(except?: string) {
  for (const entry of lastServers) {
    if (entry.name === except) continue;
    if (entry.status !== 'loading') continue;
    entry.status = 'idle';
    entry.resolveMs = null;
    entry.playMs = null;
    entry.url = null;
    entry.play = null;
    entry.proxy = false;
    entry.referer = false;
    entry.refererUrl = null;
    entry.userAgent = null;
    entry.cli = null;
  }
}

function beginResolveRequest() {
  resolveAbort?.abort();
  resolveAbort = new AbortController();
  return resolveAbort.signal;
}

function invalidateIfQueryChanged() {
  const query = formQuery();
  if (query === lastQuery) return;
  lastQuery = query;
  resolveAbort?.abort();
  resolveAbort = null;
  lastServers = idleServers();
  lastActive = '';
  lastLabel = '';
  heading.textContent = 'Stream';
  resetPlayback();
  clearErr();
  timers.reset();
  paint();
}

function selectServer(entry: ServerEntry): number {
  selectGen += 1;
  resolveAbort?.abort();
  resolveAbort = null;
  clearLoadingServers(entry.name);
  resetPlayback();
  clearErr();
  lastActive = entry.name;
  heading.textContent = lastLabel ? `${lastLabel} · ${entry.name}` : entry.name;
  showPlayer();
  if (entry.status === 'ok') {
    timers.showServer(entry.resolveMs, entry.playMs);
    showExports(entry);
  } else {
    entry.status = 'loading';
    entry.resolveMs = null;
    entry.playMs = null;
    entry.url = null;
    entry.play = null;
    entry.proxy = false;
    entry.referer = false;
    entry.refererUrl = null;
    entry.userAgent = null;
    entry.cli = null;
    endResolveLive = timers.beginResolve();
  }
  paint();
  return selectGen;
}

function showExports(entry: ServerEntry) {
  if (!entry.url) {
    clearExports(exportFields);
    return;
  }
  bindExports(
    exportFields,
    {
      url: entry.url,
      play: entry.play,
      proxy: entry.proxy,
      referer: entry.referer,
      refererUrl: entry.refererUrl,
      userAgent: entry.userAgent,
      cli: entry.cli,
    },
    lastLabel,
  );
}

function markResolveFail(entry: ServerEntry) {
  entry.status = 'fail';
  entry.url = null;
  entry.play = null;
  entry.proxy = false;
  entry.referer = false;
  entry.refererUrl = null;
  entry.userAgent = null;
  entry.cli = null;
  entry.playMs = null;
  player.stop();
  clearExports(exportFields);
  hidePlayer();
  timers.showServer(entry.resolveMs, null);
  paint();
}

function markPlaybackFail(entry: ServerEntry) {
  entry.playMs = null;
  player.stop();
  timers.showServer(entry.resolveMs, null);
  showExports(entry);
  paint();
}

async function playEntry(entry: ServerEntry, gen: number) {
  if (!live(gen) || entry.status !== 'ok' || !entry.url) return;
  showExports(entry);
  timers.showServer(entry.resolveMs, null);
  const endPlay = timers.beginPlayback();
  try {
    await player.play(mediaSource(entry));
    if (!live(gen)) {
      endPlay();
      return;
    }
    entry.playMs = endPlay();
    timers.showServer(entry.resolveMs, entry.playMs);
  } catch (error) {
    endPlay();
    if (live(gen)) throw error;
  }
}

function applyServerEvent(
  evt: Extract<ResolveEvent, { event: 'server' }>,
  gen: number,
): ServerEntry {
  const entry = findServer(evt.server.name);
  if (!live(gen)) return entry;

  if (evt.server.status === 'loading') {
    entry.status = 'loading';
    entry.resolveMs = null;
    entry.playMs = null;
    entry.url = null;
    entry.play = null;
    entry.proxy = false;
    entry.referer = false;
    entry.refererUrl = null;
    entry.userAgent = null;
    entry.cli = null;
    if (!endResolveLive) endResolveLive = timers.beginResolve();
    lastActive = entry.name;
    heading.textContent = lastLabel ? `${lastLabel} · ${entry.name}` : entry.name;
    clearExports(exportFields);
    paint();
    return entry;
  }

  if (evt.server.status === 'fail') {
    endResolveLive?.();
    endResolveLive = null;
    entry.status = 'fail';
    entry.resolveMs = evt.server.ms;
    entry.url = null;
    entry.play = null;
    entry.proxy = false;
    entry.referer = false;
    entry.refererUrl = null;
    entry.userAgent = null;
    entry.cli = null;
    entry.playMs = null;
    clearExports(exportFields);
    hidePlayer();
    timers.showServer(entry.resolveMs, null);
    paint();
    return entry;
  }

  endResolveLive?.();
  endResolveLive = null;
  applyOkFields(entry, evt.server);
  showExports(entry);
  paint();
  return entry;
}

async function openNamed(name: string, gen: number, signal: AbortSignal): Promise<ServerEntry> {
  let resolved: ServerEntry | null = null;
  let resolveError: string | null = null;

  await consumeResolve(
    `/api/resolve?${queryParams(form)}&server=${encodeURIComponent(name)}`,
    async (evt) => {
      if (!live(gen) || signal.aborted) return;
      if (evt.event === 'error') {
        resolveError = evt.error || 'resolve failed';
        throw new Error(resolveError);
      }
      if (evt.event === 'meta') {
        lastLabel = evt.year ? `${evt.title} (${evt.year})` : String(evt.title);
        heading.textContent = `${lastLabel} · ${name}`;
        return;
      }
      const next = applyServerEvent(evt, gen);
      if (evt.server.status === 'fail') {
        resolveError = evt.server.error || `${name} failed to resolve`;
      }
      if (next.status === 'ok') resolved = next;
    },
    signal,
  );

  if (!live(gen) || signal.aborted) throw new DOMException('cancelled', 'AbortError');
  if (!resolved) throw new Error(resolveError || `${name} failed to resolve`);
  return resolved;
}

bindCopyButtons();
form.type.addEventListener('change', () => {
  syncType(form);
  invalidateIfQueryChanged();
});
for (const input of [form.id, form.season, form.episode]) {
  input.addEventListener('input', () => invalidateIfQueryChanged());
  input.addEventListener('change', () => invalidateIfQueryChanged());
}
syncType(form);
lastQuery = formQuery();
timers.reset();
paint();

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
});

serversEl.addEventListener('click', (event) => {
  void (async () => {
    const node = (event.target as HTMLElement).closest('[data-name]');
    if (!(node instanceof HTMLButtonElement)) return;
    const name = node.dataset.name;
    if (!name) return;

    const invalid = validateForm();
    if (invalid) {
      showResolveError(invalid);
      return;
    }

    invalidateIfQueryChanged();
    const entry = findServer(name);
    if (name === lastActive && entry.status === 'loading') return;

    const gen = selectServer(entry);

    if (entry.status === 'ok') {
      try {
        await playEntry(entry, gen);
        if (live(gen)) clearErr();
      } catch (error) {
        if (!live(gen)) return;
        markPlaybackFail(entry);
        showPlaybackError(errText(error));
      }
      return;
    }

    const signal = beginResolveRequest();
    let resolved: ServerEntry;
    try {
      resolved = await openNamed(name, gen, signal);
    } catch (error) {
      if (!live(gen) || isAbort(error)) return;
      endResolveLive?.();
      endResolveLive = null;
      const current = findServer(name);
      if (current.status !== 'fail') markResolveFail(current);
      showResolveError(errText(error));
      return;
    }

    if (!live(gen)) return;

    try {
      await playEntry(resolved, gen);
      if (live(gen)) clearErr();
    } catch (error) {
      if (!live(gen)) return;
      markPlaybackFail(resolved);
      showPlaybackError(errText(error));
    }
  })();
});
