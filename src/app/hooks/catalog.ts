import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type {
  AdvancedSearch,
  BrowseFilter,
  Episode,
  EpisodeListType,
  MediaItem,
  Movie,
  MovieListType,
  Page,
  Serial,
  SerialListType,
} from '../../api';
import { findContinueEpisode } from '../../api';
import { useServices } from '../ServicesProvider';
import { useProfiles } from '../ProfilesProvider';
import { isQueuedFor } from '../../lib/profiles';

/** Klíče pro React Query, aby šly cíleně invalidovat. */
export const qk = {
  all: ['sosac'] as const,
  list: (kind: string, type: string, extra?: unknown) => ['sosac', 'list', kind, type, extra] as const,
  movie: (id: number) => ['sosac', 'movie', id] as const,
  episode: (id: number) => ['sosac', 'episode', id] as const,
  serial: (id: number) => ['sosac', 'serial', id] as const,
  serialEpisodes: (id: number) => ['sosac', 'serial-episodes', id] as const,
  queue: (kind: 'movie' | 'serial') => ['sosac', 'queue-ids', kind] as const,
  search: (kind: string, q: string) => ['sosac', 'search', kind, q] as const,
};

/** Spojí stránky nekonečného seznamu do jednoho pole. */
export function flattenPages<T>(data: InfiniteData<Page<T>> | undefined): T[] {
  return data?.pages.flatMap((p) => p.items) ?? [];
}

function nextPage<T>(last: Page<T>): number | undefined {
  return last.hasMore ? last.page + 1 : undefined;
}

/* ---------------- Seznamy ---------------- */

export function useMovieList(type: MovieListType, opts: { enabled?: boolean } = {}) {
  const { clients, ready } = useServices();
  return useInfiniteQuery({
    queryKey: qk.list('movie', type),
    queryFn: ({ pageParam, signal }) => clients.sosac.movieList(type, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: ready && (opts.enabled ?? true),
  });
}

export function useSerialList(type: SerialListType, opts: { enabled?: boolean } = {}) {
  const { clients, ready } = useServices();
  return useInfiniteQuery({
    queryKey: qk.list('serial', type),
    queryFn: ({ pageParam, signal }) => clients.sosac.serialList(type, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: ready && (opts.enabled ?? true),
  });
}

export function useEpisodeList(type: EpisodeListType, opts: { enabled?: boolean } = {}) {
  const { clients, ready } = useServices();
  return useInfiniteQuery({
    queryKey: qk.list('episode', type),
    queryFn: ({ pageParam, signal }) => clients.sosac.episodeList(type, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: ready && (opts.enabled ?? true),
  });
}

/** TV tracker: epizody vydané v rozmezí (ISO data). */
export function useEpisodesByDate(from: string, to: string) {
  const { clients, ready } = useServices();
  return useInfiniteQuery({
    queryKey: qk.list('episode', 'by-date', { from, to }),
    queryFn: ({ pageParam, signal }) => clients.sosac.episodesByDate(from, to, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: ready,
  });
}

/** Procházení podle písmene, roku, žánru nebo kvality (kvalita jen u filmů). */
export function useBrowse(kind: 'movie' | 'serial', filter: BrowseFilter, opts: { enabled?: boolean } = {}) {
  const { clients, ready } = useServices();
  return useInfiniteQuery<Page<Movie | Serial>>({
    queryKey: qk.list(kind, filter.by, filter),
    queryFn: ({ pageParam, signal }) => {
      const page = pageParam as number;
      if (kind === 'movie') return clients.sosac.movieBrowse(filter, page, signal);
      if (filter.by === 'by-quality') throw new Error('Seriály nejde filtrovat podle kvality');
      return clients.sosac.serialBrowse(filter, page, signal);
    },
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: ready && (opts.enabled ?? true),
  });
}

/* ---------------- Hledání ---------------- */

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Hledá filmy i seriály najednou. Dotaz kratší než 2 znaky se neposílá. */
export function useSearch(query: string) {
  const { clients, ready } = useServices();
  const q = useDebounced(query.trim());
  const enabled = ready && q.length >= 2;
  const movies = useQuery({
    queryKey: qk.search('movie', q),
    queryFn: ({ signal }) => clients.sosac.movieSearch(q, 1, signal),
    enabled,
  });
  const serials = useQuery({
    queryKey: qk.search('serial', q),
    queryFn: ({ signal }) => clients.sosac.serialSearch(q, 1, signal),
    enabled,
  });
  return {
    query: q,
    movies: movies.data?.items ?? [],
    serials: serials.data?.items ?? [],
    isLoading: enabled && (movies.isLoading || serials.isLoading),
    error: movies.error ?? serials.error,
  };
}

export function useAdvancedSearch(kind: 'movie' | 'serial', search: AdvancedSearch) {
  const { clients, ready } = useServices();
  return useInfiniteQuery({
    queryKey: qk.list(kind, 'advanced-search', search),
    queryFn: ({ pageParam, signal }) =>
      kind === 'movie'
        ? clients.sosac.movieAdvancedSearch(search, pageParam, signal)
        : clients.sosac.serialAdvancedSearch(search, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last: Page<Movie | Serial>) => nextPage(last),
    enabled: ready,
  });
}

/* ---------------- Detaily ---------------- */

export function useMovie(id: number | undefined, initial?: Movie) {
  const { clients, ready } = useServices();
  return useQuery({
    queryKey: qk.movie(id ?? -1),
    queryFn: ({ signal }) => clients.sosac.movie(id!, signal),
    enabled: ready && id !== undefined,
    initialData: initial,
    // Data ze seznamu jsou použitelná hned, ale detail pak stejně dotáhneme.
    initialDataUpdatedAt: initial ? 0 : undefined,
  });
}

export function useEpisode(id: number | undefined, initial?: Episode) {
  const { clients, ready } = useServices();
  return useQuery({
    queryKey: qk.episode(id ?? -1),
    queryFn: ({ signal }) => clients.sosac.episode(id!, signal),
    enabled: ready && id !== undefined,
    initialData: initial,
    initialDataUpdatedAt: initial ? 0 : undefined,
  });
}

/**
 * Detail seriálu. Když UI seriál zná ze seznamu (`initial`), stáhne jen epizody.
 * Jinak (přímý odkaz) dotáhne i metadata přes `serialOverview`.
 */
export function useSerial(id: number | undefined, initial?: Serial) {
  const { clients, ready } = useServices();
  const overview = useQuery({
    queryKey: qk.serial(id ?? -1),
    queryFn: async ({ signal }) => {
      if (initial) {
        const detail = await clients.sosac.serialEpisodes(id!, initial.title, signal);
        return { serial: initial, detail };
      }
      return clients.sosac.serialOverview(id!, signal);
    },
    enabled: ready && id !== undefined,
  });
  const detail = overview.data?.detail;
  return {
    ...overview,
    serial: overview.data?.serial ?? initial,
    seasons: detail?.seasons ?? [],
    detail,
    continueEpisode: detail ? findContinueEpisode(detail) : undefined,
  };
}

/* ---------------- Fronta ---------------- */

/** ID ve frontě "Chci vidět" celého účtu na Sosáči, bez ohledu na profil. */
export function useQueueIds(kind: 'movie' | 'serial') {
  const { clients, ready, isLoggedIn } = useServices();
  return useQuery({
    queryKey: qk.queue(kind),
    queryFn: ({ signal }) => clients.sosac.queueIds(kind, signal),
    enabled: ready && isLoggedIn,
    staleTime: 60_000,
  });
}

/** ID ve frontě, které patří aktivnímu profilu (jeho vlastní a společné). */
export function useMyQueueIds(kind: 'movie' | 'serial'): Set<number> | undefined {
  const server = useQueueIds(kind).data;
  const { state } = useProfiles();
  return useMemo(() => {
    if (!server) return undefined;
    return new Set([...server].filter((id) => isQueuedFor(state, state.activeId, kind, id)));
  }, [server, state, kind]);
}

/**
 * Přepínání "Chci vidět" pro aktivní profil. Štítek profilu se změní hned,
 * na server jde zápis jen, když položka do fronty přibude nebo ji už nikdo nechce.
 */
export function useToggleQueue() {
  const { clients } = useServices();
  const profiles = useProfiles();
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: ({ item, add }: { item: Movie | Serial; add: boolean; rollback: () => void }) => clients.sosac.setQueued(item.kind, item.id, add),
    onError: (_err, { rollback }) => rollback(),
    onSettled: (_d, _e, { item }) => {
      void qc.invalidateQueries({ queryKey: qk.list(item.kind, 'queue') });
    },
  });

  const toggle = useCallback(
    (item: Movie | Serial, queued: boolean) => {
      const key = qk.queue(item.kind);
      const prev = qc.getQueryData<Set<number>>(key);
      const prevProfiles = profiles.state;
      const server = profiles.setOwner(item.kind, item.id, queued, prev?.has(item.id) ?? false);
      if (server === 'none') return;
      void qc.cancelQueries({ queryKey: key });
      const next = new Set(prev);
      if (server === 'add') next.add(item.id);
      else next.delete(item.id);
      qc.setQueryData(key, next);
      mutate({
        item,
        add: server === 'add',
        rollback: () => {
          qc.setQueryData(key, prev);
          profiles.restore(prevProfiles);
        },
      });
    },
    [qc, profiles, mutate],
  );

  return { toggle, isPending };
}

/* ---------------- Home ---------------- */

interface HomeRowBase {
  id: string;
  title: string;
  requiresLogin?: boolean;
  /** Široké karty (fanart/náhled) pro "pokračovat" a epizody, jinak plakáty. */
  layout: 'poster' | 'wide';
  /** Co udělá výběr karty: rovnou přehrát, nebo otevřít detail. */
  action: 'play' | 'detail';
}

export type HomeRowDef =
  | (HomeRowBase & { source: 'movie'; list: MovieListType })
  | (HomeRowBase & { source: 'serial'; list: SerialListType })
  | (HomeRowBase & { source: 'episode'; list: EpisodeListType });

/** Výchozí řady na úvodní obrazovce. UI je může přeskládat. */
export function useHomeRowDefs(): HomeRowDef[] {
  const { settings, isLoggedIn } = useServices();
  const rows: HomeRowDef[] = [
    { id: 'continue-movies', title: 'Pokračovat ve sledování', source: 'movie', list: 'unfinished', requiresLogin: true, layout: 'wide', action: 'play' },
    { id: 'continue-serials', title: 'Rozkoukané seriály', source: 'serial', list: 'unfinished', requiresLogin: true, layout: 'wide', action: 'detail' },
    { id: 'new-episodes', title: 'Nové epizody', source: 'episode', list: 'last-added', layout: 'wide', action: 'play' },
    { id: 'queue-movies', title: 'Chci vidět', source: 'movie', list: 'queue', requiresLogin: true, layout: 'poster', action: 'detail' },
    { id: 'news-dubbing', title: 'Novinky s dabingem', source: 'movie', list: 'news-with-dubbing', layout: 'poster', action: 'detail' },
    { id: 'popular-movies', title: 'Populární filmy', source: 'movie', list: 'popular', layout: 'poster', action: 'detail' },
    { id: 'popular-serials', title: 'Populární seriály', source: 'serial', list: 'popular', layout: 'poster', action: 'detail' },
    { id: 'top-movies', title: 'Nejlépe hodnocené', source: 'movie', list: 'top-rated', layout: 'poster', action: 'detail' },
    { id: 'last-added', title: 'Naposledy přidané', source: 'movie', list: 'last-added', layout: 'poster', action: 'detail' },
  ];
  if (settings.currentTopic?.cs) {
    rows.splice(4, 0, { id: 'current-topic', title: settings.currentTopic.cs, source: 'movie', list: 'current-topic', layout: 'poster', action: 'detail' });
  }
  return rows.filter((r) => !r.requiresLogin || isLoggedIn);
}

/** Data jedné řady. Vrací první stránku a umí načíst další (pro horizontální scroll). */
export function useHomeRow(row: HomeRowDef) {
  const { clients, ready } = useServices();
  return useInfiniteQuery<Page<MediaItem>>({
    queryKey: qk.list(row.source, row.list),
    queryFn: ({ pageParam, signal }) => {
      const page = pageParam as number;
      switch (row.source) {
        case 'movie':
          return clients.sosac.movieList(row.list, page, signal);
        case 'serial':
          return clients.sosac.serialList(row.list, page, signal);
        case 'episode':
          return clients.sosac.episodeList(row.list, page, signal);
      }
    },
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled: ready,
  });
}
