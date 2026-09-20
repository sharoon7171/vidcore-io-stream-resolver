import { type ServerProfile, vidcoreHeaders } from './types.js';

export const orbit: ServerProfile = {
  name: 'Orbit',
  hosts: ['moon.clearvault.top', 'moon.peakstorm.top'],
  needsProxy: true,
  directPlayable: false,
  refererRequired: true,
  abrMaster: false,
  directSegments: true,
  segmentType: 'video/mp2t',
  headers: { ...vidcoreHeaders },
};
