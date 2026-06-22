import { vidcoreOrigin } from '../env.js';
import { browserHeaders, mergeHeaders, resolveUrl } from './headers.js';
import { collectCookies } from './session.js';

const EN_PATTERN = /\\"en\\":\\"([^\\"]+)\\"/;
const PROPS_PATTERN = /\\"en\\":\\"[^\\"]+\\"(.+?\\"server\\":\\"[^\\"]*\\"\})/;

function parseNextPropsObject(raw) {
  const normalized = raw.replace(/\\"/g, '"').replace(/"\$undefined"/g, 'null');
  const json = normalized.startsWith('{') ? normalized : `{${normalized}`;
  return JSON.parse(json);
}

function extractEnToken(html) {
  const match = html.match(EN_PATTERN);
  if (!match?.[1]) throw new Error('en token not found in page payload');
  return match[1];
}

function extractPageProps(html) {
  const match = html.match(PROPS_PATTERN);
  if (!match?.[0]) return { en: extractEnToken(html) };
  return parseNextPropsObject(match[0]);
}

function embedPath(kind, id, { season, episode } = {}) {
  return kind === 'tv' ? `/tv/${id}/${season}/${episode}` : `/movie/${id}`;
}

export function createVidcoreFetch(referer) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  return async (input, init = {}) =>
    nativeFetch(resolveUrl(input), {
      ...init,
      headers: mergeHeaders(referer, init.headers),
    });
}

export async function fetchEmbed(kind, id, options = {}) {
  const path = embedPath(kind, id, options);
  const url = `${vidcoreOrigin}${path}`;
  const jar = new Map();
  const response = await fetch(url, {
    headers: { ...browserHeaders, accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`page fetch failed: ${response.status} ${response.statusText}`);
  collectCookies(response, jar);
  const props = extractPageProps(await response.text());
  return {
    en: props.en,
    props,
    meta: { title: props.title, year: props.year },
    type: kind,
    id,
    referer: `${vidcoreOrigin}${path}`,
    jar,
  };
}
