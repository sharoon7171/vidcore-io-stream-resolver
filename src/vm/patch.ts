function createNativeFunction(name: string, impl: (...args: unknown[]) => unknown, length = 0) {
  const fn = function (this: unknown, ...args: unknown[]) {
    return impl.apply(this, args);
  };
  Object.defineProperty(fn, 'name', { value: name, configurable: true });
  Object.defineProperty(fn, 'length', { value: length, configurable: true });
  fn.toString = () => `function ${name}() { [native code] }`;
  return fn;
}

export function createNativeConsole(base: Console = console) {
  const nativeLog = createNativeFunction('log', () => {}, 1);
  const table = createNativeFunction('table', () => {}, 1);
  const clear = createNativeFunction('clear', () => {}, 0);
  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'log') return nativeLog;
      if (prop === 'table') return table;
      if (prop === 'clear') return clear;
      return Reflect.get(target, prop);
    },
  });
}

function patchVmLookups(source: string) {
  let out = source;
  const needle = 'function u(t){if(t in ';
  let from = 0;
  while (true) {
    const at = out.indexOf(needle, from);
    if (at < 0) break;
    const slice = out.slice(at, at + 120);
    const match = slice.match(
      /^function u\(t\)\{if\(t in (\w+)\)return \1\[t\];if\(t in (\w+)\)return \2\[t\];throw Error\(t\)\}/,
    );
    if (!match) {
      from = at + needle.length;
      continue;
    }
    const next = `function u(t){if(t in ${match[1]})return ${match[1]}[t];if(t in ${match[2]})return ${match[2]}[t];if(typeof globalThis!=="undefined"&&t in globalThis)return globalThis[t];throw Error("missing:"+t)}`;
    out = out.slice(0, at) + next + out.slice(at + match[0].length);
    from = at + next.length;
  }
  return out;
}

export function patchPlayerChunk(source: string) {
  const alphabetAt = source.indexOf('.from("xZ/aW~D6:U0_]EVA")');
  if (alphabetAt < 0) throw new Error('player chunk: encode alphabet not found');
  const joinAt = source.lastIndexOf('.join("")}', alphabetAt);
  if (joinAt < 0) throw new Error('player chunk: encode join not found');
  const fnName = source.slice(source.lastIndexOf('function ', joinAt)).match(/^function (\w+)\(/)?.[1];
  if (!fnName) throw new Error('player chunk: encode fn not found');
  const fromIdent = source.slice(joinAt + '.join("")}'.length, alphabetAt);

  let out = patchVmLookups(source)
    .replace(/=W\(7358\)/g, '=void 0')
    .replace(/W\(7358\);/g, 'void 0;')
    .replace('if(!sG())return', 'if(!1)return')
    .replace('if(!sj())return!1', 'if(!1)return!1')
    .replace(
      /let (\w+)=(\w+),(\w+)=\2,(\w+)=\2,(\w+)=\2,(\w+)=\2,(\w+)=(\w+),(\w+)=\8,(\w+)=\8,(\w+)=\8,(\w+)=\8;/,
      'globalThis.__vidcoreDecodeUnsalted=$2,globalThis.__vidcoreDecodeSalted=$8;let $1=$2,$3=$2,$4=$2,$5=$2,$6=$2,$7=$8,$9=$8,$10=$8,$11=$8,$12=$8;',
    )
    .replace(
      `.join("")}${fromIdent}.from("xZ/aW~D6:U0_]EVA");`,
      `.join("")}globalThis.__vidcoreEncode=${fnName};${fromIdent}.from("xZ/aW~D6:U0_]EVA");`,
    )
    .replace(
      /i\$\[iE\(1751\)\]=sf,globalThis\._0x2d2f4e=i\$\._0x2d2f4e/,
      'i$[iE(1751)]=sf,globalThis.__vidcoreResolve=sf,globalThis._0x2d2f4e=i$._0x2d2f4e',
    )
    .replace(
      /i\$\[iF\(2048,"P%rx"\)\]=sM,globalThis\._0x48ce89=i\$\._0x48ce89/,
      'i$[iF(2048,"P%rx")]=sM,globalThis.__vidcoreDecrypt=sM,globalThis._0x48ce89=i$._0x48ce89',
    )
    .replace(
      /i\$\[iY\(2153,"i\[2R"\)\]=sl,globalThis\._0x12acfa=i\$\._0x12acfa/,
      'i$[iY(2153,"i[2R")]=sl,globalThis.__vidcoreInit=sl,globalThis._0x12acfa=i$._0x12acfa',
    );

  for (const hook of [
    '__vidcoreEncode',
    '__vidcoreResolve',
    '__vidcoreDecrypt',
    '__vidcoreDecodeUnsalted',
    '__vidcoreDecodeSalted',
  ]) {
    if (!out.includes(`globalThis.${hook}`)) throw new Error(`player chunk: missing ${hook}`);
  }
  return out;
}
