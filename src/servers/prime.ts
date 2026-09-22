import type { ServerProfile } from './types.js';

export const prime: ServerProfile = {
  name: 'Prime',
  needsProxy: true,
  refererRequired: true,
  abrMaster: true,
  cli: {
    mediaTitle: false,
  },
};
