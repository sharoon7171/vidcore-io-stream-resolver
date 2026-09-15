import { type ServerProfile, vidcoreHeaders } from './types.js';

export const orbit: ServerProfile = {
  name: 'Orbit',
  hosts: ['moon.peakstorm.top'],
  needsProxy: true,
  directPlayable: false,
  refererRequired: true,
  abrMaster: false,
  segmentType: 'video/mp2t',
  headers: { ...vidcoreHeaders },
};
