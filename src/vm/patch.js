export function patchPlayerChunk(source) {
  return source
    .replace(/=o\(7358\)/g, '=void 0')
    .replace(/o\(7358\);/g, 'void 0;')
    .replace('if(!cF())return', 'if(!1)return')
    .replace('if(!cU())return!1', 'if(!1)return!1')
    .replace(
      /function u\(t\)\{if\(t in (\w+)\)return \1\[t\];if\(t in (\w+)\)return \2\[t\];throw Error\(t\)\}/g,
      'function u(t){if(t in $1)return $1[t];if(t in $2)return $2[t];if(typeof globalThis!=="undefined"&&t in globalThis)return globalThis[t];throw Error("missing:"+t)}',
    )
    .replace(
      'a(w in r?r[w]:w in ch?ch[w]:void 0)',
      'a(w in r?r[w]:w in ch?ch[w]:typeof globalThis!=="undefined"&&w in globalThis?globalThis[w]:void 0)',
    )
    .replace(
      'let sV=s6,sY=s6,sU=s6,sF=s6,s_=s6,s$=s7,s1=s7,s2=s7,s0=s7,s3=s7;',
      'globalThis.__vidcoreDecodeUnsalted=s7,globalThis.__vidcoreDecodeSalted=s6;let sV=s6,sY=s6,sU=s6,sF=s6,s_=s6,s$=s7,s1=s7,s2=s7,s0=s7,s3=s7;',
    )
    .replace(
      's4[sF(3314,"Y7Wc")]=cg,globalThis._0x2326ae=s4._0x2326ae',
      's4[sF(3314,"Y7Wc")]=cg,globalThis.__vidcoreResolve=cg,globalThis._0x2326ae=s4._0x2326ae',
    )
    .replace(
      's4[s$(1794)]=cY,globalThis._0x429373=s4._0x429373',
      's4[s$(1794)]=cY,globalThis.__vidcoreInit=cY,globalThis._0x429373=s4._0x429373',
    )
    .replace(
      's4[sU(2747,"QLzy")]=cB,globalThis._0x1b477e=s4._0x1b477e',
      's4[sU(2747,"QLzy")]=cB,globalThis.__vidcoreDecrypt=cB,globalThis._0x1b477e=s4._0x1b477e',
    )
    .replace(
      '.join("")}sj.from("xZ/aW~D6:U0_]EVA");',
      '.join("")}globalThis.__vidcoreEncode=sX;sj.from("xZ/aW~D6:U0_]EVA");',
    )
    .replace(
      /let t=_recoverThisFromEnv\(([a-zA-Z0-9]+)\)/g,
      'let t=_recoverThisFromEnv($1)??globalThis',
    );
}

function createNativeFunction(name, impl, length = 0, { anonymous = false } = {}) {
  const fn = function () {
    return impl.apply(this, arguments);
  };
  Object.defineProperty(fn, 'name', { value: anonymous ? '' : name, configurable: true });
  Object.defineProperty(fn, 'length', { value: length, configurable: true });
  fn.toString = () =>
    anonymous ? 'function () { [native code] }' : `function ${name}() { [native code] }`;
  return fn;
}

export function createNativeConsole(base = console) {
  const nativeLog = createNativeFunction('log', () => {}, 1);
  const table = createNativeFunction('table', () => {}, 1);
  const clear = createNativeFunction('clear', () => {}, 0);

  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'log') return nativeLog;
      if (prop === 'table') return table;
      if (prop === 'clear') return clear;
      return target[prop];
    },
  });
}
