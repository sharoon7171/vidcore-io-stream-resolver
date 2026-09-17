import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import type { SealMaterial } from './ah-seal-material.js';

export type { SealMaterial };

const IZ_FROM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

let material: SealMaterial | null = null;

export function setSealMaterial(next: SealMaterial) {
  material = next;
}

function rol(x: number, n: number) {
  n &= 7;
  return ((x << n) | (x >>> (8 - n))) & 255;
}

function makeRng(seed: Buffer, fp: number, fpMul: number, golden: number) {
  const h = createHash('sha256').update(seed).digest();
  let s =
    ((h.readUInt32LE(0) ^ h.readUInt32LE(4) ^ h.readUInt32LE(8) ^ h.readUInt32LE(12)) ^
      (Math.imul(fp, fpMul) >> 0)) >>>
    0;
  if (s === 0) s = golden;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  };
}

function fisherYates(n: number, next: () => number) {
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i >= 0; i--) {
    const j = next() % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order;
}

function writeTimeLE(buf: Buffer, offset: number, now: number) {
  let v = BigInt(now);
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function iZEncode(buf: Buffer, iz: string[]) {
  let out = '';
  const b64 = buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  for (const c of b64) {
    const d = IZ_FROM.indexOf(c);
    if (d === -1) throw new Error('iZ encode bad alphabet');
    out += iz[d];
  }
  return out;
}

function packBody(ct: Buffer, r16: Buffer, fp: number, m: SealMaterial) {
  const body = Buffer.from(ct);
  let ks = createHash('sha256').update(Buffer.concat([m.c7, r16])).digest();
  for (let i = 0; i < body.length; i++) {
    if (i % 32 === 0 && i !== 0) ks = createHash('sha256').update(ks).digest();
    body[i] ^= ks[i % 32];
  }

  const ks2 = createHash('sha256').update(Buffer.concat([m.aesKey, r16])).digest();
  for (let i = 0; i < body.length; i++) {
    const k = ks2[i % 32];
    body[i] = (rol(body[i], ((k & 7) + (fp & 3)) & 7) + (k ^ 165)) & 255;
  }

  const rngS = makeRng(Buffer.concat([r16, m.c7, m.aesIv]), fp, m.fpMul, m.golden);
  const sbox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) sbox[i] = i;
  for (let i = 255; i >= 0; i--) {
    const j = (rngS() + (Math.imul(fp, ((i | 1) ^ 90) >> 0) >> 0)) % (i + 1);
    const t = sbox[i];
    sbox[i] = sbox[j];
    sbox[j] = t;
  }
  for (let i = 0; i < body.length; i++) body[i] = sbox[body[i]];

  const nBlocks = Math.ceil(body.length / 16);
  const order = fisherYates(nBlocks, makeRng(Buffer.concat([m.c7, r16]), fp, m.fpMul, m.golden));
  const shuffled = Buffer.alloc(nBlocks * 16);
  for (let i = 0; i < nBlocks; i++) {
    body.copy(shuffled, i * 16, order[i] * 16, order[i] * 16 + 16);
  }
  const out = Buffer.from(shuffled.subarray(0, body.length));

  const perm = fisherYates(
    out.length,
    makeRng(Buffer.concat([m.aesKey, r16, Buffer.from([out.length & 255])]), fp, m.fpMul, m.golden),
  );
  const copy = Buffer.from(out);
  for (let i = 0; i < out.length; i++) out[i] = copy[perm[i]];

  const orderBuf = Buffer.alloc(nBlocks * 4);
  for (let i = 0; i < nBlocks; i++) orderBuf.writeUInt32LE(order[i], i * 4);
  const u16 = Buffer.alloc(2);
  u16.writeUInt16LE(nBlocks);
  const mac = createHash('sha256').update(Buffer.concat([orderBuf, out])).digest().subarray(0, 8);
  return Buffer.concat([Buffer.from([1]), r16, u16, orderBuf, out, mac]);
}

function mix(data: Buffer, key: Buffer, salt: Buffer, map: ((x: number) => number)[]) {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < salt.length) out.push(salt[i]);
    out.push(map[i % 10](data[i] ^ key[i % 32]) & 255);
  }
  return Buffer.from(out);
}

function rc4(key: Buffer, data: Buffer) {
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) % 256;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let i = 0;
  j = 0;
  const out = Buffer.alloc(data.length);
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    [S[i], S[j]] = [S[j], S[i]];
    out[n] = data[n] ^ S[(S[i] + S[j]) % 256];
  }
  return out;
}

function postEncode(encodeOut: string, m: SealMaterial) {
  const reversed = [...encodeOut].reverse().join('');
  let state = Buffer.from(Buffer.from(reversed, 'utf8').toString('hex'), 'utf8');
  for (const round of m.rounds) {
    state = mix(state, round.key, round.salt, round.map);
    state = rc4(round.rc4Key, state);
  }
  return state
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function sealEn(en: string) {
  if (!material) throw new Error('seal material not loaded');
  const m = material;
  const fp = 0;
  const r16 = randomBytes(16);
  const now = Date.now();

  const pt = Buffer.alloc(16 + 8 + Buffer.byteLength(en));
  r16.copy(pt, 0);
  writeTimeLE(pt, 16, now);
  pt.write(en, 24, 'utf8');

  const cipher = createCipheriv('aes-256-cbc', m.aesKey, m.aesIv);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return postEncode(iZEncode(packBody(ct, r16, fp, m), m.iz), m);
}
