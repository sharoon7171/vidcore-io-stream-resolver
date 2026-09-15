import { type ServerProfile, vidcoreHeaders } from './types.js';

export const premiere: ServerProfile = {
  name: 'Premiere 4K',
  hosts: [],
  needsProxy: false,
  directPlayable: true,
  refererRequired: false,
  abrMaster: false,
  headers: { ...vidcoreHeaders },
};
