export type ExportFields = {
  card: HTMLElement;
  direct: HTMLInputElement;
  directRow: HTMLElement;
  browser: HTMLInputElement;
  browserRow: HTMLElement;
  vlc: HTMLInputElement;
  vlcRow: HTMLElement;
  mpv: HTMLInputElement;
  mpvRow: HTMLElement;
};

type ExportCli = {
  vlcArgs: string[];
  mpvArgs: string[];
  mediaTitle: boolean;
};

type ExportServer = {
  url: string;
  play: string | null;
  proxy: boolean;
  referer: boolean;
  refererUrl: string | null;
  userAgent: string | null;
  cli: ExportCli | null;
};

function setRow(row: HTMLElement, input: HTMLInputElement, value: string) {
  input.value = value;
  row.hidden = !value;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildVlc(entry: ExportServer, stream: string) {
  if (entry.cli) {
    const parts = ['vlc'];
    if (entry.referer && entry.refererUrl) parts.push(`--http-referrer=${shellQuote(entry.refererUrl)}`);
    if (entry.userAgent) parts.push(`--http-user-agent=${shellQuote(entry.userAgent)}`);
    for (const arg of entry.cli.vlcArgs) parts.push(arg);
    parts.push(`"${stream}"`);
    return parts.join(' ');
  }
  const ref = entry.refererUrl;
  const ua = entry.userAgent;
  return entry.referer && ref && ua
    ? `vlc --adaptive-logic=highest --http-continuous --http-referrer='${ref}' --http-user-agent='${ua}' "${stream}"`
    : `vlc --adaptive-logic=highest "${stream}"`;
}

function buildMpv(entry: ExportServer, stream: string, label: string) {
  const title = `--force-media-title="${String(label).replace(/"/g, '\\"')}"`;
  if (entry.cli) {
    const parts = ['mpv'];
    if (entry.referer && entry.refererUrl) parts.push(`--referrer=${shellQuote(entry.refererUrl)}`);
    if (entry.userAgent) parts.push(`--user-agent=${shellQuote(entry.userAgent)}`);
    for (const arg of entry.cli.mpvArgs) parts.push(arg);
    if (entry.cli.mediaTitle) parts.push(title);
    parts.push(`"${stream}"`);
    return parts.join(' ');
  }
  const ref = entry.refererUrl;
  const ua = entry.userAgent;
  return entry.referer && ref && ua
    ? `mpv --referrer='${ref}' --user-agent='${ua}' --ytdl=no --hls-bitrate=max --demuxer-lavf-o=seekable=0,extension_picky=0 --stream-lavf-o=seekable=0 ${title} "${stream}"`
    : `mpv --ytdl=no --hls-bitrate=max ${title} "${stream}"`;
}

export function clearExports(fields: ExportFields) {
  setRow(fields.directRow, fields.direct, '');
  setRow(fields.browserRow, fields.browser, '');
  setRow(fields.vlcRow, fields.vlc, '');
  setRow(fields.mpvRow, fields.mpv, '');
  fields.card.hidden = true;
}

export function bindExports(fields: ExportFields, entry: ExportServer, label: string) {
  if (!entry.url) {
    clearExports(fields);
    return;
  }

  const stream = entry.url;
  const proxy = entry.proxy && entry.play ? entry.play : '';

  setRow(fields.directRow, fields.direct, stream);
  setRow(fields.browserRow, fields.browser, proxy);
  setRow(fields.vlcRow, fields.vlc, buildVlc(entry, stream));
  setRow(fields.mpvRow, fields.mpv, buildMpv(entry, stream, label));
  fields.card.hidden = false;
}

export function bindCopyButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((node) => {
    node.addEventListener('click', async () => {
      const field = document.getElementById(node.dataset.copy!) as HTMLInputElement;
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
}
