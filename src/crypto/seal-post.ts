const HANDLERS: Record<string, (x: number) => number> = {
  sub226: (x) => (((x - 226) % 256) + 256) % 256,
  sub76: (x) => (((x - 76) % 256) + 256) % 256,
  sub200: (x) => (((x - 200) % 256) + 256) % 256,
  sub216: (x) => (((x - 216) % 256) + 256) % 256,
  sub218: (x) => (((x - 218) % 256) + 256) % 256,
  xor59: (x) => x ^ 59,
  add230: (x) => (x + 230) % 256,
  rol2: (x) => ((x << 2) | (x >> 6)) & 255,
  ror2: (x) => ((x >> 2) | (x << 6)) & 255,
  rol1: (x) => ((x << 1) | (x >> 7)) & 255,
  ror1: (x) => ((x << 7) | (x >> 1)) & 255,
};

type Round = {
  key: Buffer;
  salt: string;
  map: ((x: number) => number)[];
  rc4Key: string;
};

function b64(s: string) {
  return Buffer.from(s, 'base64');
}

function buildMap(names: (keyof typeof HANDLERS)[]): ((x: number) => number)[] {
  return names.map((n) => HANDLERS[n]);
}

const ROUNDS: Round[] = [
  {
    key: b64('IDQKsugZuiyX0KqjfaGjIQje+eu643pfHpQUrUz52bA='),
    salt: b64('NcixOZhN4bo=').toString('binary'),
    map: buildMap(['sub226', 'sub76', 'rol2', 'sub200', 'xor59', 'sub76', 'xor59', 'sub200', 'xor59', 'sub226']),
    rc4Key: b64('SeJLBvFHjeGxN3U+rj20gjypIVJJHPUOiz6uzLJw8FI=').toString('binary'),
  },
  {
    key: b64('D9Zj/heBwkQSoOHHbMtEg8Z+N6AH52+vEwh3NtuxoP0='),
    salt: b64('l9xhkRZY6Mw=').toString('binary'),
    map: buildMap(['sub216', 'rol1', 'ror1', 'xor59', 'sub216', 'xor59', 'sub226', 'ror1', 'rol1', 'rol2']),
    rc4Key: b64('1CvORN4NtfXiMWfMTVK2L19MgE5FEf/gs5bvP5zOgk4=').toString('binary'),
  },
  {
    key: b64('1hb8EsYmWw2OQAylK07fMSzpW7CZKO44Bp9wl/qpz9s='),
    salt: b64('kfJ8NEgT').toString('binary'),
    map: buildMap(['sub218', 'rol2', 'xor59', 'rol1', 'rol2', 'ror2', 'xor59', 'sub218', 'rol1', 'add230']),
    rc4Key: b64('TNCzjfIrsL8IkoP308zBRf3D1tVGmp28Cc8o0Dx76mc=').toString('binary'),
  },
  {
    key: b64('JpjQJRlxRMs49rcFvGJQM/OK/EvhWkwHZZEQR3pluoM='),
    salt: b64('cxyh6xM=').toString('binary'),
    map: buildMap(['rol2', 'sub200', 'ror2', 'sub200', 'rol1', 'rol1', 'sub226', 'ror2', 'rol1', 'ror1']),
    rc4Key: b64('MC6l/x8wPP/S80d0lGOCUo1QMktOwtEEmSOJ/ICWyp0=').toString('binary'),
  },
  {
    key: b64('kX8110WLcEXrAZGYe6GXuiFybtS1OtKn5VFjoqr8F3A='),
    salt: b64('bl3UkCo=').toString('binary'),
    map: buildMap(['sub200', 'rol2', 'sub226', 'add230', 'sub76', 'add230', 'sub200', 'sub218', 'rol2', 'rol1']),
    rc4Key: b64('0fwMQkqsyDiZQpt0CArUHURvOOPxqSjwHRLLqhCAPtQ=').toString('binary'),
  },
];

function rc4Fp(key: string, data: string, fp: number) {
  const S = Array.from({ length: 256 }, (_, i) => i);
  const kadd = Math.imul(fp, 195) & 255;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key.charCodeAt(i % key.length) + kadd) % 256;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let i = 0;
  j = 0;
  let out = '';
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    [S[i], S[j]] = [S[j], S[i]];
    out += String.fromCharCode(data.charCodeAt(n) ^ S[(S[i] + S[j]) % 256]);
  }
  return out;
}

function mix(data: number[], key: Buffer, salt: string, map: ((x: number) => number)[], addend: number) {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < salt.length) out.push(salt.charCodeAt(i));
    out.push((map[i % 10](data[i] ^ key[i % 32]) + addend) & 255);
  }
  return out;
}

function toBytes(s: string) {
  return Array.from(s, (c) => c.charCodeAt(0));
}

function fromBytes(bytes: number[]) {
  return String.fromCharCode(...bytes);
}

function base64url(bytes: number[]) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function sealPostEncode(encodeOut: string, fp = 0) {
  const reversed = [...encodeOut].reverse().join('');
  const hex = Buffer.from(reversed, 'utf8').toString('hex');
  let state = toBytes(hex);
  const addend = (fp >> 2) & 15;
  for (const round of ROUNDS) {
    state = mix(state, round.key, round.salt, round.map, addend);
    state = toBytes(rc4Fp(round.rc4Key, fromBytes(state), fp));
  }
  return base64url(state);
}
