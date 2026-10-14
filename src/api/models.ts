/** Normalizovaný model pro UI. Žádné jednopísmenné klíče, žádné http URL. */

export type MediaKind = 'movie' | 'serial' | 'episode';

export interface Ratings {
  /** CSFD v procentech (0–100). */
  csfd?: number;
  csfdVotes?: number;
  /** IMDb na škále 0–10. */
  imdb?: number;
  imdbVotes?: number;
}

export interface LanguageTrack {
  /** Kód jazyka zvuku, např. "cz", "en". */
  audio: string;
  /** Kód jazyka titulků, pokud jsou ("en+cztit" → "cz"). */
  subtitles?: string;
  /** Původní hodnota z API. */
  raw: string;
}

export interface WatchState {
  /** Zhlédnuté sekundy, null = nikdy nespuštěno nebo nepřihlášen. */
  position: number | null;
  duration?: number;
  /** 0–1. */
  progress: number;
  /** Plugin považuje > 80 % za dokoukané. */
  finished: boolean;
}

interface MediaBase {
  id: number;
  kind: MediaKind;
  title: string;
  /** Originální / anglický název, pokud se liší. */
  originalTitle?: string;
  /** Všechny názvy podle kódu. */
  names: Record<string, string[]>;
  year?: number;
  description?: string;
  poster?: string;
  backdrop?: string;
  quality?: string;
  languages: LanguageTrack[];
  genres: string[];
  countries: string[];
  ratings: Ratings;
  /** Přístupnost (věk), undefined = neznámá. */
  ageRating?: number;
  /** Délka v sekundách. */
  duration?: number;
  /** Datum přidání / premiéry (ISO yyyy-mm-dd). */
  date?: string;
  audioFormat?: string;
  watch: WatchState;
}

export interface Movie extends MediaBase {
  kind: 'movie';
  /** Link ID pro Streamuj. */
  streamId?: string;
  directors: string[];
  writers: string[];
  cast: string[];
}

export interface Serial extends MediaBase {
  kind: 'serial';
  seasonCount?: number;
  episodeCount?: number;
  directors: string[];
  writers: string[];
  cast: string[];
}

export interface Episode extends MediaBase {
  kind: 'episode';
  streamId?: string;
  season: number;
  episode: number;
  /** Název epizody (bez názvu seriálu). */
  episodeTitle: string;
  /** Název seriálu, pokud ho API poslalo. */
  serialTitle?: string;
  serialId?: number;
  /** Náhled konkrétní epizody, jinak fallback na poster seriálu. */
  thumbnail?: string;
}

export type MediaItem = Movie | Serial | Episode;
export type PlayableItem = Movie | Episode;

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface SerialDetail {
  serialId: number;
  seasons: Season[];
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** API nevrací total. Heuristika: plná stránka = asi je další. */
  hasMore: boolean;
}
