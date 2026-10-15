import { useEffect, useState } from 'react';
import { flattenPages, useBrowse, useMovieList, useMyQueueIds, useSerialList } from '../../app';
import { GENRES } from '../../api';
import type { Genre, MediaItem } from '../../api';
import { useStage } from '../components/Backdrop';
import { Chip } from '../components/Buttons';
import { Card, CardSkeleton } from '../components/Card';
import { FocusGroup } from '../components/focus';
import { useChrome, useInitialFocus } from '../chrome';
import { openDetail } from '../itemStore';

export const GENRE_LABELS: Record<Genre, string> = {
  action: 'Akční', adventure: 'Dobrodružné', animation: 'Animované', biography: 'Životopisné',
  cartoons: 'Kreslené', comedy: 'Komedie', crime: 'Krimi', disaster: 'Katastrofické',
  documentary: 'Dokumenty', drama: 'Drama', erotic: 'Erotické', experimental: 'Experimentální',
  fairytales: 'Pohádky', family: 'Rodinné', fantasy: 'Fantasy', history: 'Historické',
  horror: 'Horory', imax: 'IMAX', krimi: 'Kriminálky', music: 'Hudební', mystery: 'Mysteriózní',
  psychological: 'Psychologické', publicistic: 'Publicistika', realitytv: 'Reality TV',
  romance: 'Romantické', 'sci-fi': 'Sci-fi', sport: 'Sportovní', talkshow: 'Talk show',
  thriller: 'Thrillery', war: 'Válečné', western: 'Westerny',
};

/** Nejčastější žánry dopředu, zbytek za nimi. */
const GENRE_ORDER: Genre[] = [
  'action', 'comedy', 'drama', 'thriller', 'sci-fi', 'crime', 'horror', 'animation', 'family',
  'fantasy', 'romance', 'documentary', 'adventure', 'war', 'history',
  ...GENRES.filter((g) => !['action', 'comedy', 'drama', 'thriller', 'sci-fi', 'crime', 'horror', 'animation', 'family', 'fantasy', 'romance', 'documentary', 'adventure', 'war', 'history', 'erotic'].includes(g)),
];

type Filter = 'popular' | 'top-rated' | 'last-added' | Genre;

const PRESETS: Array<{ id: Filter; label: string }> = [
  { id: 'popular', label: 'Populární' },
  { id: 'top-rated', label: 'Nejlépe hodnocené' },
  { id: 'last-added', label: 'Nově přidané' },
];

/** Filmy / Seriály: chipy nahoře, mřížka plakátů pod nimi. */
export function Browse({ kind }: { kind: 'movie' | 'serial' }) {
  const [filter, setFilter] = useState<Filter>('popular');
  const [focusedItem, setFocusedItem] = useState<MediaItem>();
  const { setTucked } = useChrome();
  useStage(focusedItem?.backdrop, 'dim');
  useInitialFocus([`chip-${filter}`], [kind]);
  useEffect(() => () => setTucked(false), [setTucked]);

  const isPreset = filter === 'popular' || filter === 'top-rated' || filter === 'last-added';
  const genre = (isPreset ? 'action' : filter) as Genre;
  const presetType = isPreset ? filter : 'popular';

  const movieList = useMovieList(presetType, { enabled: kind === 'movie' && isPreset });
  const serialList = useSerialList(presetType, { enabled: kind === 'serial' && isPreset });
  const movieGenre = useBrowse('movie', { by: 'by-genre', genre }, { enabled: kind === 'movie' && !isPreset });
  const serialGenre = useBrowse('serial', { by: 'by-genre', genre }, { enabled: kind === 'serial' && !isPreset });
  const queued = useMyQueueIds(kind);

  const q = isPreset ? (kind === 'movie' ? movieList : serialList) : kind === 'movie' ? movieGenre : serialGenre;
  const items: MediaItem[] = flattenPages<MediaItem>(q.data as never);

  return (
    <div className="screen no-scrollbar" key={kind}>
      <header className="page-head">
        <h1 className="display display--md">{kind === 'movie' ? 'Filmy' : 'Seriály'}</h1>
      </header>
      <FocusGroup focusKey={`chips-${kind}`} className="chips no-scrollbar" onFocusIn={() => setTucked(false)}>
        {PRESETS.map((p) => (
          <Chip key={p.id} focusKey={`chip-${p.id}`} label={p.label} selected={filter === p.id} onPress={() => setFilter(p.id)} />
        ))}
        {GENRE_ORDER.map((g) => (
          <Chip key={g} focusKey={`chip-${g}`} label={GENRE_LABELS[g]} selected={filter === g} onPress={() => setFilter(g)} />
        ))}
      </FocusGroup>
      <FocusGroup focusKey={`grid-${kind}`} className="grid" onFocusIn={() => setTucked(true)}>
        {q.isLoading
          ? Array.from({ length: 18 }, (_, i) => <CardSkeleton key={i} layout="poster" />)
          : items.map((item, i) => (
              <Card
                key={`${item.kind}-${item.id}`}
                item={item}
                layout="poster"
                showBelow
                scroll="nearest"
                queued={queued?.has(item.id)}
                onPress={openDetail}
                onFocus={(it) => {
                  setFocusedItem(it);
                  if (q.hasNextPage && !q.isFetchingNextPage && i > items.length - 14) void q.fetchNextPage();
                }}
              />
            ))}
      </FocusGroup>
      {!q.isLoading && !items.length && <p className="empty">Nic tu není.</p>}
    </div>
  );
}
