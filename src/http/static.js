import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../public');

const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/player.js': ['player.js', 'application/javascript; charset=utf-8'],
  '/hls.min.js': ['hls.min.js', 'application/javascript; charset=utf-8'],
};

export function serveStatic(pathname, res) {
  const asset = assets[pathname];
  if (!asset) return false;
  res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
  createReadStream(join(root, asset[0])).pipe(res);
  return true;
}
