declare module 'hls.js' {
  export default class Hls {
    static isSupported(): boolean;
    static Events: { MANIFEST_PARSED: string; ERROR: string };
    constructor();
    on(event: string, cb: (...args: any[]) => void): void;
    attachMedia(media: HTMLMediaElement): void;
    loadSource(source: string): void;
    destroy(): void;
  }
}
