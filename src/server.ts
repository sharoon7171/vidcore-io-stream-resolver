import { createServer } from 'node:http';
import { port } from './config.js';
import { handleRequest } from './http/router.js';

const srv = createServer((req, res) => {
  void handleRequest(req, res);
});

function boot() {
  const addr = srv.address();
  const host = typeof addr === 'string' ? addr : `localhost:${addr?.port}`;
  console.log(`http://${host}/`);
}

if (process.env.HOST) srv.listen(port, process.env.HOST, boot);
else srv.listen(port, boot);
