/**
 * Konstanty Sosáč / Streamuj API.
 *
 * Převzato z kodi-czsk/plugin.video.sosac.unofficial (GPL-2.0),
 * resources/lib/sosac_api.py a stream_api.py.
 */

/** Sůl pro hash hesla do katalogového API. */
export const AUTH_SALT = 'EWs5yVD4QF2sshGm22EWVa';

export const DEFAULT_SOSAC_DOMAIN = 'kodi-api.sosac.to';
export const DEFAULT_STREAMING_PROVIDER = 'www.streamuj.tv';

/** Discovery endpoint, vrací aktuální domény. Jako jediný má ověřený CORS. */
export const SETTINGS_URL = `https://${DEFAULT_SOSAC_DOMAIN}/settings`;

/** Verze klienta, kterou posílá Kodi plugin (`d=19`). */
export const CLIENT_VERSION = '19';

export const DEFAULT_PAGE_SIZE = 40;

/** Seznamy filmů dostupné přes `movies/lists/<typ>`. */
export const MOVIE_LISTS = [
  'queue',
  'unfinished',
  'finished',
  'news-with-dubbing',
  'news-with-subtitles',
  'last-added',
  'news-popular',
  'popular',
  'news-top-rated',
  'top-rated',
  'current-topic',
] as const;
export type MovieListType = (typeof MOVIE_LISTS)[number];

/** Seznamy seriálů přes `serials/lists/<typ>`. */
export const SERIAL_LISTS = [
  'queue',
  'unfinished',
  'finished',
  'last-added',
  'news-popular',
  'popular',
  'news-top-rated',
  'top-rated',
] as const;
export type SerialListType = (typeof SERIAL_LISTS)[number];

/** Seznamy epizod přes `episodes/lists/<typ>`. */
export const EPISODE_LISTS = ['news-with-dubbing', 'news-with-subtitles', 'last-added'] as const;
export type EpisodeListType = (typeof EPISODE_LISTS)[number];

/** Seznamy, které vyžadují přihlášení (jinak 401). */
export const PERSONAL_LISTS = new Set(['queue', 'unfinished', 'finished']);

export const GENRES = [
  'action', 'adventure', 'animation', 'biography', 'cartoons', 'comedy', 'crime',
  'disaster', 'documentary', 'drama', 'erotic', 'experimental', 'fairytales',
  'family', 'fantasy', 'history', 'horror', 'imax', 'krimi', 'music', 'mystery',
  'psychological', 'publicistic', 'realitytv', 'romance', 'sci-fi', 'sport',
  'talkshow', 'thriller', 'war', 'western',
] as const;
export type Genre = (typeof GENRES)[number];

export const QUALITIES = ['fhd', 'uhd', 'hd', 'sd', 'kinorip', 'tvrip'] as const;
export type CatalogQuality = (typeof QUALITIES)[number];

/** Kvality ve Streamuj odpovědi, od nejlepší. */
export const STREAM_QUALITIES = ['UHD', 'FHD', 'HD', 'SD'] as const;
export type StreamQuality = (typeof STREAM_QUALITIES)[number];

export const STREAM_QUALITY_HEIGHT: Record<StreamQuality, number> = {
  UHD: 2160,
  FHD: 1080,
  HD: 720,
  SD: 480,
};

/**
 * Pořadí pro `advanced-search` parametr `o`. Kodi plugin je má jen jako indexy
 * bez popisků, proto jen surové hodnoty.
 */
export const ADV_SORT_MOVIES = ['v1', '-v1', 'v2', '-v2', 'v3', '-v3', 'v4', '-v4', 'v5', '-v5', 'v6', '-v6', 'v7', '-v7', ''] as const;
