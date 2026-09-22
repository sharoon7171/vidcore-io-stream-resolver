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
      highBufferWatchdogPeriod?: number;
      nudgeMaxRetry?: number;
      fragLoadingTimeOut?: number;
      manifestLoadingTimeOut?: number;
      fragLoadingMaxRetry?: number;
      levelLoadingMaxRetry?: number;
      fragLoadingRetryDelay?: number;
      levelLoadingRetryDelay?: number;
      progressive?: boolean;
    });
    readonly levels: Level[];
    readonly autoLevelEnabled: boolean;
    currentLevel: number;
    on(event: string, cb: (...args: any[]) => void): void;
    attachMedia(media: HTMLMediaElement): void;
    loadSource(source: string): void;
    startLoad(startPosition?: number): void;
    recoverMediaError(): void;
    destroy(): void;
  }
}
