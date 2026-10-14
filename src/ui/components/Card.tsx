import { memo, useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react';
import type { MediaItem } from '../../api';
import { formatEpisodeCode } from '../../api';
import { cardSubline, qualityLabel } from '../format';
import { Pressable } from './focus';

export function FadeImg({ src, alt = '', className }: { src?: string; alt?: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${className ?? ''} ${loaded ? 'is-loaded' : ''}`}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

export interface CardProps {
  item: MediaItem;
  layout: 'poster' | 'wide';
  onPress: (item: MediaItem) => void;
  onFocus?: (item: MediaItem) => void;
  focusKey?: string;
  queued?: boolean;
  /** Popisek pod kartou při fokusu. V mřížce ano, v řadách na home ne. */
  showBelow?: boolean;
  scroll?: 'row' | 'nearest';
  /** Na stránce seriálu: místo názvu seriálu ukázat název epizody. */
  inSerial?: boolean;
}

/** Obrázek pro širokou kartu: náhled epizody, jinak fanart, jinak plakát. */
function wideImage(item: MediaItem) {
  if (item.kind === 'episode') return item.thumbnail ?? item.backdrop ?? item.poster;
  return item.backdrop ?? item.poster;
}

export const Card = memo(function Card({ item, layout, onPress, onFocus, focusKey, queued, showBelow, scroll = 'row', inSerial }: CardProps) {
  const img = layout === 'wide' ? wideImage(item) : item.poster;
  const progress = item.watch.finished ? 0 : item.watch.progress;
  const q = qualityLabel(item.quality);

  return (
    <Pressable
      className={`card card--${layout}`}
      focusKey={focusKey}
      scroll={scroll}
      tilt
      ariaLabel={item.title}
      onPress={() => onPress(item)}
      onFocus={() => onFocus?.(item)}
    >
      <div className="card__frame">
        <FadeImg src={img} />
        {!img && <div className="card__fallback">{item.kind === 'episode' ? item.serialTitle ?? item.title : item.title}</div>}
        {layout === 'wide' && (
          <>
            <div className="card__shade" />
            <div className="card__caption">
              <div className="card__kicker">
                {item.kind !== 'episode'
                  ? item.year
                  : inSerial
                    ? `Epizoda ${item.episode}${item.duration ? ` · ${Math.round(item.duration / 60)} min` : ''}`
                    : `${formatEpisodeCode(item.season, item.episode)} · ${item.episodeTitle}`}
              </div>
              <div className="card__name">
                {item.kind !== 'episode' ? item.title : inSerial ? item.episodeTitle : item.serialTitle ?? item.episodeTitle}
              </div>
            </div>
          </>
        )}
        {layout === 'poster' && q && (q === '4K' || q === 'Full HD') && (
          <span className="tag card__badge">{q}</span>
        )}
        {queued && (
          <span className="card__check" aria-label="Ve frontě">
            <CheckIcon weight="bold" />
          </span>
        )}
        {progress > 0.01 && (
          <div className="card__progress">
            <i style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
        )}
      </div>
      {showBelow && (
        <div className="card__below">
          <b>{item.title}</b>
          <span>{cardSubline(item)}</span>
        </div>
      )}
    </Pressable>
  );
});

export function CardSkeleton({ layout }: { layout: 'poster' | 'wide' }) {
  return (
    <div className={`card card--${layout}`} aria-hidden>
      <div className="card__frame skeleton" />
    </div>
  );
}
