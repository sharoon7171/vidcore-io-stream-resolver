import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import { siteOrigin } from '../config.js';
import type { ScraperFetch } from '../scraper/session.js';
import { loadPlayerChunks, mintCatalogBase, mintStreamAction, type PlayerChunks } from './chunks.js';
import { createNativeConsole, patchPlayerChunk } from './patch.js';
import { createSandbox } from './sandbox.js';

type VmHooks = {
  __vidcoreEncode: (input: Buffer) => string;
  __vidcoreResolve: (ctx: Record<string, unknown>) => Promise<void> | void;
  __vidcoreDecrypt: (ctx: Record<string, unknown>) => Promise<void> | void;
  __vidcoreInit?: () => void;
  __vidcoreDecodeUnsalted: (index: number) => string;
  __vidcoreDecodeSalted: (index: number, key: string) => string;
};

export type CatalogServer = {
  name: string;
  data?: string;
};

type VmSession = {
  listServers: (en: string, scraperFetch: ScraperFetch, referer: string) => Promise<CatalogServer[]>;
  unlockServer: (
    server: CatalogServer,
    scraperFetch: ScraperFetch,
    en?: string,
  ) => Promise<{ url: string }>;
};

type WebpackModule = (
  module: { exports: unknown },
  exports: unknown,
  require: NodeRequire & Record<string, unknown>,
) => void;

function stubExport() {
  const stub: unknown = new Proxy(function Stub() {
    return null;
  }, {
    get: (_, prop) => {
      if (prop === '__esModule') return true;
      if (prop === 'default') return stub;
      if (prop === 'then') return undefined;
      return stub;
    },
    apply: () => stub,
    construct: () => stub,
  });
  return stub;
}

function createRuntime(chunks: PlayerChunks) {
  const sandbox = createSandbox(`${siteOrigin}/`) as Window & VmHooks & { webpackChunk_N_E: unknown[] };
  const modules: Record<string, WebpackModule> = {};
  const moduleCache: Record<string, { exports: unknown }> = {};

  function defineExports(exports: object, map: Record<string, unknown>) {
    for (const [key, value] of Object.entries(map)) {
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: typeof value === 'function' ? (value as () => unknown) : () => value,
      });
    }
  }

  function webpackRequire(id: string | number) {
    const key = String(id);
    if (moduleCache[key]) return moduleCache[key].exports;
    if (!modules[key]) {
      moduleCache[key] = { exports: stubExport() };
      return moduleCache[key].exports;
    }
    const mod = { exports: {} as unknown };
    moduleCache[key] = mod;
    const req = Object.assign((rid: string | number) => webpackRequire(rid), {
      d: defineExports,
      e: async () => ({}),
      t: (m: unknown) => m,
      o: (obj: object, prop: string) => Object.prototype.hasOwnProperty.call(obj, prop),
      n: (m: { __esModule?: boolean; default?: unknown }) => (m?.__esModule ? m.default : m),
      r: () => {},
      bind: (target: (...args: unknown[]) => unknown, ...args: unknown[]) => target.bind(...args),
      g: sandbox,
    });
    modules[key](mod, mod.exports, req as never);
    return mod.exports;
  }

  function loadSource(code: string, filename: string, transform?: (src: string) => string) {
    const source = transform ? transform(code) : code;
    const queue: unknown[] = [];
    sandbox.webpackChunk_N_E = queue;
    vm.runInContext(source, sandbox, { filename, timeout: 120000 });
    while (queue.length) {
      const entry = queue.shift() as [unknown, Record<string, WebpackModule>];
      Object.assign(modules, entry[1]);
    }
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

  loadSource(chunks.react, 'chunk-react.js');
  loadSource(chunks.emotion, 'chunk-emotion.js');
  loadSource(chunks.shared, 'chunk-shared.js');
  loadSource(chunks.crypto, 'chunk-crypto.js');
  const cryptoModule = webpackRequire('3018') as {
    randomBytes: (n: number) => Buffer;
  };
  loadSource(chunks.player, 'chunk-player.js', patchPlayerChunk);
  webpackRequire('9987');

  const hooks = sandbox as unknown as VmHooks;
  for (const name of [
    '__vidcoreEncode',
    '__vidcoreResolve',
    '__vidcoreDecrypt',
    '__vidcoreDecodeUnsalted',
    '__vidcoreDecodeSalted',
  ] as const) {
    if (typeof hooks[name] !== 'function') throw new Error(`vm hook missing: ${name}`);
  }

  const catalogBase = mintCatalogBase(chunks.player, hooks.__vidcoreDecodeUnsalted);
  const streamAction = mintStreamAction(chunks.player, hooks.__vidcoreDecodeSalted);
  const vmBuffer = cryptoModule.randomBytes(1).constructor;

  function buildCtx(
    en: string,
    fetchFn: ScraperFetch,
    hooksIn: {
      setServers: (list: CatalogServer[]) => void;
      setState: (value: unknown) => void;
    },
    extra: Record<string, unknown> = {},
  ) {
    return {
      crypto: cryptoModule,
      encode: hooks.__vidcoreEncode,
      en,
      server: null,
      setServers: hooksIn.setServers,
      setState: hooksIn.setState,
      setFavServer: () => {},
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
      fetch: fetchFn,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      AbortSignal,
      AbortController,
      Buffer: vmBuffer,
      atob: sandbox.atob,
      btoa: sandbox.btoa,
      ...extra,
    };
  }

  async function decryptBody(body: string, baseCtx: Record<string, unknown>) {
    const dr: unknown[] = [];
    await hooks.__vidcoreDecrypt({ ...baseCtx, dr, rs: body });
    if (dr[0] == null) throw new Error('catalog decrypt failed');
    return dr[0];
  }

  async function listServers(en: string, scraperFetch: ScraperFetch, referer: string) {
    sandbox.location.href = referer;
    const servers: CatalogServer[][] = [];
    const state = { value: null as unknown };
    let listBody: string | null = null;

    const capturingFetch: ScraperFetch = async (input, init = {}) => {
      const response = await scraperFetch(input, init);
      const url = String(input);
      if ((init.method || 'POST').toUpperCase() === 'POST' && response.ok && !listBody) {
        if (url.includes(catalogBase) || /\/neod\//.test(url) || /\/(?:u)?mo\//.test(url)) {
          listBody = await response.clone().text();
        }
      }
      return response;
    };

    const ctx = buildCtx(
      en,
      capturingFetch,
      {
        setServers: (list) => servers.push(structuredClone(list)),
        setState: (value) => {
          state.value = value;
        },
      },
    );

    sandbox.fetch = capturingFetch as unknown as typeof fetch;
    for (const key of ['crypto', 'encode', 'en', 'server', 'setServers', 'setState', 'setFavServer', 'fetch'] as const) {
      (sandbox as unknown as Record<string, unknown>)[key] = ctx[key];
    }

    if (typeof hooks.__vidcoreInit === 'function') hooks.__vidcoreInit();
    await hooks.__vidcoreResolve(ctx);

    const deadline = Date.now() + 45000;
    while (!servers.length && state.value == null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (state.value === 500) throw new Error('resolver API error');

    let active = servers.at(-1) || null;
    if (listBody) {
      const decrypted = await decryptBody(listBody, ctx);
      if (Array.isArray(decrypted) && decrypted.length) active = decrypted as CatalogServer[];
    }
    if (!active?.length) throw new Error('server list empty');
    return active;
  }

  async function unlockServer(server: CatalogServer, scraperFetch: ScraperFetch, en = '') {
    if (!server?.data) throw new Error('server missing data token');
    const response = await scraperFetch(`${catalogBase}/${streamAction}/${server.data}`, {
      method: 'POST',
      headers: { 'x-requested-with': 'XMLHttpRequest' },
      body: '',
    });
    if (!response.ok) throw new Error(`stream unlock failed: ${response.status}`);
    const body = await response.text();
    if (!body) throw new Error('stream unlock empty body');
    const config = (await decryptBody(body, buildCtx(en, scraperFetch, { setServers: () => {}, setState: () => {} }, { server }))) as {
      url?: string;
    };
    if (!config.url) throw new Error('decrypt missing stream url');
    return config as { url: string };
  }

  return {
    listServers,
    unlockServer,
    catalogBase,
    streamAction,
  };
}

let sessionPromise: Promise<VmSession> | null = null;

export function getVmSession() {
  if (!sessionPromise) {
    sessionPromise = loadPlayerChunks()
      .then((chunks) => createRuntime(chunks))
      .catch((err) => {
        sessionPromise = null;
        throw err;
      });
  }
  return sessionPromise;
}
