import fs from 'node:fs';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { createVidcoreFetch } from '../vidcore/page.js';
import { vidcoreOrigin } from '../env.js';
import { patchPlayerChunk, createNativeConsole } from './patch.js';
import { createSandbox, createModuleStubs } from './sandbox.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const chunkDir = `${root}/vendor/chunks`;

const modules = {};
const moduleCache = {};
const sandbox = createSandbox();

function defineExports(exports, map) {
  for (const [key, value] of Object.entries(map)) {
    Object.defineProperty(exports, key, {
      enumerable: true,
      get: typeof value === 'function' ? value : () => value,
    });
  }
}

function webpackRequire(id) {
  if (moduleCache[id]) return moduleCache[id].exports;
  if (!modules[id]) throw new Error(`missing module ${id}`);
  const mod = { exports: {} };
  moduleCache[id] = mod;
  const req = Object.assign((rid) => webpackRequire(rid), {
    d: defineExports,
    bind: (target, ...args) => target.bind(...args),
    g: sandbox,
  });
  modules[id](mod, mod.exports, req);
  return mod.exports;
}

function registerModules(chunkEntry) {
  Object.assign(modules, chunkEntry[1]);
}

function loadChunk(filename, transform) {
  let code = fs.readFileSync(`${chunkDir}/${filename}`, 'utf8');
  if (transform) code = transform(code);
  const queue = [];
  sandbox.webpackChunk_N_E = queue;
  vm.runInContext(code, sandbox, { filename, timeout: 120000 });
  if (queue.length) registerModules(queue.shift());
}

modules['5376'] = (mod) => {
  mod.exports = { Buffer };
};
modules['7358'] = (mod) => {
  mod.exports = { env: {}, versions: { chrome: '137.0.0.0' }, browser: true };
};
modules['1590'] = (mod) => {
  mod.exports = vm;
};

loadChunk('chunk-213.js');
loadChunk('chunk-aaea2bcf.js');

const cryptoModule = webpackRequire('3018');
const vmBuffer = cryptoModule.randomBytes(1).constructor;

for (const [id, exp] of Object.entries(createModuleStubs(sandbox))) {
  modules[id] = (mod, exports, req) => {
    mod.exports = exp;
    if (req?.d) req.d(exports, { default: () => exp, __esModule: () => true });
  };
}

loadChunk('chunk-281.js', patchPlayerChunk);
webpackRequire('9987');

function requireVm(name) {
  const fn = sandbox[name];
  if (typeof fn !== 'function') throw new Error(`${name} VM not loaded`);
  return fn;
}

function buildContext(token, ctx, hooks) {
  const origin = ctx.host ? `https://${ctx.host}` : vidcoreOrigin;
  const path =
    ctx.type === 'tv'
      ? `/tv/${ctx.id || ''}${ctx.season ? `/${ctx.season}` : ''}${ctx.episode ? `/${ctx.episode}` : ''}`
      : `/movie/${ctx.id || ''}`;
  const referer = ctx.referer || `${origin}${path}`;
  sandbox.location.href = referer;
  const vidcoreFetch = createVidcoreFetch(referer);
  sandbox.fetch = vidcoreFetch;

  return {
    crypto: cryptoModule,
    encode: requireVm('__vidcoreEncode'),
    en: token,
    server: ctx.server ?? null,
    setServers: hooks.setServers,
    setState: hooks.setState,
    setFavServer: hooks.setFavServer,
    window: sandbox,
    document: sandbox.document,
    navigator: sandbox.navigator,
    localStorage: sandbox.localStorage,
    console: createNativeConsole(console),
    JSON,
    Math,
    Date,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Symbol,
    Function,
    screen: sandbox.screen,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    NaN,
    Infinity,
    undefined,
    Promise,
    Proxy,
    Reflect,
    Uint8Array,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    BigInt,
    fetch: vidcoreFetch,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    AbortSignal,
    AbortController,
    Buffer: vmBuffer,
    atob: sandbox.atob,
    btoa: sandbox.btoa,
  };
}

export async function runResolver(token, ctx = {}) {
  const resolve = requireVm('__vidcoreResolve');
  const init = requireVm('__vidcoreInit');

  const servers = [];
  const state = { value: null };
  let listMoBody = null;
  const resolverCtx = buildContext(token, ctx, {
    setServers: (list) => servers.push(list.map((entry) => ({ ...entry }))),
    setState: (value) => {
      state.value = value;
    },
    setFavServer: () => {},
  });

  const captureListMo = async (url, init, fetchFn) => {
    const response = await fetchFn();
    if (init.method === 'POST' && (/\/(?:u)?mo\//.test(url) || /\/\d{10,}\/[0-9a-f-]{36}\//.test(url)) && !listMoBody && response.ok) {
      listMoBody = await response.clone().text();
    }
    return response;
  };

  const upstreamFetch = typeof ctx.fetch === 'function' ? ctx.fetch : resolverCtx.fetch;
  resolverCtx.fetch = async (input, init = {}) =>
    captureListMo(String(input), init, () => upstreamFetch(input, init));

  sandbox.fetch = resolverCtx.fetch;
  init();

  for (const key of ['crypto', 'encode', 'en', 'server', 'setServers', 'setState', 'setFavServer', 'fetch']) {
    sandbox[key] = resolverCtx[key];
  }

  await resolve(resolverCtx);

  const deadline = Date.now() + (ctx.timeoutMs ?? 45000);
  while (servers.length === 0 && state.value == null && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 16));
  }

  if (state.value === 500) throw new Error('resolver API error');
  if (servers.length === 0) throw new Error('server list empty');

  let activeServers = servers.at(-1);
  if (listMoBody) {
    const decrypted = await decryptMoBody(listMoBody, resolverCtx);
    if (Array.isArray(decrypted) && decrypted.length) activeServers = decrypted;
  }

  return { servers: [activeServers], vmCtx: { ...resolverCtx, listMoBody } };
}

let streamMoPrefix;

export function getStreamMoPath(server) {
  if (!server?.data) throw new Error('server missing data token');
  if (!streamMoPrefix) {
    const decodeUnsalted = requireVm('__vidcoreDecodeUnsalted');
    const decodeSalted = requireVm('__vidcoreDecodeSalted');
    streamMoPrefix = `${decodeUnsalted(541)}/${decodeSalted(2937, 'yFkk')}`;
  }
  return `${streamMoPrefix}/${server.data}`;
}

export async function decryptMoBody(body, ctx) {
  const dr = [];
  await requireVm('__vidcoreDecrypt')({ ...ctx, dr, rs: body });
  if (dr[0] == null) throw new Error('MO decrypt failed');
  return dr[0];
}
