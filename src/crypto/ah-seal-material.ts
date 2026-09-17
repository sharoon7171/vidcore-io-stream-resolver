export type SealRound = {
  key: Buffer;
  salt: Buffer;
  rc4Key: Buffer;
  map: ((x: number) => number)[];
};

export type SealMaterial = {
  aesKey: Buffer;
  aesIv: Buffer;
  c7: Buffer;
  iz: string[];
  rounds: SealRound[];
  fpMul: number;
  golden: number;
  listAction: string;
};

const IZ_LEN = 64;
const KEY_B64 = /[A-Za-z0-9+/]{43}=/g;
const SALT_B64 = /[A-Za-z0-9+/]{6,16}={1,2}|[A-Za-z0-9+/]{8}(?![A-Za-z0-9+/=])/g;
const LAWSUIT = /lawsuit_[a-f0-9]+_(0x[0-9a-f]+)/g;

export type XorTableConsts = { add: number; mul16: number; mul13: number };

export function extractXorTableConsts(chunk: string): XorTableConsts {
  const m = chunk.match(
    /Uint8Array\(256\)[\s\S]{0,160}?o\+(0x[0-9a-f]{8})>>>0[\s\S]{0,100}?(0x[0-9a-f]{8})[\s\S]{0,100}?(0x[0-9a-f]{8})/,
  );
  if (!m) throw new Error('missing xor table constants');
  return { add: Number(m[1]), mul16: Number(m[2]), mul13: Number(m[3]) };
}

function makeAS(seed: number, c: XorTableConsts) {
  const e = new Uint8Array(256);
  let o = seed >>> 0;
  for (let i = 0; i < 256; i++) {
    let n = (o = (o + c.add) >>> 0);
    n = Math.imul(n ^ (n >>> 16), c.mul16) >>> 0;
    n = ((n = Math.imul(n ^ (n >>> 13), c.mul13) >>> 0) ^ (n >>> 16)) >>> 0;
    e[i] = 255 & n;
  }
  return e;
}

export function decodeAhStream(ah: Buffer, seed: number, xor: XorTableConsts) {
  const aS = makeAS(seed, xor);
  const plain = Buffer.allocUnsafe(ah.length);
  for (let i = 0; i < ah.length; i++) plain[i] = ah[i] ^ aS[i % 256];
  return plain;
}

function parseCQ(chunk: string) {
  const m = chunk.match(/cQ=JSON\.parse\('(\[[^\]]+\])'\)/);
  if (!m) throw new Error('missing cQ alphabet');
  const iz = JSON.parse(m[1]) as string[];
  if (iz.length !== IZ_LEN) throw new Error('iz alphabet length');
  return iz;
}

function scanRngConstants(plain: Buffer) {
  const vals: number[] = [];
  for (let i = 0; i + 10 <= plain.length; i++) {
    if (plain[i] !== 0xcc || plain[i + 1] !== 0x4b) continue;
    const v = plain.readDoubleBE(i + 2);
    if (Number.isInteger(v) && v > 1e9 && v < 0x100000000) vals.push(v);
  }
  if (vals.length < 2) throw new Error('ah missing rng constants');
  return { fpMul: vals[0], golden: vals[1] };
}

function keys32In(text: string, from = 0, to = text.length) {
  const slice = text.slice(from, to);
  const out: { key: string; at: number }[] = [];
  for (const m of slice.matchAll(KEY_B64)) {
    const raw = Buffer.from(m[0], 'base64');
    if (raw.length === 32) out.push({ key: m[0], at: from + m.index! });
  }
  return out;
}

function saltAfterKey(text: string, keyAt: number, key: string) {
  const win = text.slice(keyAt + key.length, keyAt + key.length + 80);
  for (const m of win.matchAll(SALT_B64)) {
    if (/^[0-9a-f]+$/i.test(m[0])) continue;
    const b = Buffer.from(m[0], 'base64');
    if (b.length >= 4 && b.length <= 12) return b;
  }
  return null;
}

function doublesIn(plain: Buffer, from: number, to: number) {
  const nums: number[] = [];
  for (let i = from; i + 10 <= to; i++) {
    if (plain[i] === 0xcc && plain[i + 1] === 0x4b) {
      const v = plain.readDoubleBE(i + 2);
      if (Number.isInteger(v) && v >= 0 && v <= 256) nums.push(v);
    }
  }
  return nums;
}

function rotatePolarity(plain: Buffer, from: number, to: number) {
  const slice = plain.subarray(from, to);
  const i10 = slice.indexOf(Buffer.from([0x2f, 0x10]));
  const i11 = slice.indexOf(Buffer.from([0x2f, 0x11]));
  return i10 >= 0 && (i11 < 0 || i10 < i11) ? 'shl' : 'shr';
}

function handlerFromBody(plain: Buffer, from: number, to: number): ((x: number) => number) | null {
  const nums = doublesIn(plain, from, to);
  if (!nums.length) return null;
  const n0 = nums[0];
  if (n0 === 59) return (x) => x ^ 59;
  if (n0 === 76) return (x) => (((x - 76) % 256) + 256) % 256;
  if (n0 === 200) return (x) => (((x - 200) % 256) + 256) % 256;
  if (n0 === 216) return (x) => (((x - 216) % 256) + 256) % 256;
  if (n0 === 218) return (x) => (((x - 218) % 256) + 256) % 256;
  if (n0 === 226) return (x) => (((x - 226) % 256) + 256) % 256;
  if (n0 === 230) return (x) => (x + 230) % 256;
  if (n0 === 1 && nums[1] === 7) return (x) => ((x << 1) | (x >> 7)) & 255;
  if (n0 === 2 && nums[1] === 6) {
    return rotatePolarity(plain, from, to) === 'shl'
      ? (x) => ((x << 2) | (x >> 6)) & 255
      : (x) => ((x >> 2) | (x << 6)) & 255;
  }
  if (n0 === 7 && nums[1] === 1) {
    return rotatePolarity(plain, from, to) === 'shl'
      ? (x) => ((x << 7) | (x >> 1)) & 255
      : (x) => ((x >> 7) | (x << 1)) & 255;
  }
  return null;
}

function idDefAt(text: string) {
  const map = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const m of text.matchAll(LAWSUIT)) {
    if (!map.has(m[1])) map.set(m[1], m.index!);
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return { defs: map, counts };
}

function handlerFn(plain: Buffer, id: string, defs: Map<string, number>) {
  const setAt = defs.get(id);
  if (setAt === undefined) return null;
  return handlerFromBody(plain, Math.max(0, setAt - 130), setAt);
}

function recoverMap(
  text: string,
  plain: Buffer,
  bodyFrom: number,
  bodyTo: number,
  defs: Map<string, number>,
) {
  const cases: { v: number; t: number; at: number }[] = [];
  for (let i = bodyFrom; i + 12 < bodyTo; i++) {
    if (plain[i] !== 0xcc || plain[i + 1] !== 0x4b) continue;
    const v = plain.readDoubleBE(i + 2);
    if (!Number.isInteger(v) || v < 0 || v > 9) continue;
    const slice = plain.subarray(i, i + 20);
    const jt = slice.indexOf(Buffer.from([0x2f, 0x06, 0x6c]));
    if (jt < 0) continue;
    cases.push({ v, t: slice.readUInt16BE(jt + 3), at: i });
    i += 10;
  }
  if (cases.length < 10) throw new Error('ah mix map cases missing');

  const after = text.slice(cases[cases.length - 1].at, bodyTo);
  const handlers: ((x: number) => number)[] = [];
  const seen = new Set<string>();
  for (const m of after.matchAll(LAWSUIT)) {
    if (seen.has(m[1])) continue;
    const fn = handlerFn(plain, m[1], defs);
    if (!fn) continue;
    seen.add(m[1]);
    handlers.push(fn);
  }

  const targetIdx = new Map<number, number>();
  for (const c of cases) {
    if (!targetIdx.has(c.t)) targetIdx.set(c.t, targetIdx.size);
  }
  if (targetIdx.size !== handlers.length) throw new Error('ah mix map handler count');

  const map: ((x: number) => number)[] = Array(10);
  for (const c of cases) {
    const fn = handlers[targetIdx.get(c.t)!];
    if (!fn) throw new Error('ah mix map slot empty');
    map[c.v] = fn;
  }
  if (map.some((f) => !f)) throw new Error('ah mix map incomplete');
  return map;
}

function mixHelpers(text: string, defs: Map<string, number>, counts: Map<string, number>) {
  const out: { id: string; key: string; salt: Buffer; bodyFrom: number; bodyTo: number }[] = [];
  const seen = new Set<string>();
  for (const hit of keys32In(text)) {
    const salt = saltAfterKey(text, hit.at, hit.key);
    if (!salt) continue;
    const afterStart = hit.at + hit.key.length;
    const after = text.slice(afterStart, afterStart + 1500);
    const defsHere: { id: string; at: number }[] = [];
    for (const m of after.matchAll(LAWSUIT)) {
      const at = afterStart + m.index!;
      if (defs.get(m[1]) === at) defsHere.push({ id: m[1], at });
    }
    const pick = [...defsHere].reverse().find((d) => counts.get(d.id) === 2);
    if (!pick || seen.has(pick.id)) continue;
    seen.add(pick.id);
    out.push({
      id: pick.id,
      key: hit.key,
      salt,
      bodyFrom: Math.max(0, hit.at - 80),
      bodyTo: pick.at,
    });
  }
  return out;
}

function callOrderedMix(
  text: string,
  helpers: { id: string; key: string; salt: Buffer; bodyFrom: number; bodyTo: number }[],
  rc4Keys: string[],
) {
  const byId = new Map(helpers.map((h) => [h.id, h]));
  const ordered = [];
  for (const rk of rc4Keys) {
    const at = text.indexOf(rk);
    if (at < 0) throw new Error('rc4 key missing');
    const win = text.slice(Math.max(0, at - 80), at);
    const id = [...win.matchAll(LAWSUIT)].map((m) => m[1]).reverse().find((i) => byId.has(i));
    if (!id) throw new Error('mix helper missing before rc4 key');
    ordered.push(byId.get(id)!);
  }
  return ordered;
}

function listActionFromPlain(text: string) {
  const se = text.indexOf('/se/');
  if (se < 0) throw new Error('ah missing /se/');
  const hit = [...text.slice(se, se + 120).matchAll(/([A-Za-z0-9_-]{10,14})/g)]
    .map((m) => m[1])
    .find((s) => !s.startsWith('lawsuit') && !/^[0-9a-f]+$/i.test(s));
  if (!hit) throw new Error('ah missing list action');
  return hit;
}

export function scanAhSealMaterial(
  ah: Buffer,
  ahSeed: number,
  chunk: string,
  xor: XorTableConsts,
): SealMaterial {
  const plain = decodeAhStream(ah, ahSeed, xor);
  const text = plain.toString('latin1');
  const iz = parseCQ(chunk);
  const { fpMul, golden } = scanRngConstants(plain);
  const { defs, counts } = idDefAt(text);

  const aesKeyHex = text.match(/[0-9a-f]{64}/)?.[0];
  if (!aesKeyHex) throw new Error('ah missing aes key');
  const aesAt = text.indexOf(aesKeyHex);
  const afterAes = text.slice(aesAt + 64);
  const aesIvHex = afterAes.match(/[0-9a-f]{32}/)?.[0];
  if (!aesIvHex) throw new Error('ah missing aes iv');
  const afterIv = afterAes.slice(afterAes.indexOf(aesIvHex) + 32);
  const c7Hex = afterIv.match(/[0-9a-f]{17,21}/)?.[0];
  if (!c7Hex) throw new Error('ah missing c7');

  const helpers = mixHelpers(text, defs, counts);
  if (helpers.length < 5) throw new Error('ah missing mix helpers');

  const mixKeySet = new Set(helpers.map((h) => h.key));
  const rc4Keys = keys32In(text, aesAt)
    .map((h) => h.key)
    .filter((k) => !mixKeySet.has(k))
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, 5);
  if (rc4Keys.length < 5) throw new Error('ah missing rc4 keys');

  const ordered = callOrderedMix(text, helpers, rc4Keys);
  const rounds: SealRound[] = ordered.map((h, i) => ({
    key: Buffer.from(h.key, 'base64'),
    salt: h.salt,
    rc4Key: Buffer.from(rc4Keys[i], 'base64'),
    map: recoverMap(text, plain, h.bodyFrom, h.bodyTo, defs),
  }));

  return {
    aesKey: Buffer.from(aesKeyHex, 'hex'),
    aesIv: Buffer.from(aesIvHex, 'hex'),
    c7: Buffer.from(c7Hex, 'hex'),
    iz,
    rounds,
    fpMul,
    golden,
    listAction: listActionFromPlain(text),
  };
}

export function extractHexSeed(chunk: string, which: 'ah' | 'aZ') {
  const m =
    which === 'ah'
      ? chunk.match(/]=(0x[0-9a-f]{8}),globalThis\.[^;]+;var ar=/)
      : chunk.match(/]=(0x[0-9a-f]{8}),globalThis\.[^;]+;var ax=/);
  if (!m) throw new Error('missing ' + which + ' xor seed');
  return Number(m[1]);
}
