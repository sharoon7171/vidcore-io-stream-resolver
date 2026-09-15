import Hls, { type ErrorData, type Level } from 'hls.js';

function levelLabel(level: Level) {
  if (level.height > 0) return `${level.height}p`;
  if (level.bitrate > 0) return `${Math.round(level.bitrate / 1000)} kbps`;
  if (level.name) return level.name;
  return 'Source';
}

export function createHlsPlayer(video: HTMLVideoElement, quality: HTMLSelectElement) {
  let hls: Hls | null = null;
  let gen = 0;
  let multiLevel = false;

  function resetQualityUi() {
    multiLevel = false;
    quality.replaceChildren();
    const option = document.createElement('option');
    option.value = '-1';
    option.textContent = 'Auto';
    quality.append(option);
    quality.value = '-1';
    quality.disabled = true;
  }

  function fillQualityUi(levels: Level[]) {
    quality.replaceChildren();
    multiLevel = levels.length > 1;

    if (!multiLevel) {
      const option = document.createElement('option');
      option.value = '0';
      option.textContent = levels[0] ? levelLabel(levels[0]) : 'Source';
      quality.append(option);
      quality.value = '0';
      quality.disabled = true;
      return;
    }

    const auto = document.createElement('option');
    auto.value = '-1';
    auto.textContent = 'Auto';
    quality.append(auto);
    for (const [index, level] of levels.entries()) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = levelLabel(level);
      quality.append(option);
    }
    quality.value = '-1';
    quality.disabled = false;
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
    resetQualityUi();
  }

  quality.addEventListener('change', () => {
    if (!hls || !multiLevel) return;
    const next = Number(quality.value);
    hls.currentLevel = next;
    if (next === -1) {
      const auto = quality.querySelector('option[value="-1"]');
      if (auto) auto.textContent = 'Auto';
    }
  });

  async function play(source: string): Promise<void> {
    stop();
    const id = gen;
    const live = () => id === gen;

    if (!Hls.isSupported()) throw new Error('HLS not supported');

    await new Promise<void>((resolve, reject) => {
      const fail = (message: string) => {
        if (!live()) return;
        reject(new Error(message));
      };

      video.addEventListener(
        'playing',
        () => {
          if (live()) resolve();
        },
        { once: true },
      );
      video.addEventListener('error', () => fail('playback failed'), { once: true });

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startFragPrefetch: true,
        testBandwidth: true,
        startLevel: -1,
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
        maxBufferSize: 100 * 1000 * 1000,
        maxBufferHole: 0.5,
        backBufferLength: 30,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 15000,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (!live() || !hls) return;
        fillQualityUi(data.levels);
        void video.play().catch((error: unknown) => {
          fail(error instanceof Error ? error.message : String(error));
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!live() || !hls?.autoLevelEnabled || !multiLevel) return;
        const auto = quality.querySelector('option[value="-1"]');
        const level = hls.levels[data.level];
        if (auto) auto.textContent = level ? `Auto (${levelLabel(level)})` : 'Auto';
      });

      hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
        if (data.fatal) fail(data.error?.message || String(data.details));
      });

      hls.attachMedia(video);
      hls.loadSource(source);
    });
  }

  resetQualityUi();
  return { stop, play };
}
