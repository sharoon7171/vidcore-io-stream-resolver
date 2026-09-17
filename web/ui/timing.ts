export function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function createTimers(resolveEl: HTMLElement, playEl: HTMLElement) {
  let raf: number | null = null;

  function stop() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  function paint(el: HTMLElement, ms: number | null, live = false) {
    if (ms === null) {
      el.textContent = '—';
      el.className = 'time__val';
      return;
    }
    el.textContent = fmtMs(ms);
    el.className = live ? 'time__val is-live' : 'time__val is-done';
  }

  function beginResolve() {
    stop();
    paint(resolveEl, 0, true);
    paint(playEl, null);
    const t0 = performance.now();
    const tick = () => {
      resolveEl.textContent = fmtMs(performance.now() - t0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return stop;
  }

  function beginPlayback() {
    stop();
    paint(playEl, 0, true);
    const t0 = performance.now();
    const tick = () => {
      playEl.textContent = fmtMs(performance.now() - t0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stop();
      const ms = performance.now() - t0;
      paint(playEl, ms);
      return ms;
    };
  }

  function showServer(resolveMs: number | null, playMs: number | null) {
    stop();
    paint(resolveEl, resolveMs);
    paint(playEl, playMs);
  }

  function reset() {
    stop();
    paint(resolveEl, null);
    paint(playEl, null);
  }

  return { beginResolve, beginPlayback, showServer, reset };
}
