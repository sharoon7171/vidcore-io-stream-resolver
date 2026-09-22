import vm from 'node:vm';
import { siteOrigin } from '../config.js';
import {
  extractHexSeed,
  extractXorTableConsts,
  scanAhSealMaterial,
  type SealMaterial,
} from '../crypto/ah-seal-material.js';
import { scanAzDecryptMaterial, type AzDecryptMaterial } from '../crypto/az-material.js';
import { setCatalogDecryptMaterial } from '../crypto/catalog-decrypt.js';
import { setSealMaterial } from '../crypto/seal.js';
import { scraperHeaders } from './request.js';

export type CatalogRoutes = {
  base: string;
  listAction: string;
  streamAction: string;
  method: string;
  headers: Record<string, string>;
};

export type PlayerMaterial = {
  routes: CatalogRoutes;
  decrypt: AzDecryptMaterial;
  seal: SealMaterial;
  chunkUrl: string;
};

type StringSandbox = {
  aQ: (n: number, salt?: string) => string;
  c6: (n: number, salt: string) => string;
};

let cached: PlayerMaterial | null = null;
let cachedAt = 0;
const TTL_MS = 300_000;

function extractFn(src: string, startMarker: string) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`missing ${startMarker}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${startMarker}`);
}

function loadSandbox(chunk: string): StringSandbox {
  const aT = extractFn(chunk, 'function aT()');
  const aQ = extractFn(chunk, 'function aQ(');
  const c6 = extractFn(chunk, 'function c6(');
  const shuffleStart = chunk.indexOf('!function(t,e){let o=c6,W=c6,n=c6,r=aQ');
  if (shuffleStart < 0) throw new Error('missing aT shuffle');
  const shuffleEnd = chunk.indexOf('}(aT,', shuffleStart);
  if (shuffleEnd < 0) throw new Error('unterminated aT shuffle');
  const shuffleClose = chunk.indexOf(')', shuffleEnd + 5);
  const shuffle = chunk.slice(shuffleStart, shuffleClose + 2);
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext([aT, c6, aQ, 'globalThis.aT=aT;globalThis.c6=c6;globalThis.aQ=aQ;', shuffle].join('\n'), sandbox);
  return sandbox as unknown as StringSandbox;
}

function decodeXor(src: string, enc: BufferEncoding, x: number) {
  const b = Buffer.from(src, enc);
  for (let i = 0; i < b.length; i++) b[i] ^= x;
  return b;
}

function shiftMinus4(s: string) {
  return [...s].map((ch) => String.fromCharCode(ch.charCodeAt(0) - 4)).join('');
}

function parseCall(expr: string) {
  const m = expr.match(/([a-zA-Z_$][\w$]*)\((\d+)(?:,\s*"([^"]*)")?\)/);
  if (!m) throw new Error('bad call ' + expr);
  return { fn: m[1], n: Number(m[2]), salt: m[3] };
}

function resolveString(sb: StringSandbox, call: string) {
  const { fn, n, salt } = parseCall(call);
  if (fn.startsWith('c') && fn.length <= 2 && salt !== undefined) return sb.c6(n, salt);
  return sb.aQ(n);
}

function buildAz(sb: StringSandbox, chunk: string) {
  const aJDef = chunk.match(/var aJ=([a-zA-Z_$][\w$]*)\((\d+),"([^"]+)"\)/);
  const aRDef = chunk.match(/var aR=([a-zA-Z_$][\w$]*)\((\d+)\)/);
  const aP = chunk.match(/var aP=function\(t,e\)\{[^}]*\^=(\d+);return o\}\(([a-zA-Z_$][\w$]*\(\d+,"[^"]*"\))/);
  const ap = chunk.match(/var ap=function\(t,e\)\{[^}]*\^=(\d+);return o\}\(([a-zA-Z_$][\w$]*\(\d+,"[^"]*"\))/);
  const ax = chunk.match(/var ax=cV\[[^\]]+\]\(([a-zA-Z_$][\w$]*\(\d+\)),/);
  if (!aJDef || !aRDef || !aP || !ap || !ax) throw new Error('aZ blob recipes missing');
  const aJ = shiftMinus4(sb.c6(Number(aJDef[2]), aJDef[3]));
  const aR = shiftMinus4(sb.aQ(Number(aRDef[2])));
  return Buffer.concat([
    Buffer.from(resolveString(sb, ax[1]), aR as BufferEncoding),
    decodeXor(resolveString(sb, ap[2]), aJ as BufferEncoding, Number(ap[1])),
    decodeXor(resolveString(sb, aP[2]), aJ as BufferEncoding, Number(aP[1])),
  ]);
}

function buildAh(sb: StringSandbox, chunk: string) {
  const ar = chunk.match(/var ar=cV\[[^\]]+\]\(([a-zA-Z_$][\w$]*\(\d+\)),/);
  const an = chunk.match(/var an=function\(t,e\)\{[^}]*\^=(\d+);return o\}\(([a-zA-Z_$][\w$]*\(\d+,"[^"]*"\))/);
  const am = chunk.match(/var am=function\(t,e\)\{[^}]*\^=(\d+);return o\}\(([a-zA-Z_$][\w$]*\(\d+\))/);
  const al = chunk.match(/var al=function\(t,e\)\{[^}]*\^=(\d+);return o\}\(([a-zA-Z_$][\w$]*\(\d+\))/);
  const aa = chunk.match(/var aa=cV\[[^\]]+\]\(([a-zA-Z_$][\w$]*\(\d+,"[^"]*"\)),/);
  const aRDef = chunk.match(/var aR=([a-zA-Z_$][\w$]*)\((\d+)\)/);
  const acStart = chunk.indexOf('var ac=new Uint8Array([');
  if (!ar || !an || !am || !al || !aa || !aRDef || acStart < 0) throw new Error('ah blob recipes missing');
  const acEnd = chunk.indexOf(']);', acStart);
  if (acEnd < 0) throw new Error('unterminated ac');
  const ac = Buffer.from(
    JSON.parse('[' + chunk.slice(acStart + 'var ac=new Uint8Array(['.length, acEnd) + ']') as number[],
  );
  const aaEnc = shiftMinus4(sb.aQ(Number(aRDef[2]))) as BufferEncoding;
  return Buffer.concat([
    Buffer.from(resolveString(sb, ar[1]), 'base64'),
    ac,
    decodeXor(resolveString(sb, al[2]), 'base64', Number(al[1])),
    decodeXor(resolveString(sb, an[2]), 'base64', Number(an[1])),
    decodeXor(resolveString(sb, am[2]), 'base64', Number(am[1])),
    Buffer.from(resolveString(sb, aa[1]), aaEnc),
  ]);
}

function mintRoutes(sb: StringSandbox, chunk: string, listAction: string): CatalogRoutes {
  const fetchAt = chunk.indexOf('fetch(""');
  if (fetchAt < 0) throw new Error('catalog fetch missing');
  const fetchCtx = chunk.slice(fetchAt, fetchAt + 320);
  const baseCall = fetchCtx.match(/([a-zA-Z_$][\w$]*\(\d+,\s*"[^"]*"\))/);
  const streamCall = fetchCtx.match(/"\/"\)\[[^\]]+\]\(([a-zA-Z_$][\w$]*\(\d+\))/);
  const methodCall = fetchCtx.match(/method:([a-zA-Z_$][\w$]*\(\d+,\s*"[^"]*"\))/);
  const headersMatch = fetchCtx.match(
    /JSON\[[^\]]+\]\(([a-zA-Z_$][\w$]*)\((\d+),([a-zA-Z_$][\w$]*)\)\)/,
  );
  if (!baseCall || !streamCall || !methodCall || !headersMatch) throw new Error('catalog route calls missing');
  const saltAt = chunk.lastIndexOf(`${headersMatch[3]}="`, fetchAt);
  if (saltAt < 0) throw new Error('catalog headers salt missing');
  const saltLit = chunk.slice(saltAt).match(/^[a-zA-Z_$][\w$]*="([^"]*)"/);
  if (!saltLit) throw new Error('catalog headers salt missing');
  const base = resolveString(sb, baseCall[1]);
  const streamAction = resolveString(sb, streamCall[1]);
  const method = resolveString(sb, methodCall[1]);
  const headersJson = resolveString(sb, `${headersMatch[1]}(${headersMatch[2]},"${saltLit[1]}")`);
  if (!base.startsWith('/') || !base.includes('/se')) throw new Error('bad catalog base from player');
  if (!listAction || !streamAction) throw new Error('bad catalog actions');
  if (!method) throw new Error('bad catalog method');
  return {
    base,
    listAction,
    streamAction,
    method,
    headers: JSON.parse(headersJson) as Record<string, string>,
  };
}

function candidateChunkPaths(html: string) {
  const paths = [
    ...html.matchAll(/\/_next\/static\/chunks\/\d+-[a-f0-9]+\.js/g),
  ].map((m) => m[0]);
  return [...new Set(paths)];
}

function isPlayerChunk(src: string) {
  return src.includes('function aT()') && src.includes("cQ=JSON.parse('");
}

async function fetchPlayerChunk(html: string) {
  const paths = candidateChunkPaths(html);
  if (!paths.length) throw new Error('player chunk candidates missing');
  const ctrl = new AbortController();
  try {
    return await Promise.any(
      paths.map(async (path) => {
        const url = `${siteOrigin}${path}`;
        const res = await fetch(url, {
          headers: { ...scraperHeaders, accept: '*/*' },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('chunk status');
        const text = await res.text();
        if (!isPlayerChunk(text)) throw new Error('not player');
        ctrl.abort();
        return { url, text };
      }),
    );
  } catch {
    throw new Error('player chunk not found');
  }
}

export async function loadPlayerMaterial(opts: { html: string }): Promise<PlayerMaterial> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (!opts.html) throw new Error('embed html required for player material');

  const { url: chunkUrl, text: chunk } = await fetchPlayerChunk(opts.html);
  const sb = loadSandbox(chunk);
  const xor = extractXorTableConsts(chunk);
  const ahSeed = extractHexSeed(chunk, 'ah');
  const azSeed = extractHexSeed(chunk, 'aZ');
  const ah = buildAh(sb, chunk);
  const decrypt = scanAzDecryptMaterial(buildAz(sb, chunk), azSeed, xor);
  const seal = scanAhSealMaterial(ah, ahSeed, chunk, xor);
  const routes = mintRoutes(sb, chunk, seal.listAction);

  setCatalogDecryptMaterial(decrypt);
  setSealMaterial(seal);

  cached = { routes, decrypt, seal, chunkUrl };
  cachedAt = Date.now();
  return cached;
}
