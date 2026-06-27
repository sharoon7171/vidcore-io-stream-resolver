import { getStreamMoPath, decryptMoBody } from '../vm/runtime.js';

export async function unlockServer(server, sessionFetch, vmCtx) {
  const response = await sessionFetch(getStreamMoPath(server), {
    method: 'POST',
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    body: '',
  });
  if (!response.ok) throw new Error(`stream mo failed: ${response.status}`);
  const config = await decryptMoBody(await response.text(), { ...vmCtx, server });
  if (!config.url) throw new Error('decrypt missing stream url');
  return config;
}
