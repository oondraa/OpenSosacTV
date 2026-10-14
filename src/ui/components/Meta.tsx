import { Fragment } from 'react';
import type { MediaItem } from '../../api';
import { formatDuration, kindLabel, languageLabel, qualityLabel } from '../format';

/** Rok · délka · přístupnost · kvalita · hodnocení · jazyky */
export function MetaLine({ item, showKind = true }: { item: MediaItem; showKind?: boolean }) {
  const parts: React.ReactNode[] = [];
  if (showKind) parts.push(kindLabel(item));
  if (item.year) parts.push(item.year);
  const dur = item.kind !== 'serial' ? formatDuration(item.duration) : undefined;
  if (dur) parts.push(dur);
  if (item.ageRating) parts.push(<span className="tag tag--outline">{item.ageRating}+</span>);

  const q = qualityLabel(item.quality);
  const { csfd, imdb } = item.ratings;

  return (
    <div className="meta">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="meta__dot" />}
          <span>{p}</span>
        </Fragment>
      ))}
      {q && <span className="tag">{q}</span>}
      {csfd ? (
        <span className="score">
          {csfd} %<small>ČSFD</small>
        </span>
      ) : null}
      {imdb ? (
        <span className="score">
          {imdb.toFixed(1)}
          <small>IMDb</small>
        </span>
      ) : null}
    </div>
  );
}

export function LanguageTags({ item }: { item: MediaItem }) {
  if (!item.languages.length) return null;
  return (
    <div className="meta">
      {item.languages.map((l) => (
        <span key={l.raw} className="tag tag--outline">
          {languageLabel(l)}
        </span>
      ))}
      {item.genres.length > 0 && <span>{item.genres.slice(0, 3).join(', ')}</span>}
    </div>
  );
}
