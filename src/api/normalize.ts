import type { RawEpisode, RawItemBase, RawMovie, RawNames, RawSerial, RawSerialDetail } from './raw';
import type {
  Episode,
  LanguageTrack,
  Movie,
  Ratings,
  Serial,
  SerialDetail,
  WatchState,
} from './models';

/** Pořadí, ve kterém hledáme název k zobrazení. */
const TITLE_PREFERENCE = ['cs', 'sk', 'en', 'us', 'uk'];
const ORIGINAL_PREFERENCE = ['en', 'us', 'uk'];

/** Plugin považuje > 80 % za dokoukané. */
const FINISHED_RATIO = 0.8;

export function normalizeNames(raw: RawNames | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    const list = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string' && v !== '');
    if (list.length) out[key] = list;
  }
  return out;
}

export function pickName(names: Record<string, string[]>, preference = TITLE_PREFERENCE): string | undefined {
  for (const key of preference) {
    const v = names[key]?.[0];
    if (v) return v;
  }
  return Object.values(names)[0]?.[0];
}

/** Sosáč vrací obrázky přes http, PWA na https by je zablokovala (mixed content). */
export function secureUrl(url: string | string[] | undefined): string | undefined {
  const v = Array.isArray(url) ? url[0] : url;
  if (!v || typeof v !== 'string') return undefined;
  // Výchozí placeholdery ("defaultnis.jpg", "defaultniep.jpg") nechceme zobrazovat.
  if (/\/defaultni[a-z]*\.(jpg|png)$/i.test(v)) return undefined;
  return v.replace(/^http:\/\//i, 'https://');
}

/** "30.3.2012" → "2012-03-30". */
export function parseCzDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw.trim());
  if (!m) return undefined;
  const [, d, mo, y] = m;
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

/** "en+cztit" → {audio: "en", subtitles: "cz"}. */
export function parseLanguage(raw: string): LanguageTrack {
  const [audio = raw, extra] = raw.split('+');
  const sub = extra?.endsWith('tit') ? extra.slice(0, -3) : undefined;
  return { audio, subtitles: sub || undefined, raw };
}

function toInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x !== '');
  if (typeof v === 'string' && v) return [v];
  return [];
}

function ratings(raw: RawItemBase): Ratings {
  const r: Ratings = {};
  if (raw.c) r.csfd = raw.c;
  if (raw.cp) r.csfdVotes = raw.cp;
  if (raw.m) r.imdb = raw.m / 10;
  if (raw.mp) r.imdbVotes = raw.mp;
  return r;
}

export function watchState(position: number | null | undefined, duration: number | undefined): WatchState {
  const pos = typeof position === 'number' && Number.isFinite(position) ? position : null;
  const progress = pos !== null && duration ? Math.min(1, pos / duration) : 0;
  return { position: pos, duration, progress, finished: progress > FINISHED_RATIO };
}

function base(raw: RawItemBase, names: Record<string, string[]>) {
  const title = pickName(names) ?? `#${raw._id}`;
  const original = pickName(names, ORIGINAL_PREFERENCE);
  const duration = toInt(raw.dl);
  return {
    id: raw._id,
    title,
    originalTitle: original && original !== title ? original : undefined,
    names,
    year: toInt(raw.y),
    description: raw.p || undefined,
    poster: secureUrl(raw.i),
    backdrop: secureUrl(raw.b),
    quality: raw.q || undefined,
    languages: (raw.d ?? []).map(parseLanguage),
    genres: strList(raw.g),
    countries: strList(raw.o),
    ratings: ratings(raw),
    ageRating: raw.a && raw.a !== 99 ? raw.a : undefined,
    duration,
    date: parseCzDate(raw.r),
    audioFormat: raw.e || undefined,
    watch: watchState(raw.w, duration),
  };
}

export function normalizeMovie(raw: RawMovie): Movie {
  return {
    ...base(raw, normalizeNames(raw.n)),
    kind: 'movie',
    streamId: raw.l || undefined,
    directors: strList(raw.s),
    writers: strList(raw.h),
    cast: strList(raw.f),
  };
}

export function normalizeSerial(raw: RawSerial): Serial {
  return {
    ...base(raw, normalizeNames(raw.n)),
    kind: 'serial',
    seasonCount: toInt(raw.z),
    episodeCount: toInt(raw.v),
    directors: strList(raw.s),
    writers: strList(raw.h),
    cast: strList(raw.f),
  };
}

/**
 * @param context.serialId ID seriálu, pokud epizoda přišla z detailu seriálu
 *        (tam chybí `id` i `ne`).
 */
export function normalizeEpisode(raw: RawEpisode, context: { serialId?: number; serialTitle?: string } = {}): Episode {
  const hasSeparateEpisodeName = raw.ne !== undefined;
  const serialNames = hasSeparateEpisodeName ? normalizeNames(raw.n) : {};
  const episodeNames = normalizeNames(hasSeparateEpisodeName ? raw.ne : raw.n);

  const serialTitle = pickName(serialNames) ?? context.serialTitle;
  const season = toInt(raw.s) ?? 0;
  const episode = toInt(raw.ep) ?? 0;
  const episodeTitle = pickName(episodeNames) ?? `Epizoda ${episode}`;

  const b = base(raw, hasSeparateEpisodeName ? serialNames : episodeNames);
  return {
    ...b,
    kind: 'episode',
    title: serialTitle ? `${serialTitle} ${formatEpisodeCode(season, episode)}` : episodeTitle,
    names: episodeNames,
    streamId: raw.l || undefined,
    season,
    episode,
    episodeTitle,
    serialTitle,
    serialId: toInt(raw.id) ?? context.serialId,
    thumbnail: secureUrl(raw.ie) ?? (hasSeparateEpisodeName ? undefined : b.poster),
  };
}

export function normalizeSerialDetail(serialId: number, raw: RawSerialDetail, serialTitle?: string): SerialDetail {
  const seasons = Object.entries(raw ?? {})
    .map(([seasonKey, eps]) => ({
      number: Number(seasonKey),
      episodes: Object.entries(eps ?? {})
        .map(([epKey, ep]) => {
          const e = normalizeEpisode({ ...ep, s: ep.s ?? Number(seasonKey), ep: ep.ep ?? Number(epKey) }, { serialId, serialTitle });
          return e;
        })
        .sort((a, b) => a.episode - b.episode),
    }))
    .filter((s) => Number.isFinite(s.number))
    .sort((a, b) => a.number - b.number);
  return { serialId, seasons };
}

export function formatEpisodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}
