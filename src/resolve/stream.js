import { getStreamMoPath, decryptMoBody } from '../vm/runtime.js';

export async function unlockServer(server, sessionFetch, vmCtx) {
  const streamMo = getStreamMoPath(server);
  const streamResponse = await sessionFetch(streamMo, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/octet-stream',
    },
    body: '',
  });
  if (!streamResponse.ok) {
    throw new Error(`stream mo failed: ${streamResponse.status}`);
  }
  const streamBody = await streamResponse.text();
  const streamConfig = await decryptMoBody(streamBody, vmCtx);
  if (!streamConfig.url) {
    throw new Error('decrypt missing stream url');
  }
  return streamConfig.url;
}
