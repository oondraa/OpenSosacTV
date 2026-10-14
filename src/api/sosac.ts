import { CLIENT_VERSION, DEFAULT_PAGE_SIZE, PERSONAL_LISTS } from './config';
import type { EpisodeListType, Genre, MovieListType, SerialListType } from './config';
import { ApiError, buildUrl, request, requestJson } from './http';
import type { Episode, Movie, Page, Serial, SerialDetail } from './models';
import { normalizeEpisode, normalizeMovie, normalizeSerial, normalizeSerialDetail } from './normalize';
import type { RawEpisode, RawMovie, RawSerial, RawSerialDetail } from './raw';

export interface SosacCredentials {
  username: string;
  /** md5(md5("user:heslo") + sůl), viz hash.ts. Čisté heslo se nikde neukládá. */
  passwordHash: string;
}

/**
 * Jak poslat tělo zápisu. Kodi posílá `application/json`, to ale v prohlížeči
 * spustí CORS preflight a ten Sosáč odmítá (OPTIONS → 404). Varianty níže jsou
 * "simple requests" bez preflightu. Která z nich server opravdu zpracuje,
 * ověří diagnostics.html.
 */
export type WriteMode = 'json-as-text' | 'form' | 'query';

export interface SosacClientOptions {
  domain: string;
  credentials?: SosacCredentials | null;
  writeMode?: WriteMode;
  pageSize?: number;
}

export type BrowseFilter =
  | { by: 'a-z'; letter: string }
  | { by: 'by-year'; year: number }
  | { by: 'by-genre'; genre: Genre }
  | { by: 'by-quality'; quality: string };

export interface AdvancedSearch {
  keyword?: string;
  yearFrom?: number;
  yearTo?: number;
  genre?: Genre;
  quality?: string;
  /** Kód země, např. "us", "cs". */
  country?: string;
  /** Kód jazyka dabingu, např. "cz", "en". */
  language?: string;
  director?: string;
  writer?: string;
  actor?: string;
  /** Raw hodnota řazení, viz ADV_SORT_MOVIES. */
  sort?: string;
}

type ListParams = Record<string, string | number | undefined>;

export class SosacClient {
  readonly domain: string;
  private readonly credentials: SosacCredentials | null;
  private readonly writeMode: WriteMode;
  private readonly pageSize: number;

  constructor(opts: SosacClientOptions) {
    this.domain = opts.domain;
    this.credentials = opts.credentials ?? null;
    this.writeMode = opts.writeMode ?? 'json-as-text';
    this.pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  get isAuthenticated(): boolean {
    return this.credentials !== null;
  }

  private get base(): string {
    return `https://${this.domain}/`;
  }

  private url(path: string, params: ListParams = {}): string {
    const auth = this.credentials
      ? { username: this.credentials.username, password: this.credentials.passwordHash }
      : {};
    return buildUrl(this.base, path, { ...params, ...auth });
  }

  private requireAuth(what: string): void {
    if (!this.credentials) throw new ApiError('unauthorized', `${what} vyžaduje přihlášení k Sosáči`);
  }

  private async page<R, T>(path: string, params: ListParams, page: number, map: (r: R) => T, signal?: AbortSignal): Promise<Page<T>> {
    const raw = await requestJson<R[] | Record<string, R>>(
      this.url(path, { ...params, pocet: this.pageSize, stranka: page }),
      { signal },
    );
    // Prázdný výsledek někdy přijde jako {} místo [].
    const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
    return {
      items: list.map(map),
      page,
      pageSize: this.pageSize,
      hasMore: list.length >= this.pageSize,
    };
  }

  /* ---------------- Filmy ---------------- */

  movieList(type: MovieListType, page = 1, signal?: AbortSignal): Promise<Page<Movie>> {
    if (PERSONAL_LISTS.has(type)) this.requireAuth(`Seznam "${type}"`);
    return this.page<RawMovie, Movie>(`movies/lists/${type}`, {}, page, normalizeMovie, signal);
  }

  movieBrowse(filter: BrowseFilter, page = 1, signal?: AbortSignal): Promise<Page<Movie>> {
    return this.page<RawMovie, Movie>(`movies/lists/${filter.by}`, browseParams(filter), page, normalizeMovie, signal);
  }

  movieSearch(query: string, page = 1, signal?: AbortSignal): Promise<Page<Movie>> {
    return this.page<RawMovie, Movie>('movies/simple-search', { q: query }, page, normalizeMovie, signal);
  }

  movieAdvancedSearch(s: AdvancedSearch, page = 1, signal?: AbortSignal): Promise<Page<Movie>> {
    return this.page<RawMovie, Movie>('movies/advanced-search', advancedParams(s), page, normalizeMovie, signal);
  }

  async movie(id: number, signal?: AbortSignal): Promise<Movie> {
    return normalizeMovie(await requestJson<RawMovie>(this.url(`movies/${id}`), { signal }));
  }

  /* ---------------- Seriály ---------------- */

  serialList(type: SerialListType, page = 1, signal?: AbortSignal): Promise<Page<Serial>> {
    if (PERSONAL_LISTS.has(type)) this.requireAuth(`Seznam "${type}"`);
    return this.page<RawSerial, Serial>(`serials/lists/${type}`, {}, page, normalizeSerial, signal);
  }

  serialBrowse(filter: Exclude<BrowseFilter, { by: 'by-quality' }>, page = 1, signal?: AbortSignal): Promise<Page<Serial>> {
    return this.page<RawSerial, Serial>(`serials/lists/${filter.by}`, browseParams(filter), page, normalizeSerial, signal);
  }

  serialSearch(query: string, page = 1, signal?: AbortSignal): Promise<Page<Serial>> {
    return this.page<RawSerial, Serial>('serials/simple-search', { q: query }, page, normalizeSerial, signal);
  }

  serialAdvancedSearch(s: AdvancedSearch, page = 1, signal?: AbortSignal): Promise<Page<Serial>> {
    return this.page<RawSerial, Serial>('serials/advanced-search', advancedParams(s), page, normalizeSerial, signal);
  }

  /** Série a epizody seriálu. `serials/<id>` vrací jen epizody, ne metadata seriálu. */
  async serialEpisodes(serialId: number, serialTitle?: string, signal?: AbortSignal): Promise<SerialDetail> {
    const raw = await requestJson<RawSerialDetail>(this.url(`serials/${serialId}`), { signal });
    return normalizeSerialDetail(serialId, raw, serialTitle);
  }

  /**
   * Metadata seriálu podle ID (pro přímé odkazy, když UI seriál nezná ze seznamu).
   * API na to endpoint nemá, ale `episodes/<id>` nese názvy, popis, žánry,
   * plakát a fanart seriálu. Stojí to dva requesty.
   */
  async serialOverview(serialId: number, signal?: AbortSignal): Promise<{ serial: Serial; detail: SerialDetail }> {
    const rawDetail = await requestJson<RawSerialDetail>(this.url(`serials/${serialId}`), { signal });
    const firstEpisodeId = Object.values(Object.values(rawDetail ?? {})[0] ?? {})[0]?._id;
    if (firstEpisodeId === undefined) throw new ApiError('http', `Seriál ${serialId} nemá žádné epizody`);

    const raw = await requestJson<RawEpisode>(this.url(`episodes/${firstEpisodeId}`), { signal });
    // Pole specifická pro epizodu zahodíme, zbytek popisuje seriál.
    const { ne: _ne, ie: _ie, s: _s, ep: _ep, id: _id, l: _l, w: _w, dl: _dl, ...serialFields } = raw;
    const serial = normalizeSerial({ ...serialFields, _id: serialId });
    return { serial, detail: normalizeSerialDetail(serialId, rawDetail, serial.title) };
  }

  /* ---------------- Epizody ---------------- */

  episodeList(type: EpisodeListType, page = 1, signal?: AbortSignal): Promise<Page<Episode>> {
    return this.page<RawEpisode, Episode>(`episodes/lists/${type}`, {}, page, (r) => normalizeEpisode(r), signal);
  }

  /** TV tracker: epizody vydané v rozmezí dat (ISO yyyy-mm-dd). */
  episodesByDate(from: string, to: string, page = 1, signal?: AbortSignal): Promise<Page<Episode>> {
    return this.page<RawEpisode, Episode>('episodes/lists/by-date', { f: from, t: to }, page, (r) => normalizeEpisode(r), signal);
  }

  async episode(id: number, signal?: AbortSignal): Promise<Episode> {
    return normalizeEpisode(await requestJson<RawEpisode>(this.url(`episodes/${id}`), { signal }));
  }

  /* ---------------- Zápisy ---------------- */

  /** Uloží pozici přehrávání v sekundách. */
  async saveWatchingTime(kind: 'movie' | 'episode', id: number, seconds: number, mode: WriteMode = this.writeMode): Promise<void> {
    this.requireAuth('Ukládání pozice');
    const media = kind === 'movie' ? 'movies' : 'episodes';
    const time = Math.max(0, Math.round(seconds));
    const path = `${media}/${id}/watching-time`;

    switch (mode) {
      case 'json-as-text':
        await request(this.url(path, { d: CLIENT_VERSION }), {
          method: 'POST',
          body: JSON.stringify({ time }),
          contentType: 'text/plain',
        });
        return;
      case 'form':
        await request(this.url(path, { d: CLIENT_VERSION }), {
          method: 'POST',
          body: new URLSearchParams({ time: String(time) }),
          contentType: 'application/x-www-form-urlencoded',
        });
        return;
      case 'query':
        await request(this.url(path, { d: CLIENT_VERSION, time }), { method: 'POST' });
        return;
    }
  }

  /** Přidá do / odebere z fronty "Chci vidět". */
  async setQueued(kind: 'movie' | 'serial', id: number, queued: boolean): Promise<void> {
    this.requireAuth('Fronta');
    const media = kind === 'movie' ? 'movies' : 'serials';
    await request(this.url(`${media}/${id}/${queued ? 'into-queue' : 'off-queue'}`), { method: 'POST' });
  }

  /** ID položek ve frontě (pro zobrazení stavu "ve frontě" na kartách). */
  async queueIds(kind: 'movie' | 'serial', signal?: AbortSignal): Promise<Set<number>> {
    const page = kind === 'movie' ? await this.movieList('queue', 1, signal) : await this.serialList('queue', 1, signal);
    return new Set(page.items.map((i) => i.id));
  }

  /** Ověří přihlášení: osobní seznam bez platného účtu vrací 401. */
  async verifyCredentials(signal?: AbortSignal): Promise<void> {
    this.requireAuth('Ověření');
    await requestJson(this.url('movies/lists/queue', { pocet: 1, stranka: 1 }), { signal });
  }
}

function browseParams(filter: BrowseFilter): ListParams {
  switch (filter.by) {
    case 'a-z':
      return { l: filter.letter.toLowerCase() };
    case 'by-year':
      return { y: filter.year };
    case 'by-genre':
      return { g: filter.genre };
    case 'by-quality':
      return { q: filter.quality };
  }
}

function advancedParams(s: AdvancedSearch): ListParams {
  const from = s.yearFrom ?? 1900;
  return {
    k: s.keyword ?? '',
    y: s.yearTo ? `${from},${s.yearTo}` : String(from),
    g: s.genre ?? '',
    q: s.quality ?? '',
    c: s.country ?? '',
    l: s.language ?? '',
    d: s.director ?? '',
    s: s.writer ?? '',
    a: s.actor ?? '',
    o: s.sort ?? '',
  };
}
