export type ResolveRequest =
  | { kind: 'movie'; id: string }
  | { kind: 'tv'; id: string; season: string; episode: string };

export function parseResolveRequest(body: {
  type?: string | null;
  id?: string | null;
  season?: string | null;
  episode?: string | null;
}): ResolveRequest {
  if (!body?.type || body?.id == null || body.id === '') throw new Error('type and id required');

  const kind = body.type === 'tv' ? 'tv' : 'movie';
  const id = String(body.id).trim();
  if (!/^\d+$/.test(id)) throw new Error('id must be a number');

  if (kind === 'movie') return { kind, id };

  if (body.season == null || body.season === '' || body.episode == null || body.episode === '') {
    throw new Error('season and episode required for tv');
  }
  const season = String(body.season).trim();
  const episode = String(body.episode).trim();
  if (!/^\d+$/.test(season) || !/^\d+$/.test(episode)) {
    throw new Error('season and episode must be numbers');
  }
  return { kind, id, season, episode };
}
