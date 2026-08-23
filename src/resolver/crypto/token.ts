import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const AES_KEY = Buffer.from(
  'bc3b061beff76cf02a4e6e5b4de747407c9ea177faf1d0d953a0de9382e59089',
  'hex',
);
const AES_IV = Buffer.from('29e99500c65d49bfd6d1e9786e742e7d', 'hex');
const PREFIX = Buffer.from('151ac1b316ec9db4', 'hex');

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
const ALPHA_TO =
  'sLeXqwO8WHuTGiQ9JpmV3_1jBhxZAr6n240YgDSU7NovytRabC5F-kEMdzcKlfPI';
const ENC = new Map([...ALPHA].map((c, i) => [c, ALPHA_TO[i]]));

function encodeCustom(buf: Buffer | Uint8Array) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .split('')
    .map((c) => ENC.get(c) || c)
    .join('');
}

function rotl(x: number, n: number) {
  n &= 7;
  return n ? ((x << n) | (x >>> (8 - n))) & 255 : x & 255;
}

function rotr(x: number, n: number) {
  n &= 7;
  return n ? ((x >>> n) | (x << (8 - n))) & 255 : x & 255;
}

function xorshift(seedMaterial: Buffer | Uint8Array) {
  const d = crypto.createHash('sha256').update(seedMaterial).digest();
  let state =
    (d.readUInt32LE(0) ^ d.readUInt32LE(4) ^ d.readUInt32LE(8) ^ d.readUInt32LE(12)) >>> 0;
  if (state === 0) state = 2654435769;
  return () => {
    state ^= (state << 13) >>> 0;
    state >>>= 0;
    state ^= state >>> 17;
    state >>>= 0;
    state ^= (state << 5) >>> 0;
    state >>>= 0;
    return state;
  };
}

function fyOrder(n: number, next: () => number) {
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order;
}

function perm256(material: Buffer | Uint8Array) {
  const next = xorshift(material);
  const arr = new Uint8Array(256);
  for (let i = 0; i < 256; i++) arr[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = next() % (i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function shuffleBlocks(buf: Buffer, seedMat: Buffer | Uint8Array) {
  const block = 16;
  const n = Math.ceil(buf.length / block);
  const order = fyOrder(n, xorshift(seedMat));
  const padded = Buffer.alloc(n * block, 0);
  buf.copy(padded);
  const out = Buffer.alloc(n * block);
  for (let i = 0; i < n; i++) {
    padded.copy(out, i * block, order[i] * block, order[i] * block + block);
  }
  return { out: out.subarray(0, buf.length), order };
}

function applyOrder(buf: Buffer, order: Uint32Array | number[]) {
  const src = Buffer.from(buf);
  for (let i = 0; i < order.length; i++) buf[i] = src[order[i]];
}

function writeU64LE(n: number) {
  const b = Buffer.allocUnsafe(8);
  let x = BigInt(n);
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

function rc4(key: Buffer | Uint8Array | string, data: Buffer | Uint8Array) {
  const S = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  const kb = Buffer.from(key);
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + kb[i % kb.length]) & 255;
    const t = S[i];
    S[i] = S[j];
    S[j] = t;
  }
  let i = 0;
  j = 0;
  const src = Buffer.from(data);
  const out = Buffer.alloc(src.length);
  for (let n = 0; n < src.length; n++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    const t = S[i];
    S[i] = S[j];
    S[j] = t;
    out[n] = src[n] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

function saltedXor(data: Buffer | Uint8Array, keyB64: string, saltB64: string, xf: (i: number, x: number) => number) {
  const key = Buffer.from(keyB64, 'base64');
  const salt = Buffer.from(saltB64, 'base64');
  const src = Buffer.from(data);
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (i < salt.length) out.push(salt[i]);
    out.push(xf(i, src[i] ^ key[i % key.length]));
  }
  return Buffer.from(out);
}

const OPS: Record<string, (x: number) => number> = {
  xor59: (x) => x ^ 59,
  sub76: (x) => (x - 76) & 255,
  sub200: (x) => (x - 200) & 255,
  sub216: (x) => (x - 216) & 255,
  sub218: (x) => (x - 218) & 255,
  sub226: (x) => (x - 226) & 255,
  add230: (x) => (x + 230) & 255,
  rotl1: (x) => rotl(x, 1),
  rotl2: (x) => rotl(x, 2),
  rotr2: (x) => rotr(x, 2),
  rotl7: (x) => rotl(x, 7),
  rotr7: (x) => rotr(x, 7),
};

function dispatch(table: Record<number, (x: number) => number>) {
  return (i: number, x: number) => (table[i % 10] || ((v: number) => v))(x);
}

const XF_EA = dispatch({
  0: OPS.sub226,
  9: OPS.sub226,
  1: OPS.sub76,
  5: OPS.sub76,
  2: OPS.rotl2,
  3: OPS.sub200,
  7: OPS.sub200,
  4: OPS.xor59,
  6: OPS.xor59,
  8: OPS.xor59,
});
const XF_B81 = dispatch({
  0: OPS.sub218,
  7: OPS.sub218,
  1: OPS.rotl2,
  4: OPS.rotl2,
  2: OPS.xor59,
  6: OPS.xor59,
  3: OPS.rotl1,
  8: OPS.rotl1,
  5: OPS.rotr2,
  9: OPS.add230,
});
const XF_C272 = dispatch({
  0: OPS.rotl2,
  1: OPS.sub200,
  3: OPS.sub200,
  2: OPS.rotr2,
  7: OPS.rotr2,
  4: OPS.rotl1,
  5: OPS.rotr7,
  8: OPS.rotr7,
  6: OPS.sub226,
  9: OPS.rotl7,
});
const XF_C936 = dispatch({
  0: OPS.sub200,
  6: OPS.sub200,
  1: OPS.rotl2,
  8: OPS.rotl2,
  2: OPS.sub226,
  3: OPS.add230,
  5: OPS.add230,
  4: OPS.sub76,
  7: OPS.sub218,
  9: OPS.rotl1,
});
const XF_BAD = dispatch({
  0: OPS.sub216,
  4: OPS.sub216,
  1: OPS.rotr7,
  2: OPS.rotl7,
  7: OPS.rotl7,
  3: OPS.xor59,
  5: OPS.xor59,
  6: OPS.sub226,
  8: OPS.rotl1,
  9: OPS.rotl2,
});

type PipeXor = { key: string; salt: string; xf: (i: number, x: number) => number };
type PipeMix = { mix: string };
type PipeStep = PipeXor | PipeMix;

const PIPE: PipeStep[] = [
  { key: '4A0cZbwoo3dBMR+hBpflxHq7IulaAG+VHEP+/KuuGso=', salt: 'I2tW0Lrce40=', xf: XF_EA },
  { mix: 'oqDHQwu30IFWxZuj737jFpp8xLPCEB8mjIt+syKfJRw=' },
  { key: 'spUa4i09naB+5oT/drp4yipRNCoPCf/sHySmWjFkv6I=', salt: '4Lclzk8BGw0=', xf: XF_BAD },
  { mix: 'h+FAFudwW8v7ike0RZHDffmyeYfPiYuzQMFuowMb5oU=' },
  { key: '/fHl7Qv1ikwPKyL0lUzfSpezMzs/NQhXLd4oM2EV7rE=', salt: 'ktBTjeZq', xf: XF_B81 },
  { mix: 'uurIGtPeTc+ba1ChtLArhWmoRF/inQKroOVCnRWF95A=' },
  { key: 'x3pVPpO3HuDn6gWZWl2xZGMPKder59HOmXQapKYZFrc=', salt: 'UrW2YxI=', xf: XF_C272 },
  { mix: 'GXnh/ODoP1jQ1Bg4cK/2evHe1ftZq28kHUEjcNluJBs=' },
  { key: '9tUZWeV9YLIXwIozINaRWJbShHyAkQqzK4DXjWNyxHE=', salt: 'eM8vlGc=', xf: XF_C936 },
  { mix: 'yxIDC/Gq/J7LOm/LFifOdFZQ7UQV3lKsaFz+PR3S+ak=' },
];

export function encryptResolveToken(en: string) {
  const rand = crypto.randomBytes(16);
  const plain = Buffer.concat([rand, writeU64LE(Date.now()), Buffer.from(en, 'utf8')]);
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, AES_IV);
  let aes = Buffer.concat([cipher.update(plain), cipher.final()]);

  let h = crypto.createHash('sha256').update(PREFIX).update(rand).digest();
  for (let i = 0; i < aes.length; i++) {
    if (i % 32 === 0 && i > 0) h = crypto.createHash('sha256').update(h).digest();
    aes[i] ^= h[i % 32];
  }

  const h2 = crypto.createHash('sha256').update(AES_KEY).update(rand).digest();
  for (let i = 0; i < aes.length; i++) {
    const k = h2[i % 32];
    aes[i] = (rotl(aes[i], k & 7) + (k ^ 165)) & 255;
  }

  const table = perm256(Buffer.concat([rand, PREFIX, AES_IV]));
  for (let i = 0; i < aes.length; i++) aes[i] = table[aes[i]];

  const { out: shuffled, order } = shuffleBlocks(aes, Buffer.concat([PREFIX, rand]));
  aes = Buffer.from(shuffled);

  applyOrder(
    aes,
    fyOrder(
      aes.length,
      xorshift(Buffer.concat([AES_KEY, rand, Buffer.from([aes.length & 255])])),
    ),
  );

  const orderBuf = Buffer.allocUnsafe(order.length * 4);
  for (let i = 0; i < order.length; i++) orderBuf.writeUInt32LE(order[i], i * 4);
  const mac = crypto.createHash('sha256').update(orderBuf).update(aes).digest().subarray(0, 8);
  const lenBuf = Buffer.allocUnsafe(2);
  lenBuf.writeUInt16LE(order.length);
  const packet = Buffer.concat([Buffer.from([1]), rand, lenBuf, orderBuf, aes, mac]);

  let s = [...encodeCustom(packet)].reverse().join('');
  s = Buffer.from(s, 'utf8').toString('hex');
  let bytes = Buffer.from(encodeURIComponent(s), 'utf8');

  for (const step of PIPE) {
    if ('mix' in step) bytes = rc4(Buffer.from(step.mix, 'base64'), bytes);
    else bytes = saltedXor(bytes, step.key, step.salt, step.xf);
  }

  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
