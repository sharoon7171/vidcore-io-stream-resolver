export async function readNdjson(res: Response, onEvent: (evt: Record<string, unknown>) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as Record<string, unknown>);
    }
  }
}

export async function fetchResolveStream(params: URLSearchParams) {
  const res = await fetch(`/api/resolve?${params}`);
  if (!res.ok) {
    const data = (await res.json()) as { stage?: string; error?: string };
    throw new Error(`${data.stage || 'error'}: ${data.error || 'resolve failed'}`);
  }
  return res;
}
