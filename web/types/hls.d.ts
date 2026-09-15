declare module 'hls.js' {
  export type ErrorData = {
    fatal: boolean;
    details: string;
    type?: string;
    error?: Error;
  };

  export type Level = {
    bitrate: number;
    width: number;
    height: number;
    name?: string;
  };

  export type ManifestParsedData = {
    levels: Level[];
  };

  export type LevelSwitchedData = {
    level: number;
  };

  export default class Hls {
    static isSupported(): boolean;
    static Events: {
      MANIFEST_PARSED: string;
      LEVEL_SWITCHED: string;
      ERROR: string;
    };
    static ErrorTypes: {
      NETWORK_ERROR: string;
      MEDIA_ERROR: string;
    };
    constructor(config?: {
      enableWorker?: boolean;
      lowLatencyMode?: boolean;
      startFragPrefetch?: boolean;
      testBandwidth?: boolean;
      abrEwmaDefaultEstimate?: number;
      abrBandWidthFactor?: number;
      abrBandWidthUpFactor?: number;
      startLevel?: number;
      capLevelToPlayerSize?: boolean;
      maxBufferLength?: number;
      maxMaxBufferLength?: number;
      maxBufferSize?: number;
      maxBufferHole?: number;
      backBufferLength?: number;
      fragLoadingTimeOut?: number;
      manifestLoadingTimeOut?: number;
      fragLoadingMaxRetry?: number;
      levelLoadingMaxRetry?: number;
      progressive?: boolean;
    });
    readonly levels: Level[];
    readonly autoLevelEnabled: boolean;
    startLevel: number;
    currentLevel: number;
    nextLevel: number;
    loadLevel: number;
    on(event: string, cb: (...args: any[]) => void): void;
    off(event: string, cb: (...args: any[]) => void): void;
    attachMedia(media: HTMLMediaElement): void;
    loadSource(source: string): void;
    startLoad(startPosition?: number): void;
    recoverMediaError(): void;
    destroy(): void;
  }
}
