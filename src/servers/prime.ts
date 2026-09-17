import { type ServerProfile, vidcoreHeaders } from './types.js';

export const prime: ServerProfile = {
  name: 'Prime',
  hosts: ['moon.peakstorm.top', 'keenanchor.top', 'northoak.top', 'lunarcabin.top', 'thunderpencil.site'],
  needsProxy: true,
  directPlayable: true,
  refererRequired: true,
  abrMaster: true,
  segmentPathIncludes: ['/r2/cdn2/'],
  headers: { ...vidcoreHeaders },
};
