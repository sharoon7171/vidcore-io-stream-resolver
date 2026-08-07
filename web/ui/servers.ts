import { formatMs } from './dom.js';

type ServerEntry = {
  name: string;
  ok?: boolean;
  ms?: number;
};

export function renderServers(node: HTMLElement, servers: ServerEntry[], active: string) {
  node.innerHTML = servers
    .map((entry) => {
      const picked = entry.name === active ? ' badge--active' : '';
      const state =
        entry.ok === true ? ' badge--ok' : entry.ok === false ? ' badge--fail' : ' badge--pending';
      const icon = entry.ok === true ? '✓' : entry.ok === false ? '✕' : '…';
      const disabled = entry.ok === false ? ' disabled' : '';
      const ms = entry.ms != null ? formatMs(entry.ms) : '…';
      return `<button type="button" class="badge${picked}${state}" data-name="${entry.name}"${disabled}><span class="badge__icon" aria-hidden="true">${icon}</span><span class="badge__name">${entry.name}</span><span class="badge__ms">${ms}</span></button>`;
    })
    .join('');
  (node.closest('.card') as HTMLElement).hidden = servers.length === 0;
}
