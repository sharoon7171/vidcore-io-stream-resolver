const REF = 'https://vidcore.io/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

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

type ExportServer = {
  url: string;
  play: string | null;
  proxy: boolean;
  referer: boolean;
};

function setRow(row: HTMLElement, input: HTMLInputElement, value: string) {
  input.value = value;
  row.hidden = !value;
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

  const title = `--force-media-title="${String(label).replace(/"/g, '\\"')}"`;
  const stream = entry.url;
  const proxy = entry.proxy && entry.play ? entry.play : '';
  const vlc = entry.referer
    ? `vlc --adaptive-logic=highest --http-continuous --http-referrer='${REF}' --http-user-agent='${UA}' "${stream}"`
    : `vlc --adaptive-logic=highest "${stream}"`;
  const mpv = entry.referer
    ? `mpv --referrer='${REF}' --user-agent='${UA}' --ytdl=no --hls-bitrate=max --demuxer-lavf-o=seekable=0,extension_picky=0 --stream-lavf-o=seekable=0 ${title} "${stream}"`
    : `mpv --ytdl=no --hls-bitrate=max ${title} "${stream}"`;

  setRow(fields.directRow, fields.direct, stream);
  setRow(fields.browserRow, fields.browser, proxy);
  setRow(fields.vlcRow, fields.vlc, vlc);
  setRow(fields.mpvRow, fields.mpv, mpv);
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
