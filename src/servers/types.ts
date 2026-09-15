import { siteReferer, userAgent } from '../config.js';

export type ServerProfile = {
  name: string;
  hosts: readonly string[];
  needsProxy: boolean;
  directPlayable: boolean;
  refererRequired: boolean;
  abrMaster: boolean;
  segmentType?: string;
  headers: Record<string, string>;
};

export const vidcoreHeaders: Record<string, string> = {
  Referer: siteReferer,
  'User-Agent': userAgent,
};
