import { createHash } from 'node:crypto';
import type { XorTableConsts } from './ah-seal-material.js';

export type AzDecryptMaterial = {
  fixedHex: string;
  parts: [number, number];
  fixedHash: Buffer;
};

function makeAq(seed: number, c: XorTableConsts) {
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

function u64le(n: number) {
  const b = Buffer.allocUnsafe(8);
  let v = BigInt(n);
  for (let i = 0; i < 8; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

export function decodeAzStream(aZ: Buffer, seed: number, xor: XorTableConsts) {
  const aq = makeAq(seed, xor);
  const plain = Buffer.allocUnsafe(aZ.length);
  for (let i = 0; i < aZ.length; i++) plain[i] = aZ[i] ^ aq[i % 256];
  return plain;
}

export function scanAzDecryptMaterial(aZ: Buffer, seed: number, xor: XorTableConsts): AzDecryptMaterial {
  const text = decodeAzStream(aZ, seed, xor).toString('latin1');
  const hexes = [...text.matchAll(/[0-9a-f]{64}/g)].map((m) => m[0]);
  const fixedHex = [...new Set(hexes)][0];
  if (!fixedHex) throw new Error('aZ missing fixed hex');

  const aesAt = text.indexOf('aes-256-gcm');
  if (aesAt < 0) throw new Error('aZ missing aes-256-gcm');
  const window = text.slice(Math.max(0, aesAt - 8000), aesAt + 2000);
  const nums = [...new Set([...window.matchAll(/\d{9,12}/g)].map((m) => Number(m[0])))].filter(
    (n) => n > 1e8 && n < Number.MAX_SAFE_INTEGER,
  );
  if (nums.length < 2) throw new Error('aZ missing fixed parts');

  const parts: [number, number] = [nums[0], nums[1]];
  const fixed = Buffer.concat([Buffer.from(fixedHex, 'hex'), u64le(parts[0]), u64le(parts[1])]);
  return {
    fixedHex,
    parts,
    fixedHash: createHash('sha256').update(fixed).digest(),
  };
}
