import { horizon } from './horizon.js';
import { orbit } from './orbit.js';
import { premiere } from './premiere.js';
import { prime } from './prime.js';
import { supreme } from './supreme.js';
import type { ServerProfile } from './types.js';

export type { ServerProfile } from './types.js';

export const SERVER_ORDER = [
  orbit.name,
  supreme.name,
  prime.name,
  premiere.name,
  horizon.name,
] as const;

export type ServerName = (typeof SERVER_ORDER)[number];

const servers: readonly ServerProfile[] = [orbit, supreme, prime, premiere, horizon];

export function isServerName(value: string): value is ServerName {
  return (SERVER_ORDER as readonly string[]).includes(value);
}

export function profileByName(name: string): ServerProfile | null {
  return servers.find((server) => server.name === name) ?? null;
}
