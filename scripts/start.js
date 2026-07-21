import { execSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { port } from '../src/env.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  try {
    const out = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (!out) return;
    for (const pid of out.split('\n')) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {}
    }
  } catch {}
}

freePort();
await setTimeout(300);

const child = spawn(process.execPath, ['src/server.js'], { stdio: 'inherit', cwd: root });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
