export function patchPlayerChunk(source) {
  return source
    .replace(/=o\(7358\)/g, '=void 0')
    .replace(/o\(7358\);/g, 'void 0;')
    .replace('at[c8(2386)]=cU', 'globalThis.__vidcoreCU=cU,globalThis.__vidcoreC4=c4,globalThis.__vidcoreC3=c3,globalThis.__vidcoreC2=c2,at[c8(2386)]=cU')
    .replace(
      'async function aw(t,e,o){return ae(6,arguments,{[c6(672)]:[aL],[c6(2647)]:void 0},void 0,new.target,this)}',
      'async function __vidcoreAwImpl(t,e,o){try{(globalThis.__awCalls=globalThis.__awCalls||[]).push(Array.from(arguments))}catch(_){};return ae(6,arguments,{[c6(672)]:[aL],[c6(2647)]:void 0},void 0,new.target,this)}globalThis.__vidcoreAw=__vidcoreAwImpl;async function aw(t,e,o){return __vidcoreAwImpl(t,e,o)}',
    )
    .replace('if(!a2())return', 'if(!1)return')
    .replace('let a2=()=>{', 'let a2=()=>!0;let __a2=()=>{')
    .replace('let a1=()=>{', 'let a1=()=>!0;let __a1=()=>{')
    .replace('function aM(t,e){return ae(7,', 'function aM(t,e){globalThis.__vidcoreLastCtx=t;return ae(7,')
    .replace(
      'if(!W[c$(o._0x59a42e,"0oNq")](n,c0(o._0x4e9faf,"(o*h"))||W[c4(1333)](n,c1(o._0x24e13c,o._0x48a1f9)))return null;',
      '',
    )
    .replace(
      'function a$(){return ae(8,arguments,void 0,void 0,new.target,this)}',
      'function __vidcoreAe8Impl(){return ae(8,arguments,void 0,void 0,new.target,this)}globalThis.__vidcoreAe8=__vidcoreAe8Impl;function a$(){return __vidcoreAe8Impl()||!0}',
    )
    .replace(
      'async function aA(t,e){return t&&Object[c6(2537)](aI,t),aT=e||{},aj(0,aq[c3(1942,"xi$a")],{})}',
      'async function __vidcoreAAImpl(t,e){return t&&Object[c6(2537)](aI,t),aT=e||{},aj(0,aq[c3(1942,"xi$a")],{})}globalThis.__vidcoreAA=__vidcoreAAImpl;async function aA(t,e){return __vidcoreAAImpl(t,e)}',
    )
    .replace(
      'function u(t){if(t in o)return o[t];if(t in t9)return t9[t];throw Error(t)}',
      'function u(t){if(t in o)return o[t];if(t in t9)return t9[t];if(typeof globalThis!=="undefined"&&t in globalThis)return globalThis[t];throw Error("missing:"+t)}',
    )
    .replace(
      'function u(t){if(t in o)return o[t];if(t in ag)return ag[t];throw Error(t)}',
      'function u(t){if(t in o)return o[t];if(t in ag)return ag[t];if(typeof globalThis!=="undefined"&&t in globalThis)return globalThis[t];throw Error("missing:"+t)}',
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
