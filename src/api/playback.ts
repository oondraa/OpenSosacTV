import type { Episode, PlayableItem, SerialDetail } from './models';
import type { SosacClient } from './sosac';
import { pickVariant } from './streamuj';
import type { StreamOptions, StreamPreferences, StreamVariant, StreamujClient, SubtitleTrack } from './streamuj';

export interface PlaybackSource {
  item: PlayableItem;
  options: StreamOptions;
  variant: StreamVariant;
  /** Finální URL MP4, platí jen pro tuto IP a omezenou dobu. */
  url: string;
  /** Doporučené titulky (UI je může nabídnout nebo rovnou zapnout). */
  subtitle?: SubtitleTrack;
  /** Odkud pokračovat v sekundách, 0 = od začátku. */
  resumeAt: number;
}

export class PlaybackError extends Error {
  readonly reason: 'no-stream-id' | 'no-variants' | 'resolve-failed';
  constructor(reason: PlaybackError['reason'], message: string) {
    super(message);
    this.name = 'PlaybackError';
    this.reason = reason;
  }
}

/** Neresumovat, když zbývá méně než 60 s nebo je zhlédnuto méně než 10 s. */
export function resumePosition(item: PlayableItem): number {
  const pos = item.watch.position ?? 0;
  const dur = item.duration ?? 0;
  if (pos < 10) return 0;
  if (dur && pos > dur - 60) return 0;
  return pos;
}

/** Vybere titulky: jen když audio není v prvním preferovaném jazyce. */
export function pickSubtitle(options: StreamOptions, variant: StreamVariant, prefs: StreamPreferences): SubtitleTrack | undefined {
  const primary = prefs.languages[0]?.toUpperCase();
  if (!primary || variant.language === primary) return undefined;
  const forVariant = options.subtitles.filter((s) => s.language === variant.language);
  const pool = forVariant.length ? forVariant : options.subtitles;
  const wanted = primary.toLowerCase();
  return pool.find((s) => s.label.toLowerCase().includes(wanted) || s.label.toLowerCase().startsWith('cz')) ?? pool[0];
}

/**
 * Připraví přehrávání: link ID → varianty → výběr → finální URL.
 * Všechny requesty jdou z prohlížeče, takže IP sedí (viz report).
 */
export async function preparePlayback(
  clients: { sosac: SosacClient; streamuj: StreamujClient },
  item: PlayableItem,
  prefs: StreamPreferences,
  opts: { refresh?: boolean; signal?: AbortSignal; autoSubtitles?: boolean } = {},
): Promise<PlaybackSource> {
  // Čerstvá data kvůli aktuální pozici `w` (mohla se změnit na jiném zařízení).
  let fresh: PlayableItem = item;
  if (opts.refresh !== false && clients.sosac.isAuthenticated) {
    try {
      fresh = item.kind === 'movie' ? await clients.sosac.movie(item.id, opts.signal) : await clients.sosac.episode(item.id, opts.signal);
    } catch {
      fresh = item;
    }
  }

  const streamId = fresh.streamId ?? item.streamId;
  if (!streamId) throw new PlaybackError('no-stream-id', 'Titul nemá přiřazený stream');

  const options = await clients.streamuj.getStreamOptions(streamId, opts.signal);
  const variant = pickVariant(options.variants, prefs);
  if (!variant) throw new PlaybackError('no-variants', options.warning ?? 'Žádný dostupný stream');

  const url = await resolveOrThrow(clients.streamuj, variant, opts.signal);
  return {
    item: fresh,
    options,
    variant,
    url,
    subtitle: opts.autoSubtitles === false ? undefined : pickSubtitle(options, variant, prefs),
    resumeAt: resumePosition(fresh),
  };
}

/** Přepnutí jazyka nebo kvality během přehrávání. Pozici si drží UI. */
export async function switchVariant(
  streamuj: StreamujClient,
  source: PlaybackSource,
  variant: StreamVariant,
  signal?: AbortSignal,
): Promise<PlaybackSource> {
  const url = await resolveOrThrow(streamuj, variant, signal);
  return { ...source, variant, url };
}

async function resolveOrThrow(streamuj: StreamujClient, variant: StreamVariant, signal?: AbortSignal): Promise<string> {
  try {
    return await streamuj.resolveVideoUrl(variant, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new PlaybackError('resolve-failed', `Nepodařilo se získat adresu videa: ${(err as Error).message}`);
  }
}

/** Další epizoda v pořadí, přes hranici série. */
export function findNextEpisode(detail: SerialDetail, current: Pick<Episode, 'season' | 'episode'>): Episode | undefined {
  const all = detail.seasons.flatMap((s) => s.episodes);
  const idx = all.findIndex((e) => e.season === current.season && e.episode === current.episode);
  return idx >= 0 ? all[idx + 1] : undefined;
}

/** První rozkoukaná (nebo první nezhlédnutá) epizoda, pro tlačítko "Pokračovat". */
export function findContinueEpisode(detail: SerialDetail): Episode | undefined {
  const all = detail.seasons.flatMap((s) => s.episodes);
  const inProgress = all.find((e) => (e.watch.position ?? 0) > 0 && !e.watch.finished);
  if (inProgress) return inProgress;
  const lastFinished = all.map((e) => e.watch.finished).lastIndexOf(true);
  return all[lastFinished + 1] ?? all[0];
}
