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
const timing = $('timing');
const tResolve = $('t-resolve');
const tPlay = $('t-play');
const tTotal = $('t-total');
const serversEl = $('servers');

let hls = null;
let gen = 0;
let timer = null;
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

function stopTimer() {
  if (!timer) return;
  cancelAnimationFrame(timer.raf);
  timer = null;
}

function startTimer() {
  stopTimer();
  timing.hidden = false;
  tResolve.textContent = '0ms';
  tPlay.textContent = 'waiting';
  tTotal.textContent = '0ms';
  tResolve.className = 'timing__val is-live';
  tPlay.className = 'timing__val';
  tTotal.className = 'timing__val is-live';

  const t0 = performance.now();
  let resolveAt = null;
  let playAt = null;

  const tick = () => {
    const now = performance.now();
    if (resolveAt == null) tResolve.textContent = fmtMs(now - t0);
    if (resolveAt != null && playAt == null) {
      tPlay.textContent = fmtMs(now - resolveAt);
      tPlay.className = 'timing__val is-live';
    }
    if (playAt == null) tTotal.textContent = fmtMs(now - t0);
    if (playAt == null) timer.raf = requestAnimationFrame(tick);
  };

  timer = {
    raf: requestAnimationFrame(tick),
    markResolve() {
      if (resolveAt != null) return;
      resolveAt = performance.now();
      tResolve.textContent = fmtMs(resolveAt - t0);
      tResolve.className = 'timing__val is-done';
      tPlay.textContent = '0ms';
      tPlay.className = 'timing__val is-live';
    },
    markPlay() {
      if (playAt != null) return;
      playAt = performance.now();
      if (resolveAt == null) this.markResolve();
      tPlay.textContent = fmtMs(playAt - resolveAt);
      tPlay.className = 'timing__val is-done';
      tTotal.textContent = fmtMs(playAt - t0);
      tTotal.className = 'timing__val is-done';
      stopTimer();
    },
  };
  return timer;
}

function vlcCmd(url) {
  return `vlc --http-referrer='${REF}' "${url}"`;
}

function mpvCmd(url, name) {
  return `mpv --referrer='${REF}' --force-media-title="${name.replace(/"/g, '\\"')}" "${url}"`;
}

function stop() {
  gen += 1;
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function play(entry, clock) {
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
      clock?.markPlay();
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
      hls = new Hls({ enableWorker: true, startFragPrefetch: true });
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
  vlcOut.value = vlcCmd(entry.url);
  mpvOut.value = mpvCmd(entry.url, lastLabel);
}

function renderServers(servers, active) {
  serversEl.innerHTML = servers
    .map((entry) => {
      const picked = entry.name === active ? ' badge--active' : '';
      return `<button type="button" class="badge${picked}" data-name="${entry.name}"><span class="badge__name">${entry.name}</span><span class="badge__ms">${fmtMs(entry.ms)}</span></button>`;
    })
    .join('');
  serversEl.closest('.card').hidden = servers.length === 0;
}

function selectServer(name) {
  const entry = serverByName(name);
  if (!entry) return null;
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

async function pipeNdjson(res, clock) {
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
      }
      if (evt.event === 'server') {
        lastServers.push(evt.server);
        renderServers(lastServers, lastActive);
        if (!playing) {
          playing = true;
          clock.markResolve();
          selectServer(evt.server.name);
          play(evt.server, clock).catch((e) => showErr(e.message));
        }
      }
    }
  }

  if (!lastServers.length) throw new Error('no servers returned');
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
  if (!btnNode || btnNode.dataset.name === lastActive) return;
  const entry = selectServer(btnNode.dataset.name);
  if (!entry) return;
  const clock = startTimer();
  clock.markResolve();
  err.hidden = true;
  try {
    await play(entry, clock);
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
  const clock = startTimer();
  try {
    const res = await fetch(`/api/resolve?${queryParams()}`);
    if (!res.ok) {
      const data = await res.json();
      throw new Error(`${data.stage || 'error'}: ${data.error || 'resolve failed'}`);
    }
    await pipeNdjson(res, clock);
  } catch (e) {
    stopTimer();
    timing.hidden = true;
    showErr(e.message);
  } finally {
    btn.disabled = false;
  }
});
