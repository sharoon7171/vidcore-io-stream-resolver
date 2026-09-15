import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { sealPostEncode } from './seal-post.js';

const AES_KEY = Buffer.from(
  '6e6186d9d850354bd48b3d53bb93d21412fca6205ec61898812718a7ba637319',
  'hex',
);
const AES_IV = Buffer.from('3499cedbb1272bf1e1a819f4e1b930d4', 'hex');
const C7 = Buffer.from('a3790b59734789', 'hex');
const FP_MUL = 3622089641;
const GOLDEN = 2654435769;

const IZ_FROM = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F',
  'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
  'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '_',
];
const IZ_TO = [
  'V', 'G', 'r', '9', 'J', 'D', 'v', 'o', 'P', '2', '0', 'h', 'A', '_', '-', 't',
  'H', 'I', 'u', '6', 'q', 's', 'f', 'K', 'g', 'x', 'Q', 'B', 'c', 'X', 'j', 'p',
  '1', '3', 'n', 'm', 'l', 'b', '5', 'U', 'L', 'S', 'Y', 'N', 'W', '7', 'Z', 'O',
  'e', 'd', 'k', 'y', 'w', 'i', 'E', 'a', 'z', 'C', 'F', '4', '8', 'M', 'T', 'R',
];
const IZ_MAP = new Map(IZ_FROM.map((c, i) => [c, IZ_TO[i]]));

function makeRng(seed: Buffer, fp: number) {
  const h = createHash('sha256').update(seed).digest();
  let s =
    ((h.readUInt32LE(0) ^ h.readUInt32LE(4) ^ h.readUInt32LE(8) ^ h.readUInt32LE(12)) ^
      (Math.imul(fp, FP_MUL) >> 0)) >>
    0;
  if (s === 0) s = GOLDEN;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  };
}

function rol(x: number, n: number) {
  n &= 7;
  return ((x << n) | (x >>> (8 - n))) & 255;
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

function iZEncode(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .split('')
    .map((c) => IZ_MAP.get(c) || c)
    .join('');
}

function writeTimeLE(buf: Buffer, offset: number, now: number) {
  let v = BigInt(now);
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
}

function packBody(ct: Buffer, r16: Buffer, fp: number) {
  const body = Buffer.from(ct);

  let ks = createHash('sha256').update(Buffer.concat([C7, r16])).digest();
  for (let i = 0; i < body.length; i++) {
    if (i % 32 === 0 && i !== 0) ks = createHash('sha256').update(ks).digest();
    body[i] ^= ks[i % 32];
  }

  const ks2 = createHash('sha256').update(Buffer.concat([AES_KEY, r16])).digest();
  for (let i = 0; i < body.length; i++) {
    const k = ks2[i % 32];
    body[i] = (rol(body[i], ((k & 7) + (fp & 3)) & 7) + (k ^ 165)) & 255;
  }

  const rngS = makeRng(Buffer.concat([r16, C7, AES_IV]), fp);
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
  const order = fisherYates(nBlocks, makeRng(Buffer.concat([C7, r16]), fp));
  const shuffled = Buffer.alloc(nBlocks * 16);
  for (let i = 0; i < nBlocks; i++) {
    body.copy(shuffled, i * 16, order[i] * 16, order[i] * 16 + 16);
  }
  const out = Buffer.from(shuffled.subarray(0, body.length));

  const perm = fisherYates(
    out.length,
    makeRng(Buffer.concat([AES_KEY, r16, Buffer.from([out.length & 255])]), fp),
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

export function sealEn(en: string) {
  const fp = 0;
  const r16 = randomBytes(16);
  const now = Date.now();

  const pt = Buffer.alloc(16 + 8 + Buffer.byteLength(en));
  r16.copy(pt, 0);
  writeTimeLE(pt, 16, now);
  pt.write(en, 24, 'utf8');

  const cipher = createCipheriv('aes-256-cbc', AES_KEY, AES_IV);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return sealPostEncode(iZEncode(packBody(ct, r16, fp)), fp);
}
