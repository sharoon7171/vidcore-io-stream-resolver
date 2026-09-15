import { type ServerProfile, vidcoreHeaders } from './types.js';

export const horizon: ServerProfile = {
  name: 'Horizon',
  hosts: [],
  needsProxy: false,
  directPlayable: true,
  refererRequired: false,
  abrMaster: false,
  headers: { ...vidcoreHeaders },
};
