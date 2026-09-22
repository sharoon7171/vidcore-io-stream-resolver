export type ServerCli = {
  userAgent?: boolean;
  vlcArgs?: readonly string[];
  mpvArgs?: readonly string[];
  mediaTitle?: boolean;
};

export type ServerProfile = {
  name: string;
  needsProxy: boolean;
  refererRequired: boolean;
  abrMaster: boolean;
  segmentType?: string;
  cli?: ServerCli;
};
