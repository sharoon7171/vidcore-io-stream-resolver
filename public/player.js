import Hls from 'hls.js';

const REF = 'https://vidcore.net/';
const MOVIE_ID = '550';
const TV_ID = '44217';
const TV_SEASON = '1';
const TV_EPISODE = '1';

const $ = (id) => document.getElementById(id);

const form = $('form');
const typeIn = $('type');
const idIn = $('id');
const idLabel = $('id-label');
const tvFields = $('tv-fields');
const hintMovie = $('hint-movie');
const hintTv = $('hint-tv');
const seasonIn = $('season');
const episodeIn = $('episode');
const panel = $('out');
const heading = $('title');
const video = $('video');
const err = $('err');
const btn = form.querySelector('button');
const rawOut = $('direct');
const browserOut = $('browser');
const vlcOut = $('vlc');
const mpvOut = $('mpv');
const playTiming = $('play-timing');
const serversEl = $('servers');

let hls = null;
let gen = 0;
let playTimer = null;
let lastLabel = '';
let lastServers = [];
let lastActive = '';
let playing = false;

function fmtMs(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function mediaLabel(title, year) {
  return year ? `${title} (${year})` : title;
}

function showErr(message) {
  err.textContent = message;
  err.hidden = false;
}

function stopPlayTimer() {
  if (playTimer) {
    cancelAnimationFrame(playTimer.raf);
    playTimer = null;
  }
  playTiming.hidden = true;
}

function startPlayTimer() {
  stopPlayTimer();
  playTiming.hidden = false;
  playTiming.textContent = 'First frame …';
  playTiming.className = 'play-timing is-live';
  const t0 = performance.now();
  const tick = () => {
    playTiming.textContent = `First frame ${fmtMs(performance.now() - t0)}`;
    playTimer.raf = requestAnimationFrame(tick);
  };
  playTimer = { raf: requestAnimationFrame(tick), t0 };
  return {
    markPlay() {
      if (!playTimer) return;
      cancelAnimationFrame(playTimer.raf);
      playTiming.textContent = `First frame ${fmtMs(performance.now() - t0)}`;
      playTiming.className = 'play-timing is-done';
      playTimer = null;
    },
  };
}

function vlcCmd(entry) {
  return entry.referer ? `vlc --http-referrer='${REF}' "${entry.url}"` : `vlc "${entry.url}"`;
}

function mpvCmd(entry) {
  const title = `--force-media-title="${lastLabel.replace(/"/g, '\\"')}"`;
  return entry.referer
    ? `mpv --referrer='${REF}' ${title} "${entry.url}"`
    : `mpv ${title} "${entry.url}"`;
}

function stop() {
  gen += 1;
  stopPlayTimer();
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function play(entry, playClock) {
  stop();
  const id = gen;
  const source = entry.proxy ? entry.play : entry.url;
  if (Boolean(entry.proxy) !== source.includes('/api/hls')) {
    return Promise.reject(new Error('invalid play route'));
  }
  const live = () => id === gen;

  return new Promise((resolve, reject) => {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onVideoError);
    };

    const done = () => {
      if (!live()) return;
      cleanup();
      err.hidden = true;
      playClock?.markPlay();
      resolve();
    };

    const fail = (message) => {
      if (!live()) return;
      cleanup();
      reject(new Error(message));
    };

    const onPlaying = () => done();
    const onVideoError = () => fail('playback failed');

    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onVideoError);

    if (Hls.isSupported()) {
      let started = false;
      hls = new Hls({
        enableWorker: true,
        startFragPrefetch: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.levels.length) hls.currentLevel = hls.levels.length - 1;
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) fail(data.details || 'playback failed');
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!live() || started) return;
        started = true;
        video.play().catch(() => {});
      });
      hls.attachMedia(video);
      hls.loadSource(source);
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      video.addEventListener(
        'canplay',
        () => {
          if (live()) video.play().catch(() => {});
        },
        { once: true },
      );
      return;
    }

    fail('HLS not supported');
  });
}

function serverByName(name) {
  return lastServers.find((entry) => entry.name === name);
}

function bindExports(entry) {
  rawOut.value = entry.url;
  browserOut.value = entry.play;
  vlcOut.value = vlcCmd(entry);
  mpvOut.value = mpvCmd(entry);
}

function renderServers(servers, active) {
  serversEl.innerHTML = servers
    .map((entry) => {
      const picked = entry.name === active ? ' badge--active' : '';
      const state =
        entry.ok === true ? ' badge--ok' : entry.ok === false ? ' badge--fail' : ' badge--pending';
      const icon = entry.ok === true ? '✓' : entry.ok === false ? '✕' : '…';
      const disabled = entry.ok === false ? ' disabled' : '';
      const ms = entry.ms != null ? fmtMs(entry.ms) : '…';
      return `<button type="button" class="badge${picked}${state}" data-name="${entry.name}"${disabled}><span class="badge__icon" aria-hidden="true">${icon}</span><span class="badge__name">${entry.name}</span><span class="badge__ms">${ms}</span></button>`;
    })
    .join('');
  serversEl.closest('.card').hidden = servers.length === 0;
}

function selectServer(name) {
  const entry = serverByName(name);
  if (!entry?.ok) return null;
  lastActive = name;
  heading.textContent = `${lastLabel} · ${name}`;
  renderServers(lastServers, lastActive);
  bindExports(entry);
  return entry;
}

function syncType() {
  const tv = typeIn.value === 'tv';
  tvFields.hidden = !tv;
  hintMovie.hidden = tv;
  hintTv.hidden = !tv;
  idLabel.textContent = tv ? 'TV ID' : 'Movie ID';
  idIn.placeholder = tv ? TV_ID : MOVIE_ID;
  seasonIn.required = tv;
  episodeIn.required = tv;
  const current = idIn.value.trim();
  if (tv && (!current || current === MOVIE_ID)) idIn.value = TV_ID;
  if (!tv && (!current || current === TV_ID)) idIn.value = MOVIE_ID;
  if (tv) {
    if (!seasonIn.value.trim()) seasonIn.value = TV_SEASON;
    if (!episodeIn.value.trim()) episodeIn.value = TV_EPISODE;
  } else {
    seasonIn.value = '';
    episodeIn.value = '';
  }
}

function queryParams() {
  const params = new URLSearchParams({ type: typeIn.value, id: idIn.value.trim() });
  if (typeIn.value === 'tv') {
    params.set('season', seasonIn.value.trim());
    params.set('episode', episodeIn.value.trim());
  }
  return params;
}

async function pipeNdjson(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const evt = JSON.parse(line);
      if (evt.event === 'error') throw new Error(`${evt.stage || 'error'}: ${evt.error || 'resolve failed'}`);
      if (evt.event === 'meta') {
        lastLabel = mediaLabel(evt.title, evt.year);
        panel.hidden = false;
        heading.textContent = lastLabel;
      }
      if (evt.event === 'serverlist') {
        lastServers = evt.servers.map((entry) => ({ name: entry.name }));
        renderServers(lastServers, lastActive);
      }
      if (evt.event === 'server') {
        const idx = lastServers.findIndex((entry) => entry.name === evt.server.name);
        if (idx >= 0) lastServers[idx] = evt.server;
        else lastServers.push(evt.server);
        renderServers(lastServers, lastActive);
        if (evt.server.ok && !playing) {
          playing = true;
          selectServer(evt.server.name);
          play(evt.server, startPlayTimer()).catch((e) => showErr(e.message));
        }
      }
    }
  }

  if (!lastServers.some((entry) => entry.ok)) throw new Error('no working server');
}

document.querySelectorAll('[data-copy]').forEach((node) => {
  node.addEventListener('click', async () => {
    const field = $(node.dataset.copy);
    await navigator.clipboard.writeText(field.value);
    const label = node.textContent;
    node.textContent = 'Copied';
    node.classList.add('ok');
    setTimeout(() => {
      node.textContent = label;
      node.classList.remove('ok');
    }, 1200);
  });
});

serversEl.addEventListener('click', async (event) => {
  const btnNode = event.target.closest('[data-name]');
  if (!btnNode || btnNode.disabled || btnNode.dataset.name === lastActive) return;
  const entry = selectServer(btnNode.dataset.name);
  if (!entry) return;
  err.hidden = true;
  try {
    await play(entry, startPlayTimer());
  } catch (e) {
    showErr(e.message);
  }
});

typeIn.addEventListener('change', syncType);
syncType();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  btn.disabled = true;
  err.hidden = true;
  panel.hidden = true;
  stop();
  lastServers = [];
  lastActive = '';
  playing = false;
  try {
    const res = await fetch(`/api/resolve?${queryParams()}`);
    if (!res.ok) {
      const data = await res.json();
      throw new Error(`${data.stage || 'error'}: ${data.error || 'resolve failed'}`);
    }
    await pipeNdjson(res);
  } catch (e) {
    stopPlayTimer();
    showErr(e.message);
  } finally {
    btn.disabled = false;
  }
});
