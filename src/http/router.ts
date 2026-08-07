import type { IncomingMessage, ServerResponse } from 'node:http';
import { serveProxyRequest } from '../proxy/servers.js';
import { parseResolveRequest } from '../resolver/request.js';
import { resolvePlayback } from '../resolver/pipeline.js';
import { serveStatic } from './static.js';

const cors = { 'Access-Control-Allow-Origin': '*' };

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(body));
}

async function ndjson(res: ServerResponse, gen: AsyncGenerator<unknown>) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    ...cors,
  });
  res.socket?.setNoDelay?.(true);
  for await (const evt of gen) {
    const line = `${JSON.stringify(evt)}\n`;
    if (!res.write(line)) await new Promise<void>((resolve) => res.once('drain', resolve));
  }
  res.end();
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (!req.headers.host) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('missing host');
    return;
  }

  const { pathname, searchParams, origin } = new URL(req.url ?? '/', `http://${req.headers.host}`);

  try {
    if (pathname === '/api/hls') {
      await serveProxyRequest(req, res, searchParams, origin);
      return;
    }

    if (pathname === '/api/resolve') {
      try {
        await ndjson(
          res,
          resolvePlayback(
            parseResolveRequest({
              type: searchParams.get('type'),
              id: searchParams.get('id'),
              season: searchParams.get('season'),
              episode: searchParams.get('episode'),
            }),
            origin,
          ),
        );
      } catch (err) {
        json(res, 400, { ok: false, stage: 'input', error: (err as Error).message });
      }
      return;
    }

    if (serveStatic(pathname, res)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    json(res, 500, { ok: false, error: String((err as Error).message || err) });
  }
}
