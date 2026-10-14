import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProgressReporter, findNextEpisode, loadSubtitlesAsVttUrl, preparePlayback, switchVariant } from '../../api';
import type { Episode, PlayableItem, PlaybackSource, SerialDetail, StreamVariant, SubtitleTrack } from '../../api';
import { useServices } from '../ServicesProvider';
import { qk } from './catalog';

/** Kolik sekund před koncem nabídnout další epizodu. */
const NEXT_EPISODE_LEAD_S = 20;

export interface VideoState {
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  /** Načtený rozsah od aktuální pozice v sekundách. */
  bufferedAhead: number;
  error?: string;
  ended: boolean;
}

const INITIAL_STATE: VideoState = { playing: false, buffering: true, position: 0, duration: 0, bufferedAhead: 0, ended: false };

/**
 * Připraví zdroj pro přehrání. Volá Streamuj a rozbalí finální URL.
 * Nekešuje se: URL je časově omezená a navázaná na IP.
 */
export function usePlaybackSource(item: PlayableItem | undefined) {
  const { clients, preferences, ready } = useServices();
  return useQuery({
    queryKey: ['playback', item?.kind, item?.id, preferences.location, preferences.stream],
    queryFn: ({ signal }) =>
      preparePlayback(clients, item!, preferences.stream, { signal, autoSubtitles: preferences.autoSubtitles }),
    enabled: ready && !!item,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export interface UseVideoPlayerOptions {
  /** Detail seriálu, kvůli "další epizodě". */
  serialDetail?: SerialDetail;
  onPlayNext?: (episode: Episode) => void;
  /** Automaticky pustit další epizodu po skončení. */
  autoplayNext?: boolean;
}

/**
 * Napojí <video> na PlaybackSource. UI dodá jen ref na <video> a ovládání.
 *
 * Řeší: nastavení src, resume, titulky (SRT → VTT), ukládání pozice,
 * přepínání jazyka/kvality bez ztráty pozice, nabídku další epizody,
 * obnovu po vypršení URL.
 */
export function useVideoPlayer(videoRef: RefObject<HTMLVideoElement | null>, initial: PlaybackSource | undefined, opts: UseVideoPlayerOptions = {}) {
  const { clients } = useServices();
  const qc = useQueryClient();
  const [source, setSource] = useState<PlaybackSource | undefined>(initial);
  const [state, setState] = useState<VideoState>(INITIAL_STATE);
  const [subtitle, setSubtitle] = useState<SubtitleTrack | undefined>(initial?.subtitle);
  const [subtitleUrl, setSubtitleUrl] = useState<string>();
  const [progressError, setProgressError] = useState<unknown>();
  const pendingSeek = useRef<number | null>(initial?.resumeAt ?? null);
  const reporter = useRef<ProgressReporter | null>(null);
  const recovering = useRef(false);

  useEffect(() => {
    setSource(initial);
    setSubtitle(initial?.subtitle);
    pendingSeek.current = initial?.resumeAt ?? null;
    setState(INITIAL_STATE);
  }, [initial]);

  // Reporter pozice pro aktuální položku.
  useEffect(() => {
    if (!source) return;
    const r = new ProgressReporter(clients.sosac, source.item, { onError: setProgressError });
    reporter.current = r;
    return () => {
      const v = videoRef.current;
      if (v) void r.flush(v.currentTime, v.duration);
      reporter.current = null;
      // Po přehrávání se změnila pozice, seznamy "rozkoukané" je třeba načíst znovu.
      void qc.invalidateQueries({ queryKey: ['sosac', 'list'] });
      void qc.invalidateQueries({ queryKey: source.item.kind === 'movie' ? qk.movie(source.item.id) : qk.episode(source.item.id) });
    };
  }, [source?.item, clients.sosac, qc, videoRef]);

  // Nastavení src. Pozice se aplikuje až po loadedmetadata.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !source) return;
    if (v.src !== source.url) {
      v.src = source.url;
      v.load();
      void v.play().catch(() => {
        /* autoplay může být blokovaný, UI ukáže tlačítko Play */
      });
    }
  }, [source?.url, videoRef]);

  // Titulky: stáhnout, převést na VTT, vytvořit blob URL.
  useEffect(() => {
    if (!subtitle) {
      setSubtitleUrl(undefined);
      return;
    }
    const ctrl = new AbortController();
    let created: string | undefined;
    loadSubtitlesAsVttUrl(subtitle.url, ctrl.signal)
      .then((url) => {
        created = url;
        setSubtitleUrl(url);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) console.warn('[player] titulky se nepodařilo načíst', err);
      });
    return () => {
      ctrl.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [subtitle]);

  // Události <video>.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const sync = (patch: Partial<VideoState> = {}) =>
      setState((s) => ({
        ...s,
        position: v.currentTime,
        duration: Number.isFinite(v.duration) ? v.duration : s.duration,
        bufferedAhead: bufferedAhead(v),
        ...patch,
      }));

    const onLoaded = () => {
      if (pendingSeek.current !== null && pendingSeek.current > 0) {
        v.currentTime = pendingSeek.current;
      }
      pendingSeek.current = null;
      sync({ buffering: false, error: undefined });
    };
    const onTime = () => {
      sync();
      reporter.current?.tick(v.currentTime, v.duration);
    };
    const onPlay = () => sync({ playing: true, ended: false });
    const onPause = () => {
      sync({ playing: false });
      void reporter.current?.flush(v.currentTime, v.duration);
    };
    const onWaiting = () => sync({ buffering: true });
    const onPlaying = () => sync({ buffering: false, playing: true });
    const onEnded = () => {
      sync({ playing: false, ended: true });
      void reporter.current?.flush(v.duration, v.duration);
    };
    const onError = () => {
      // Nejčastější příčina: vypršela platnost URL (dlouhá pauza) nebo se změnila IP.
      // Zkusíme jednou znovu rozbalit odkaz a pokračovat na stejné pozici.
      if (source && !recovering.current) {
        recovering.current = true;
        pendingSeek.current = v.currentTime;
        switchVariant(clients.streamuj, source, source.variant)
          .then(setSource)
          .catch((err) => sync({ error: (err as Error).message, buffering: false }))
          .finally(() => {
            setTimeout(() => (recovering.current = false), 10_000);
          });
        return;
      }
      sync({ error: mediaErrorMessage(v.error), buffering: false });
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') void reporter.current?.flush(v.currentTime, v.duration);
    };
    const onPageHide = () => void reporter.current?.flush(v.currentTime, v.duration);

    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [videoRef, source, clients.streamuj]);

  /* ----- Další epizoda ----- */
  const nextEpisode =
    source?.item.kind === 'episode' && opts.serialDetail ? findNextEpisode(opts.serialDetail, source.item) : undefined;
  const showNextEpisode =
    !!nextEpisode && state.duration > 0 && (state.ended || state.duration - state.position <= NEXT_EPISODE_LEAD_S);

  useEffect(() => {
    if (state.ended && nextEpisode && opts.autoplayNext) opts.onPlayNext?.(nextEpisode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ended]);

  /* ----- Ovládání pro UI ----- */
  const controls = {
    play: useCallback(() => void videoRef.current?.play(), [videoRef]),
    pause: useCallback(() => videoRef.current?.pause(), [videoRef]),
    toggle: useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) void v.play();
      else v.pause();
    }, [videoRef]),
    seek: useCallback(
      (seconds: number) => {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, Math.min(seconds, v.duration || seconds));
      },
      [videoRef],
    ),
    seekBy: useCallback(
      (delta: number) => {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, Math.min(v.currentTime + delta, v.duration || Infinity));
      },
      [videoRef],
    ),
    /** Přepne jazyk/kvalitu a pokračuje na stejné pozici. */
    selectVariant: useCallback(
      async (variant: StreamVariant) => {
        if (!source) return;
        pendingSeek.current = videoRef.current?.currentTime ?? 0;
        setState((s) => ({ ...s, buffering: true }));
        setSource(await switchVariant(clients.streamuj, source, variant));
      },
      [source, clients.streamuj, videoRef],
    ),
    selectSubtitle: setSubtitle,
    playNext: useCallback(() => {
      if (nextEpisode) opts.onPlayNext?.(nextEpisode);
    }, [nextEpisode, opts.onPlayNext]),
  };

  return {
    source,
    state,
    controls,
    /** Varianty k výběru v UI. */
    variants: source?.options.variants ?? [],
    subtitles: source?.options.subtitles ?? [],
    activeSubtitle: subtitle,
    /** Dej do <track src={subtitleUrl} default kind="subtitles" />. */
    subtitleUrl,
    /** Hláška Streamuj, typicky "přehraje se jen část videa" bez VIP. */
    warning: source?.options.warning,
    nextEpisode,
    showNextEpisode,
    progressError,
  };
}

function bufferedAhead(v: HTMLVideoElement): number {
  const t = v.currentTime;
  for (let i = 0; i < v.buffered.length; i++) {
    if (v.buffered.start(i) <= t && t <= v.buffered.end(i)) return v.buffered.end(i) - t;
  }
  return 0;
}

function mediaErrorMessage(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Chyba sítě při přehrávání';
    case MediaError.MEDIA_ERR_DECODE:
      return 'Video nejde dekódovat';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Stream není dostupný (vypršel odkaz nebo se změnila IP)';
    default:
      return 'Přehrávání selhalo';
  }
}
