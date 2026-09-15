import { createDecipheriv, createHash } from 'node:crypto';

const FIXED_BLOB = Buffer.from(
  'ddb8548c909e1c00e2e3631e0b13b80fa905f0a84b225cd7bc290ba10a0d9d62d97e2464000000000b85290701000000',
  'hex',
);
const FIXED_HASH = createHash('sha256').update(FIXED_BLOB).digest();
const HEADER_LEN = 8;
const KM_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(km: Buffer) {
  return createHash('sha256').update(FIXED_HASH).update(km).digest();
}

export function decryptCatalogBody(body: string): unknown {
  const raw = Buffer.from(body, 'base64');
  if (raw.length < KM_LEN + IV_LEN + TAG_LEN + 1) {
    throw new Error('catalog ciphertext too short');
  }

  const km = raw.subarray(0, KM_LEN);
  const iv = raw.subarray(KM_LEN, KM_LEN + IV_LEN);
  const tag = raw.subarray(raw.length - TAG_LEN);
  const ct = raw.subarray(KM_LEN + IV_LEN, raw.length - TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', deriveKey(km), iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  if (plain.length <= HEADER_LEN) throw new Error('catalog plaintext empty');

  return JSON.parse(plain.subarray(HEADER_LEN).toString('utf8'));
}
