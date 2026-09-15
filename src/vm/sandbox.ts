import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import { Window } from 'happy-dom';
import { siteOrigin, userAgent } from '../config.js';
import { createNativeConsole } from './patch.js';

export function createSandbox(referer = `${siteOrigin}/`) {
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
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
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
      port1 = { postMessage() {}, start() {}, addEventListener() {} };
      port2 = { postMessage() {}, start() {}, addEventListener() {} };
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
    requestIdleCallback: (fn: () => void) => setTimeout(fn, 1),
    cancelIdleCallback: clearTimeout,
    fetch: globalThis.fetch.bind(globalThis),
  });

  Object.defineProperties(window.navigator, {
    userAgent: { value: userAgent, configurable: true },
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
