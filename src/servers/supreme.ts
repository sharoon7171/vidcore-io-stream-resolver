import type { ServerProfile } from './types.js';

export const supreme: ServerProfile = {
  name: 'Supreme',
  needsProxy: true,
  refererRequired: true,
  abrMaster: true,
  cli: {
    mediaTitle: false,
  },
};
