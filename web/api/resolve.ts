import type { ServerEntry } from '../ui/servers.js';

export type ResolveEvent =
  | { event: 'meta'; title: string; year?: string | number }
  | { event: 'server'; server: { name: string; status: 'loading' } }
  | { event: 'server'; server: { name: string; status: 'fail'; ms: number; error?: string } }
  | {
      event: 'server';
      server: {
        name: string;
        status: 'ok';
        ms: number;
        url: string;
        play: string | null;
        proxy: boolean;
        referer: boolean;
        directPlayable: boolean;
      };
    }
  | { event: 'error'; stage?: string; error?: string };

type OkServer = Extract<ResolveEvent, { event: 'server' }>['server'] & {
  status: 'ok';
};

export async function consumeResolve(
  url: string,
  onEvent: (evt: ResolveEvent) => void | Promise<void>,
): Promise<void> {
  let chain = Promise.resolve();
  const enqueue = (evt: ResolveEvent) => {
    chain = chain.then(() => onEvent(evt));
  };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    let offset = 0;
    let buf = '';
    let failed = false;

    const fail = (error: Error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };

    const flush = () => {
      const chunk = xhr.responseText.slice(offset);
      if (chunk.length === 0) return;
      offset = xhr.responseText.length;
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        enqueue(JSON.parse(line) as ResolveEvent);
      }
    };

    const finish = () => {
      if (failed) return;
      if (xhr.status >= 400) {
        fail(new Error(`resolve failed: ${xhr.status}`));
        return;
      }
      flush();
      if (buf.trim().length > 0) enqueue(JSON.parse(buf) as ResolveEvent);
      void chain.then(resolve).catch(reject);
    };

    xhr.onprogress = flush;
    xhr.onload = finish;
    xhr.onerror = () => fail(new Error('resolve failed'));
    xhr.send();
  });

  await chain;
}

export function applyOkFields(entry: ServerEntry, server: OkServer) {
  entry.status = 'ok';
  entry.resolveMs = server.ms;
  entry.url = server.url;
  entry.play = server.play;
  entry.proxy = server.proxy;
  entry.referer = server.referer;
  entry.directPlayable = server.directPlayable;
}
