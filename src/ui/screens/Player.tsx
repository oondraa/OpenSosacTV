import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CheckIcon,
  CornersOutIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  SubtitlesIcon,
  WaveformIcon,
} from '@phosphor-icons/react';
import { pause as pauseNav, resume as resumeNav, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEpisode, useMovie, usePlaybackSource, useRemoteKeys, useSerial, useVideoPlayer } from '../../app';
import { formatEpisodeCode, STREAM_QUALITY_HEIGHT } from '../../api';
import type { Episode, PlayableItem, StreamVariant } from '../../api';
import { Button } from '../components/Buttons';
import { FocusGroup, Pressable } from '../components/focus';
import { formatClock } from '../format';
import { isRestart, play, recallItem } from '../itemStore';
import { goBack } from '../router';

const HIDE_AFTER_MS = 4000;
const SEEK_STEP = 10;

interface Props {
  kind: 'movie' | 'episode';
  id: number;
  serialId?: number;
}

export function Player({ kind, id, serialId }: Props) {
  const movie = useMovie(kind === 'movie' ? id : undefined, kind === 'movie' ? recallItem('movie', id) : undefined);
  const episode = useEpisode(kind === 'episode' ? id : undefined, kind === 'episode' ? recallItem('episode', id) : undefined);
  const item: PlayableItem | undefined = kind === 'movie' ? movie.data : episode.data;
  const sid = serialId ?? (item?.kind === 'episode' ? item.serialId : undefined);
  const serial = useSerial(sid, sid ? recallItem('serial', sid) : undefined);

  // Položku "zmrazíme" při prvním načtení: refetch detailu nesmí restartovat stream.
  const [frozen, setFrozen] = useState<PlayableItem>();
  useEffect(() => {
    if (item && (!frozen || frozen.id !== item.id || frozen.kind !== item.kind)) setFrozen(item);
  }, [item, frozen]);

  const prepared = usePlaybackSource(frozen);
  const restart = frozen ? isRestart(frozen.kind, frozen.id) : false;
  const source = useMemo(() => (prepared.data && restart ? { ...prepared.data, resumeAt: 0 } : prepared.data), [prepared.data, restart]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const onPlayNext = useCallback(
    (ep: Episode) => {
      const s = serial.serial;
      play({ ...ep, serialId: ep.serialId ?? s?.id, serialTitle: ep.serialTitle ?? s?.title }, { replace: true });
    },
    [serial.serial],
  );
  const p = useVideoPlayer(videoRef, source, { serialDetail: serial.detail, onPlayNext, autoplayNext: true });

  /* ------------- Viditelnost ovládání ------------- */
  const [visible, setVisible] = useState(true);
  const [sheet, setSheet] = useState<'audio' | 'subs' | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const poke = useCallback(() => {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setVisible(false);
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    if (sheet || !p.state.playing) {
      clearTimeout(hideTimer.current);
      setVisible(true);
    } else poke();
  }, [sheet, p.state.playing, poke]);

  // Když je ovládání schované, šipky ovládají přehrávání, ne fokus.
  useEffect(() => {
    if (visible) {
      resumeNav();
      if (!sheet) void setFocus('player-toggle');
    } else pauseNav();
    return () => resumeNav();
  }, [visible, sheet]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const showNext = p.showNextEpisode && p.nextEpisode;

  useRemoteKeys((key) => {
    if (key === 'back') {
      if (sheet) setSheet(null);
      else goBack();
      return true;
    }
    if (key === 'playPause' || key === 'play' || key === 'pause') {
      if (key === 'play') p.controls.play();
      else if (key === 'pause') p.controls.pause();
      else p.controls.toggle();
      poke();
      return true;
    }
    if (key === 'rewind') return (p.controls.seekBy(-SEEK_STEP * 3), poke(), true);
    if (key === 'fastForward') return (p.controls.seekBy(SEEK_STEP * 3), poke(), true);
    if (visible) {
      poke();
      return false; // šipky a OK řeší spatial navigation
    }
    // Schované ovládání
    switch (key) {
      case 'left':
        p.controls.seekBy(-SEEK_STEP);
        poke();
        return true;
      case 'right':
        p.controls.seekBy(SEEK_STEP);
        poke();
        return true;
      case 'select':
        if (showNext) p.controls.playNext();
        else poke();
        return true;
      default:
        poke();
        return true;
    }
  });

  /* ------------- Popisky ------------- */
  const title = frozen?.kind === 'episode' ? frozen.serialTitle ?? serial.serial?.title ?? frozen.title : frozen?.title;
  const subtitle =
    frozen?.kind === 'episode' ? `${formatEpisodeCode(frozen.season, frozen.episode)} · ${frozen.episodeTitle}` : frozen?.year ? String(frozen.year) : undefined;

  const [toast, setToast] = useState<string>();
  useEffect(() => {
    if (!p.warning) return;
    setToast(p.warning);
    const t = setTimeout(() => setToast(undefined), 9000);
    return () => clearTimeout(t);
  }, [p.warning]);

  const error = (prepared.error as Error | null)?.message ?? p.state.error;
  const loading = !error && (!source || p.state.buffering);

  return (
    <div className="player" onMouseMove={poke} onClick={poke}>
      <video ref={videoRef} playsInline preload="auto">
        {p.subtitleUrl && <track key={p.subtitleUrl} kind="subtitles" src={p.subtitleUrl} default label={p.activeSubtitle?.label} />}
      </video>

      {loading && (
        <div className="player__center">
          <div className="spinner" />
        </div>
      )}

      {error && (
        <div className="center" style={{ position: 'absolute', inset: 0 }}>
          <div style={{ display: 'grid', gap: '1.25rem', justifyItems: 'center', textAlign: 'center' }}>
            <h2 className="display display--md">Přehrávání selhalo</h2>
            <p className="lede">{error}</p>
            <FocusGroup focusKey="player-error" className="detail__actions">
              <Button variant="primary" focusKey="player-retry" label="Zkusit znovu" icon={<ArrowClockwiseIcon weight="bold" />} onPress={() => void prepared.refetch()} />
              <Button label="Zpět" onPress={goBack} />
            </FocusGroup>
          </div>
        </div>
      )}

      {!error && (
        <div className={`player__chrome ${visible ? '' : 'is-hidden'}`}>
          <div className="player__top">
            <div className="player__title">
              <b>{title}</b>
              {subtitle && <span>{subtitle}</span>}
            </div>
            {p.source && (
              <span className="tag">
                {p.source.variant.language} · {p.source.variant.quality}
              </span>
            )}
          </div>

          <FocusGroup className="player__bottom" focusKey="player-bottom" preferredChild="player-toggle">
            <Scrubber position={p.state.position} duration={p.state.duration} buffered={p.state.bufferedAhead} onSeekBy={(d) => (p.controls.seekBy(d), poke())} onSeek={p.controls.seek} />
            <div className="player__controls">
              <Button ariaLabel="Zpět" icon={<CaretLeftIcon weight="bold" />} onPress={goBack} />
              <Button ariaLabel="O 10 s zpět" icon={<ArrowCounterClockwiseIcon weight="bold" />} onPress={() => p.controls.seekBy(-SEEK_STEP)} />
              <Button
                variant="primary"
                focusKey="player-toggle"
                ariaLabel={p.state.playing ? 'Pauza' : 'Přehrát'}
                icon={p.state.playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
                onPress={p.controls.toggle}
              />
              <Button ariaLabel="O 10 s vpřed" icon={<ArrowClockwiseIcon weight="bold" />} onPress={() => p.controls.seekBy(SEEK_STEP)} />
              <span className="player__spacer" />
              {p.variants.length > 1 && <Button label="Zvuk a kvalita" icon={<WaveformIcon weight="bold" />} onPress={() => setSheet('audio')} />}
              {p.subtitles.length > 0 && <Button label="Titulky" icon={<SubtitlesIcon weight="bold" />} onPress={() => setSheet('subs')} />}
              {p.nextEpisode && <Button label="Další díl" icon={<SkipForwardIcon weight="fill" />} onPress={p.controls.playNext} />}
              <Button ariaLabel="Celá obrazovka" icon={<CornersOutIcon weight="bold" />} onPress={toggleFullscreen} />
            </div>
          </FocusGroup>
        </div>
      )}

      {showNext && p.nextEpisode && !sheet && (
        <NextEpisodeCard episode={p.nextEpisode} remaining={Math.max(0, p.state.duration - p.state.position)} onPlay={p.controls.playNext} />
      )}

      {sheet && (
        <FocusGroup className="sheet no-scrollbar" focusKey="player-sheet" trap={['up', 'down', 'left', 'right']}>
          {sheet === 'audio' ? (
            <VariantList variants={p.variants} active={p.source?.variant} onPick={(v) => (void p.controls.selectVariant(v), setSheet(null))} />
          ) : (
            <>
              <h3>Titulky</h3>
              <SheetRow focusKey="sheet-first" label="Vypnuté" active={!p.activeSubtitle} onPress={() => (p.controls.selectSubtitle(undefined), setSheet(null))} />
              {p.subtitles.map((s) => (
                <SheetRow key={s.url} label={`${s.label}`} hint={s.language} active={p.activeSubtitle?.url === s.url} onPress={() => (p.controls.selectSubtitle(s), setSheet(null))} />
              ))}
            </>
          )}
        </FocusGroup>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

function Scrubber({ position, duration, buffered, onSeekBy, onSeek }: { position: number; duration: number; buffered: number; onSeekBy: (d: number) => void; onSeek: (t: number) => void }) {
  const { ref, focused, focusSelf } = useFocusable<object, HTMLDivElement>({
    focusKey: 'player-scrub',
    onArrowPress: (dir) => {
      if (dir === 'left') return (onSeekBy(-SEEK_STEP), false);
      if (dir === 'right') return (onSeekBy(SEEK_STEP), false);
      return true;
    },
  });
  const pct = duration ? (position / duration) * 100 : 0;
  const buf = duration ? ((position + buffered) / duration) * 100 : 0;
  return (
    <div>
      <div
        ref={ref}
        className={`scrub ${focused ? 'is-focused' : ''}`}
        onMouseEnter={() => focusSelf()}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * duration);
        }}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-label="Pozice"
      >
        <div className="scrub__rail">
          <div className="scrub__buffer" style={{ width: `${Math.min(100, buf)}%` }} />
          <div className="scrub__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="scrub__knob" style={{ left: `${pct}%` }} />
      </div>
      <div className="scrub__times">
        <span>{formatClock(position)}</span>
        <span>−{formatClock(Math.max(0, duration - position))}</span>
      </div>
    </div>
  );
}

function SheetRow({ label, hint, active, onPress, focusKey }: { label: string; hint?: string; active?: boolean; onPress: () => void; focusKey?: string }) {
  return (
    <Pressable className="setting" focusKey={focusKey} onPress={onPress} scroll="center">
      <span>{label}</span>
      <span>
        {hint}
        {active && <CheckIcon weight="bold" />}
      </span>
    </Pressable>
  );
}

function VariantList({ variants, active, onPick }: { variants: StreamVariant[]; active?: StreamVariant; onPick: (v: StreamVariant) => void }) {
  const byLang = useMemo(() => {
    const m = new Map<string, StreamVariant[]>();
    for (const v of variants) m.set(v.language, [...(m.get(v.language) ?? []), v]);
    for (const list of m.values()) list.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    return [...m.entries()];
  }, [variants]);

  useEffect(() => {
    void setFocus('sheet-active');
  }, []);

  return (
    <>
      {byLang.map(([lang, list]) => (
        <div key={lang} style={{ display: 'contents' }}>
          <h3>{lang}</h3>
          {list.map((v) => {
            const isActive = v.language === active?.language && v.quality === active?.quality;
            return (
              <SheetRow
                key={v.resolveUrl}
                focusKey={isActive ? 'sheet-active' : undefined}
                label={qualityName(v.quality)}
                hint={STREAM_QUALITY_HEIGHT[v.quality as keyof typeof STREAM_QUALITY_HEIGHT] ? `${STREAM_QUALITY_HEIGHT[v.quality as keyof typeof STREAM_QUALITY_HEIGHT]}p` : undefined}
                active={isActive}
                onPress={() => onPick(v)}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

function qualityName(q: string) {
  return ({ UHD: '4K Ultra HD', FHD: 'Full HD', HD: 'HD', SD: 'SD' } as Record<string, string>)[q] ?? q;
}

function NextEpisodeCard({ episode, remaining, onPlay }: { episode: Episode; remaining: number; onPlay: () => void }) {
  const lead = 20;
  const pct = Math.min(100, Math.max(0, ((lead - remaining) / lead) * 100));
  return (
    <div className="next-card bezel">
      <div className="bezel__core">
        <span className="eyebrow">Další díl</span>
        <div className="next-card__thumb">
          {episode.thumbnail && <img src={episode.thumbnail} alt="" />}
          <div className="next-card__ring">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div>
          <div className="card__kicker">{formatEpisodeCode(episode.season, episode.episode)}</div>
          <div className="card__name">{episode.episodeTitle}</div>
        </div>
        <FocusGroup focusKey="next-card">
          <Button variant="primary" focusKey="next-play" label="Přehrát hned" icon={<PlayIcon weight="fill" />} onPress={onPlay} />
        </FocusGroup>
      </div>
    </div>
  );
}
