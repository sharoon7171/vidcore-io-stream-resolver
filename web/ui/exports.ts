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

  if (entry.directPlayable) {
    if (entry.referer) {
      fields.vlc.value = `vlc --http-referrer='${REF}' --http-user-agent='${UA}' "${entry.url}"`;
      fields.mpv.value = `mpv --referrer='${REF}' --user-agent='${UA}' ${title} "${entry.url}"`;
    } else {
      fields.vlc.value = `vlc "${entry.url}"`;
      fields.mpv.value = `mpv ${title} "${entry.url}"`;
    }
    return;
  }

  const proxied = entry.play || entry.url;
  fields.vlc.value = `vlc "${proxied}"`;
  fields.mpv.value = `mpv ${title} "${proxied}"`;
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
