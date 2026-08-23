import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const HEX_KEY =
  '65514a10161847e8ec6d0400d80bee8dc69f6ba5c09b56729975781f66eaa4ca';
const NUM_A = 5839172817;
const NUM_B = 5717337600;

function writeUInt64LE(n: number) {
  const buf = Buffer.allocUnsafe(8);
  let x = BigInt(n);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return buf;
}

function masterKey() {
  return crypto
    .createHash('sha256')
    .update(
      Buffer.concat([
        Buffer.from(HEX_KEY, 'hex'),
        writeUInt64LE(NUM_A),
        writeUInt64LE(NUM_B),
      ]),
    )
    .digest();
}

export function decryptResolvePayload(rs: string) {
  const raw = Buffer.from(rs, 'base64');
  if (raw.length < 44) throw new Error('Invalid response');
  const salt = raw.subarray(0, 16);
  const iv = raw.subarray(16, 28);
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(28, raw.length - 16);
  const key = crypto.createHash('sha256').update(masterKey()).update(salt).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.subarray(8).toString('utf8'));
}
