import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createVidcoreFetch } from '../vidcore/page.js';
import { createNativeConsole, patchPlayerChunk } from './patch.js';
import { ua, vidcoreOrigin } from '../env.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const chunkDir = `${root}/vendor/chunks`;

const modules = {};
const moduleCache = {};

function defineExports(exports, map) {
  for (const [key, value] of Object.entries(map)) {
    Object.defineProperty(exports, key, {
      enumerable: true,
      get: typeof value === 'function' ? value : () => value,
    });
  }
}

function createSandbox(referer = `${vidcoreOrigin}/`) {
  const window = new Window({
    url: referer,
    width: 1920,
    height: 1080,
  });

  Object.assign(window, {
    webpackChunk_N_E: [],
    chrome: { runtime: {}, app: {}, csi: () => ({}) },
    devicePixelRatio: 2,
    isSecureContext: true,
    indexedDB: null,
    queueMicrotask,
    structuredClone: globalThis.structuredClone,
    crypto: globalThis.crypto,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    AbortSignal,
    AbortController,
    MediaSource: class {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    Worker: class {
      postMessage() {}
      terminate() {}
      addEventListener() {}
    },
    MessageChannel: class {
      constructor() {
        this.port1 = { postMessage: () => {}, start: () => {}, addEventListener: () => {} };
        this.port2 = { postMessage: () => {}, start: () => {}, addEventListener: () => {} };
      }
    },
    BroadcastChannel: class {
      postMessage() {}
      close() {}
      addEventListener() {}
    },
    Blob: class {},
    WebSocket: class {
      send() {}
      close() {}
      addEventListener() {}
    },
    XMLHttpRequest: class {
      open() {}
      send() {}
      setRequestHeader() {}
      addEventListener() {}
    },
    requestIdleCallback: (fn) => setTimeout(fn, 1),
    cancelIdleCallback: clearTimeout,
    fetch: createVidcoreFetch(referer),
  });

  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
  Object.defineProperty(window.navigator, 'vendor', { value: 'Google Inc.', configurable: true });
  Object.defineProperty(window.navigator, 'webdriver', { value: false, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true });
  Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['en-US', 'en'], configurable: true });
  Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 8, configurable: true });
  Object.defineProperty(window.navigator, 'deviceMemory', { value: 8, configurable: true });
  Object.defineProperty(window.navigator, 'plugins', { value: { length: 5 }, configurable: true });
  Object.defineProperty(window.navigator, 'storage', {
    value: { estimate: async () => ({ quota: 2147483648, usage: 0 }) },
    configurable: true,
  });

  window.console = createNativeConsole(console);
  window.self = window;
  window.globalThis = window;

  vm.createContext(window);
  return window;
}

const sandbox = createSandbox();

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
  const [, mods] = chunkEntry;
  Object.assign(modules, mods);
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

let cryptoModule = {};
let vmBuffer = Buffer;

cryptoModule = webpackRequire('3018');
vmBuffer = cryptoModule.randomBytes(1).constructor;

const reactStub = new Proxy(function ReactStub() {}, {
  get: (_, prop) => {
    if (prop === '__esModule') return true;
    if (prop === 'default') return ReactStub;
    if (prop === 'useState') return (init) => [init, () => {}];
    if (prop === 'useEffect') return () => {};
    if (prop === 'useRef') return (init) => ({ current: init });
    if (prop === 'useCallback') return (fn) => fn;
    if (prop === 'useMemo') return (fn) => fn();
    if (prop === 'useLayoutEffect') return () => {};
    if (prop === 'Fragment') return 'Fragment';
    if (prop === 'createElement') return () => ({});
    if (prop === 'jsx') return () => ({});
    if (prop === 'jsxs') return () => ({});
    if (prop === 'forwardRef') return (fn) => fn;
    return () => ({});
  },
});

const stubs = {
  5155: reactStub,
  8288: {
    useRouter: () => ({ push: () => {} }),
    usePathname: () => new URL(sandbox.location.href).pathname,
  },
  63: reactStub,
  2115: reactStub,
  8613: {},
  6497: {},
  4352: {},
  3396: {},
  6368: {},
  5216: {},
  153: { hb: () => ({}) },
  2421: { f: async () => ({ cues: [] }) },
};

for (const [id, exp] of Object.entries(stubs)) {
  modules[id] = (mod, exports, req) => {
    mod.exports = exp;
    if (req?.d) req.d(exports, { default: () => exp, __esModule: () => true });
  };
}

loadChunk('chunk-281.js', patchPlayerChunk);

webpackRequire('9987');

function encodeWithVmBuffer(input) {
  const buf = vmBuffer.isBuffer(input) ? input : vmBuffer.from(input);
  const cu = sandbox.__vidcoreCU;
  if (typeof cu !== 'function') {
    throw new Error('encoder VM not loaded');
  }
  return cu(buf);
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
    encode: encodeWithVmBuffer,
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
  const runtime = sandbox;
  if (typeof runtime._0x4cb986 !== 'function') {
    throw new Error('resolver VM not loaded');
  }

  const servers = [];
  const state = { value: null };
  const resolverCtx = buildContext(token, ctx, {
    setServers: (list) => servers.push(structuredClone(list)),
    setState: (value) => {
      state.value = value;
    },
    setFavServer: () => {},
  });

  if (typeof ctx.fetch === 'function') {
    resolverCtx.fetch = ctx.fetch;
    sandbox.fetch = ctx.fetch;
  }

  if (typeof runtime._0x11418f === 'function') {
    runtime._0x11418f();
  }

  if (typeof sandbox.__vidcoreAe8 === 'function') {
    sandbox.__vidcoreAe8();
  }

  await runtime._0x4cb986(resolverCtx);

  const deadline = Date.now() + (ctx.timeoutMs ?? 45000);
  while (servers.length === 0 && state.value !== 500 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { servers, vmCtx: resolverCtx };
}

export function getStreamMoPath(server) {
  if (!server?.data) {
    throw new Error('server missing data token');
  }
  if (typeof sandbox.__vidcoreC4 !== 'function') {
    throw new Error('stream path decoder not loaded');
  }
  const base = sandbox.__vidcoreC4(2151);
  const pen = sandbox.__vidcoreC4(3556);
  return `${base}/${pen}/${server.data}`;
}

export async function decryptMoBody(body, ctx) {
  if (typeof sandbox.__vidcoreAA !== 'function') {
    throw new Error('MO decrypt VM not loaded');
  }
  const dr = [];
  await sandbox.__vidcoreAA({ ...ctx, dr, rs: body });
  if (dr[0] == null) {
    throw new Error('MO decrypt failed');
  }
  return dr[0];
}
