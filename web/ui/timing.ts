export function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function createTimers(resolveEl: HTMLElement, playEl: HTMLElement, panel: HTMLElement) {
  let raf: number | null = null;

  function stop() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  function showResolve(ms: number | null) {
    panel.hidden = false;
    if (ms === null) {
      resolveEl.textContent = '—';
      resolveEl.className = 'timing__val';
      return;
    }
    resolveEl.textContent = fmtMs(ms);
    resolveEl.className = 'timing__val is-done';
  }

  function showPlay(ms: number | null) {
    panel.hidden = false;
    if (ms === null) {
      playEl.textContent = '—';
      playEl.className = 'timing__val';
      return;
    }
    playEl.textContent = fmtMs(ms);
    playEl.className = 'timing__val is-done';
  }

  function beginResolve() {
    stop();
    panel.hidden = false;
    resolveEl.textContent = '0ms';
    resolveEl.className = 'timing__val is-live';
    playEl.textContent = '—';
    playEl.className = 'timing__val';
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
    playEl.textContent = '0ms';
    playEl.className = 'timing__val is-live';
    const t0 = performance.now();
    const tick = () => {
      playEl.textContent = fmtMs(performance.now() - t0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stop();
      const ms = performance.now() - t0;
      playEl.textContent = fmtMs(ms);
      playEl.className = 'timing__val is-done';
      return ms;
    };
  }

  function showServer(resolveMs: number | null, playMs: number | null) {
    stop();
    showResolve(resolveMs);
    showPlay(playMs);
  }

  return {
    beginResolve,
    beginPlayback,
    showServer,
    hide: () => {
      stop();
      panel.hidden = true;
    },
  };
}
