import type { ServerProfile } from './types.js';

export const orbit: ServerProfile = {
  name: 'Orbit',
  needsProxy: true,
  refererRequired: true,
  abrMaster: false,
  segmentType: 'video/mp2t',
  cli: {
    mpvArgs: ['--stream-lavf-o=seekable=0'],
    mediaTitle: false,
  },
};
