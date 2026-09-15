export const SERVER_ORDER = ['Orbit', 'Supreme', 'Prime', 'Premiere 4K', 'Horizon'] as const;

export type ServerEntry = {
  name: string;
  status: 'idle' | 'loading' | 'ok' | 'fail';
  resolveMs: number | null;
  playMs: number | null;
  url: string | null;
  play: string | null;
  proxy: boolean;
  referer: boolean;
  directPlayable: boolean;
};

export function idleServers(): ServerEntry[] {
  return SERVER_ORDER.map((name) => ({
    name,
    status: 'idle' as const,
    resolveMs: null,
    playMs: null,
    url: null,
    play: null,
    proxy: false,
    referer: false,
    directPlayable: false,
  }));
}

export function renderServers(
  root: HTMLElement,
  servers: ServerEntry[],
  active: string,
  fmtMs: (ms: number) => string,
) {
  root.innerHTML = servers
    .map((entry) => {
      const picked = entry.name === active ? ' badge--active' : '';
      const state =
        entry.status === 'ok'
          ? ' badge--ok'
          : entry.status === 'fail'
            ? ' badge--fail'
            : entry.status === 'loading'
              ? ' badge--loading'
              : '';
      const mark =
        entry.status === 'ok'
          ? '<span class="badge__mark">✓</span>'
          : entry.status === 'fail'
            ? '<span class="badge__mark">✕</span>'
            : entry.status === 'loading'
              ? '<span class="badge__mark">…</span>'
              : '';
      const ms =
        entry.resolveMs !== null
          ? `<span class="badge__ms">${fmtMs(entry.resolveMs)}</span>`
          : '';
      return `<button type="button" class="badge${state}${picked}" data-name="${entry.name}"${entry.status === 'loading' ? ' disabled' : ''}>${mark}<span class="badge__name">${entry.name}</span>${ms}</button>`;
    })
    .join('');
}
