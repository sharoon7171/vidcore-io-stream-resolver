import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const HEX_KEY =
  '9b425029a188e1131dbc32a24632a5ac9124037d52587001844f02315c00ebb0';
const NUM_A = 1318175778;
const NUM_B = 5464207410;

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
