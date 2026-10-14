import { useEffect, useRef } from 'react';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import type { MediaItem } from '../../api';
import { Card, CardSkeleton } from './Card';
import { FocusGroup } from './focus';

export interface RowProps {
  id: string;
  title: string;
  items: MediaItem[];
  layout: 'poster' | 'wide';
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onPress: (item: MediaItem) => void;
  onFocusItem?: (item: MediaItem) => void;
  /** Řada dostala fokus: rodič ji posune nahoru (vertikální "snap"). */
  onRowFocus?: (el: HTMLElement) => void;
  queuedIds?: Set<number>;
  index?: number;
}

/** Kolik karet před koncem načíst další stránku. */
const PREFETCH_AHEAD = 6;

export function Row({ id, title, items, layout, loading, hasMore, onLoadMore, onPress, onFocusItem, onRowFocus, queuedIds, index = 0 }: RowProps) {
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  // Načíst další stránku i při scrollu myší/dotykem.
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !hasMore) return;
    const onScroll = () => {
      if (el.scrollLeft + el.clientWidth > el.scrollWidth - el.clientWidth * 0.5) loadMoreRef.current?.();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore]);

  if (!loading && !items.length) return null;

  return (
    <FocusGroup as="section" focusKey={`row-${id}`} className="row row--enter" style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }} onFocusIn={onRowFocus}>
      <h2 className="section-title">{title}</h2>
      {/* Šipky jen pro myš (CSS je ukáže při najetí), ovladač je nepotřebuje. */}
      <button type="button" tabIndex={-1} className="row__arrow row__arrow--left" aria-label="Posunout doleva" onClick={() => page(trackRef.current, -1)}>
        <CaretLeftIcon weight="bold" />
      </button>
      <button type="button" tabIndex={-1} className="row__arrow row__arrow--right" aria-label="Posunout doprava" onClick={() => page(trackRef.current, 1)}>
        <CaretRightIcon weight="bold" />
      </button>
      <div className="row__track no-scrollbar" ref={trackRef}>
        {loading && !items.length
          ? Array.from({ length: layout === 'wide' ? 5 : 9 }, (_, i) => <CardSkeleton key={i} layout={layout} />)
          : items.map((item, i) => (
              <Card
                key={`${item.kind}-${item.id}`}
                item={item}
                layout={layout}
                onPress={onPress}
                queued={queuedIds?.has(item.id)}
                onFocus={(it) => {
                  onFocusItem?.(it);
                  if (hasMore && i >= items.length - PREFETCH_AHEAD) onLoadMore?.();
                }}
              />
            ))}
      </div>
    </FocusGroup>
  );
}

function page(track: HTMLElement | null, dir: 1 | -1) {
  if (!track) return;
  track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
}
