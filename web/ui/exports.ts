const REF = 'https://vidcore.net/';

type Entry = {
  url: string;
  referer?: boolean;
  play?: string;
};

type ExportEls = {
  direct: HTMLInputElement;
  vlc: HTMLInputElement;
  mpv: HTMLInputElement;
  browser: HTMLInputElement;
  browserRow: HTMLElement;
};

export function bindExports(
  els: ExportEls,
  { entry, label, viaProxy }: { entry: Entry; label: string; viaProxy: boolean },
) {
  els.direct.value = entry.url;
  els.vlc.value = entry.referer
    ? `vlc --http-referrer='${REF}' "${entry.url}"`
    : `vlc "${entry.url}"`;
  const title = `--force-media-title="${String(label).replace(/"/g, '\\"')}"`;
  els.mpv.value = entry.referer
    ? `mpv --referrer='${REF}' ${title} "${entry.url}"`
    : `mpv ${title} "${entry.url}"`;
  els.browser.value = viaProxy && entry.play ? entry.play : '';
  els.browserRow.hidden = !(viaProxy && entry.play);
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
