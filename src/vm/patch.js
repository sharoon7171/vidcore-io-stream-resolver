export function patchPlayerChunk(source) {
  return source
    .replace(/=o\(7358\)/g, '=void 0')
    .replace(/o\(7358\);/g, 'void 0;')
    .replaceAll('if(!m_())return!1', 'if(!1)return!1')
    .replaceAll('if(!m_())return', 'if(!1)return')
    .replaceAll('if(!m$())return', 'if(!1)return')
    .replace(
      /function u\(t\)\{if\(t in (\w+)\)return \1\[t\];if\(t in (\w+)\)return \2\[t\];throw Error\(t\)\}/g,
      'function u(t){if(t in $1)return $1[t];if(t in $2)return $2[t];if(typeof globalThis!=="undefined"&&t in globalThis)return globalThis[t];throw Error("missing:"+t)}',
    )
    .replace(
      'let iY=mm,iU=mm,i_=mm,i$=mm,i1=mm,i2=i9,i0=i9,i4=i9,i5=i9,i3=i9;',
      'globalThis.__vidcoreDecodeSalted=mm,globalThis.__vidcoreDecodeUnsalted=i9;let iY=mm,iU=mm,i_=mm,i$=mm,i1=mm,i2=i9,i0=i9,i4=i9,i5=i9,i3=i9;',
    )
    .replace(
      'i7[i_(1831,"QVXB")]=mL,globalThis._0x442368',
      'i7[i_(1831,"QVXB")]=mL,globalThis.__vidcoreResolve=mL,globalThis._0x442368',
    )
    .replace(
      'i7[i0(2158)]=mU,globalThis._0x482d3f',
      'i7[i0(2158)]=mU,globalThis.__vidcoreInit=mU,globalThis._0x482d3f',
    )
    .replace(
      'i7[i$(2025,"9CEb")]=mj,globalThis._0x296bbf',
      'i7[i$(2025,"9CEb")]=mj,globalThis.__vidcoreDecrypt=mj,globalThis._0x296bbf',
    )
    .replace(
      '.join("")}iB.from("xZ/aW~D6:U0_]EVA");',
      '.join("")}globalThis.__vidcoreEncode=iX;iB.from("xZ/aW~D6:U0_]EVA");',
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
