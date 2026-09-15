import { type ServerProfile, vidcoreHeaders } from './types.js';

export const prime: ServerProfile = {
  name: 'Prime',
  hosts: ['moon.peakstorm.top', 'keenanchor.top'],
  needsProxy: true,
  directPlayable: true,
  refererRequired: false,
  abrMaster: true,
  headers: { ...vidcoreHeaders },
};
