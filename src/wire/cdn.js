import { ua, vidcoreReferer } from '../env.js';

export async function pull(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': ua,
      referer: vidcoreReferer,
      accept: '*/*',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
