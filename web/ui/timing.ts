import { formatMs } from './dom.js';

export function createPlayTimer(node: HTMLElement) {
  let playTimer: { raf: number } | null = null;

  function stop() {
    if (playTimer) {
      cancelAnimationFrame(playTimer.raf);
      playTimer = null;
    }
    node.hidden = true;
  }

  function start() {
    stop();
    node.hidden = false;
    node.textContent = 'First frame …';
    node.className = 'play-timing is-live';
    const t0 = performance.now();
    const tick = () => {
      node.textContent = `First frame ${formatMs(performance.now() - t0)}`;
      playTimer!.raf = requestAnimationFrame(tick);
    };
    playTimer = { raf: requestAnimationFrame(tick) };
    return {
      markPlay() {
        if (!playTimer) return;
        cancelAnimationFrame(playTimer.raf);
        node.textContent = `First frame ${formatMs(performance.now() - t0)}`;
        node.className = 'play-timing is-done';
        playTimer = null;
      },
    };
  }

  return { start, stop };
}
