import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../dist');
const modules = join(dirname(fileURLToPath(import.meta.url)), '../../node_modules');

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
};

const vendor: Record<string, [string, string]> = {
  '/vendor/hls.mjs': [join('hls.js', 'dist', 'hls.mjs'), 'application/javascript; charset=utf-8'],
};

function underRoot(file: string) {
  const resolved = normalize(file);
  return resolved === root || resolved.startsWith(root + sep);
}

export function serveStatic(pathname: string, res: ServerResponse) {
  const vendorAsset = vendor[pathname];
  if (vendorAsset) {
    res.writeHead(200, { 'Content-Type': vendorAsset[1], 'Cache-Control': 'no-store' });
    createReadStream(join(modules, vendorAsset[0])).pipe(res);
    return true;
  }

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const file = join(root, rel);
  if (!underRoot(file) || !existsSync(file) || !statSync(file).isFile()) return false;

  const type = types[extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
  return true;
}
