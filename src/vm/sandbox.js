import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import { Window } from 'happy-dom';
import { createVidcoreFetch } from '../vidcore/page.js';
import { ua, vidcoreOrigin } from '../env.js';
import { createNativeConsole } from './patch.js';

export function createSandbox(referer = `${vidcoreOrigin}/`) {
  const window = new Window({ url: referer, width: 1920, height: 1080 });

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

  const nav = window.navigator;
  Object.defineProperties(nav, {
    userAgent: { value: ua, configurable: true },
    platform: { value: 'MacIntel', configurable: true },
    vendor: { value: 'Google Inc.', configurable: true },
    webdriver: { value: false, configurable: true },
    maxTouchPoints: { value: 0, configurable: true },
    language: { value: 'en-US', configurable: true },
    languages: { value: ['en-US', 'en'], configurable: true },
    hardwareConcurrency: { value: 8, configurable: true },
    deviceMemory: { value: 8, configurable: true },
    plugins: { value: { length: 5 }, configurable: true },
    storage: {
      value: { estimate: async () => ({ quota: 2147483648, usage: 0 }) },
      configurable: true,
    },
  });

  window.console = createNativeConsole(console);
  window.self = window;
  window.globalThis = window;
  vm.createContext(window);
  return window;
}

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

export function createModuleStubs(window) {
  return {
    5155: reactStub,
    8288: {
      useRouter: () => ({ push: () => {} }),
      usePathname: () => new URL(window.location.href).pathname,
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
}
