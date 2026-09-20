import { type ServerProfile, vidcoreHeaders } from './types.js';

export const supreme: ServerProfile = {
  name: 'Supreme',
  hosts: ['moon.clearvault.top', 'moon.peakstorm.top', 'keenanchor.top'],
  needsProxy: true,
  directPlayable: true,
  refererRequired: true,
  abrMaster: true,
  headers: { ...vidcoreHeaders },
};
