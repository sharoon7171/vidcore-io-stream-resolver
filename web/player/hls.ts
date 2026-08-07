import Hls from 'hls.js';

export function createHlsPlayer(video: HTMLVideoElement) {
  let hls: Hls | null = null;
  let gen = 0;

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

  function play(source: string) {
    stop();
    const id = gen;
    const live = () => id === gen;

    return new Promise<void>((resolve, reject) => {
      const finish = (ok: boolean, message?: string) => {
        if (!live()) return;
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onVideoError);
        if (ok) resolve();
        else reject(new Error(message));
      };
      const onPlaying = () => finish(true);
      const onVideoError = () => finish(false, 'playback failed');

      video.addEventListener('playing', onPlaying);
      video.addEventListener('error', onVideoError);

      if (Hls.isSupported()) {
        hls = new Hls();
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (live()) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) finish(false, data.details || 'playback failed');
        });
        hls.attachMedia(video);
        hls.loadSource(source);
        return;
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
        video.addEventListener('canplay', () => live() && video.play().catch(() => {}), { once: true });
        return;
      }

      finish(false, 'HLS not supported');
    });
  }

  return { stop, play };
}
