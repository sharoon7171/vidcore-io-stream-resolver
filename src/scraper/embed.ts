import { siteOrigin } from '../config.js';
import { scraperHeaders } from './request.js';
import { collectCookies } from './session.js';

const EN_PATTERN = /\\"en\\":\\"([^\\"]+)\\"/;
const PROPS_PATTERN = /\\"en\\":\\"[^\\"]+\\"(.+?\\"server\\":\\"[^\\"]*\\"\})/;

type EmbedProps = {
  en: string;
  title?: string;
  year?: string | number;
};

export type EmbedSnapshot = {
  en: string;
  meta: { title?: string; year?: string | number };
  referer: string;
  jar: Map<string, string>;
};

function parseNextPropsObject(raw: string): EmbedProps {
  const normalized = raw.replace(/\\"/g, '"').replace(/"\$undefined"/g, 'null');
  const json = normalized.startsWith('{') ? normalized : `{${normalized}`;
  return JSON.parse(json) as EmbedProps;
}

function extractEmbedProps(html: string): EmbedProps {
  const match = html.match(PROPS_PATTERN);
  if (!match?.[0]) {
    const en = html.match(EN_PATTERN)?.[1];
    if (!en) throw new Error('en token not found in page payload');
    return { en };
  }
  return parseNextPropsObject(match[0]);
}

function embedPath(kind: string, id: string, { season, episode }: { season?: string; episode?: string } = {}) {
  return kind === 'tv' ? `/tv/${id}/${season}/${episode}` : `/movie/${id}`;
}

export async function scrapeEmbedPage(
  kind: string,
  id: string,
  options: { season?: string; episode?: string } = {},
): Promise<EmbedSnapshot> {
  const path = embedPath(kind, id, options);
  const jar = new Map<string, string>();
  const response = await fetch(`${siteOrigin}${path}`, {
    headers: { ...scraperHeaders, accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`page fetch failed: ${response.status} ${response.statusText}`);
  collectCookies(response, jar);
  const props = extractEmbedProps(await response.text());
  return {
    en: props.en,
    meta: { title: props.title, year: props.year },
    referer: `${siteOrigin}${path}`,
    jar,
  };
}
