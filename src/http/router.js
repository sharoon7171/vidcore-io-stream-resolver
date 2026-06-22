import { serve } from '../relay/hls.js';
import { stream } from '../resolve/run.js';
import { parseInput } from '../resolve/input.js';
import { serveStatic } from './static.js';

const cors = { 'Access-Control-Allow-Origin': '*' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(body));
}

async function ndjson(res, gen) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', ...cors });
  for await (const evt of gen) res.write(`${JSON.stringify(evt)}\n`);
  res.end();
}

export async function route(req, res) {
  if (!req.headers.host) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('missing host');
    return;
  }

  const { pathname, searchParams, origin } = new URL(req.url ?? '/', `http://${req.headers.host}`);

  try {
    if (pathname === '/api/hls') {
      await serve(res, searchParams, origin);
      return;
    }

    if (pathname === '/api/resolve') {
      try {
        await ndjson(res, stream(parseInput({
          type: searchParams.get('type'),
          id: searchParams.get('id'),
          season: searchParams.get('season'),
          episode: searchParams.get('episode'),
        }), origin));
      } catch (err) {
        json(res, 400, { ok: false, stage: 'input', error: err.message });
      }
      return;
    }

    if (serveStatic(pathname, res)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}
