import { createDecipheriv, createHash } from 'node:crypto';
import type { AzDecryptMaterial } from './az-material.js';

const HEADER_LEN = 8;
const KM_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

let material: AzDecryptMaterial | null = null;

export function setCatalogDecryptMaterial(next: AzDecryptMaterial) {
  material = next;
}

function fixedHash() {
  if (!material) throw new Error('catalog decrypt material not loaded');
  return material.fixedHash;
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
  const key = createHash('sha256').update(fixedHash()).update(km).digest();

  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  if (plain.length <= HEADER_LEN) throw new Error('catalog plaintext empty');

  return JSON.parse(plain.subarray(HEADER_LEN).toString('utf8'));
}
