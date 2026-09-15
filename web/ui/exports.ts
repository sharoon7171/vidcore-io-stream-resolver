const REF = 'https://vidcore.io/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export type ExportFields = {
  direct: HTMLInputElement;
  browser: HTMLInputElement;
  browserRow: HTMLElement;
  vlc: HTMLInputElement;
  mpv: HTMLInputElement;
};

type ExportServer = {
  url: string;
  play: string | null;
  external: string | null;
  proxy: boolean;
  referer: boolean;
  directPlayable: boolean;
};

export function clearExports(fields: ExportFields) {
  fields.direct.value = '';
  fields.browser.value = '';
  fields.vlc.value = '';
  fields.mpv.value = '';
  fields.browserRow.hidden = true;
}

export function bindExports(fields: ExportFields, entry: ExportServer, label: string) {
  fields.direct.value = entry.url;
  fields.browser.value = entry.proxy && entry.play ? entry.play : '';
  fields.browserRow.hidden = !(entry.proxy && entry.play);

  if (!entry.url) {
    fields.vlc.value = '';
    fields.mpv.value = '';
    return;
  }

  const title = `--force-media-title="${String(label).replace(/"/g, '\\"')}"`;
  const stream = entry.external || (entry.directPlayable ? entry.url : entry.play || entry.url);
  const needsRef = entry.referer && Boolean(entry.external || entry.directPlayable);

  if (needsRef) {
    fields.vlc.value = `vlc --http-referrer='${REF}' --http-user-agent='${UA}' "${stream}"`;
    fields.mpv.value = `mpv --referrer='${REF}' --user-agent='${UA}' --ytdl=no ${title} "${stream}"`;
    return;
  }

  fields.vlc.value = `vlc "${stream}"`;
  fields.mpv.value = `mpv --ytdl=no ${title} "${stream}"`;
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
