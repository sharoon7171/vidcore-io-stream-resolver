const MOVIE_ID = '550';
const TV_ID = '44217';
const TV_SEASON = '1';
const TV_EPISODE = '1';

export type ResolveForm = {
  type: HTMLSelectElement;
  id: HTMLInputElement;
  idLabel: HTMLElement;
  tvFields: HTMLElement;
  hintMovie: HTMLElement;
  hintTv: HTMLElement;
  season: HTMLInputElement;
  episode: HTMLInputElement;
};

export function syncType(form: ResolveForm) {
  const tv = form.type.value === 'tv';
  form.tvFields.hidden = !tv;
  form.hintMovie.hidden = tv;
  form.hintTv.hidden = !tv;
  form.idLabel.textContent = tv ? 'TV ID' : 'Movie ID';
  form.id.placeholder = tv ? TV_ID : MOVIE_ID;
  form.season.required = tv;
  form.episode.required = tv;
  const current = form.id.value.trim();
  if (tv && (!current || current === MOVIE_ID)) form.id.value = TV_ID;
  if (!tv && (!current || current === TV_ID)) form.id.value = MOVIE_ID;
  if (tv) {
    if (!form.season.value.trim()) form.season.value = TV_SEASON;
    if (!form.episode.value.trim()) form.episode.value = TV_EPISODE;
  } else {
    form.season.value = '';
    form.episode.value = '';
  }
}

export function queryParams(form: ResolveForm) {
  const params = new URLSearchParams({ type: form.type.value, id: form.id.value.trim() });
  if (form.type.value === 'tv') {
    params.set('season', form.season.value.trim());
    params.set('episode', form.episode.value.trim());
  }
  return params;
}
