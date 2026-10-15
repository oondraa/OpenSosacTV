import { useEffect, useState } from 'react';
import { SignInIcon } from '@phosphor-icons/react';
import { flattenPages, useMovieList, useProfiles, useSerialList, useServices } from '../../app';
import type { MediaItem, Movie, Serial } from '../../api';
import { isQueuedFor, ownersOf } from '../../lib/profiles';
import { useStage } from '../components/Backdrop';
import { Button } from '../components/Buttons';
import { Row } from '../components/Row';
import { useChrome, useInitialFocus } from '../chrome';
import { openDetail, play } from '../itemStore';
import { navigate } from '../router';

type Rows = Array<{
  id: string;
  title: string;
  items: MediaItem[];
  layout: 'wide' | 'poster';
  press: (item: MediaItem) => void;
  q: { isLoading: boolean; isSuccess: boolean; hasNextPage: boolean; fetchNextPage: () => unknown };
}>;

/**
 * Můj seznam z účtu na Sosáči. Rozkoukané a dokoukané jsou společné celému
 * účtu, "Chci vidět" se dělí podle profilů (viz lib/profiles.ts).
 */
export function MyList() {
  const { isLoggedIn } = useServices();
  const { state, profiles, active } = useProfiles();
  const [focused, setFocused] = useState<MediaItem>();
  const { setTucked } = useChrome();
  useStage(focused?.backdrop, 'dim');
  useEffect(() => () => setTucked(false), [setTucked]);

  const enabled = isLoggedIn;
  const continueMovies = useMovieList('unfinished', { enabled });
  const continueSerials = useSerialList('unfinished', { enabled });
  const queueMovies = useMovieList('queue', { enabled });
  const queueSerials = useSerialList('queue', { enabled });
  const finished = useMovieList('finished', { enabled });

  const multi = profiles.length > 1;
  const queued = [...flattenPages(queueMovies.data), ...flattenPages(queueSerials.data)];
  // Načte další stránky obou front najednou, řady profilů z nich míchají.
  const queueBoth = {
    isLoading: queueMovies.isLoading || queueSerials.isLoading,
    isSuccess: queueMovies.isSuccess && queueSerials.isSuccess,
    hasNextPage: queueMovies.hasNextPage || queueSerials.hasNextPage,
    fetchNextPage: () => {
      if (queueMovies.hasNextPage) void queueMovies.fetchNextPage();
      if (queueSerials.hasNextPage) void queueSerials.fetchNextPage();
    },
  };
  const mine = (items: Array<Movie | Serial>) => items.filter((i) => isQueuedFor(state, active.id, i.kind, i.id));

  const rows: Rows = [
    { id: 'my-continue', title: 'Pokračovat ve sledování', items: flattenPages(continueMovies.data), q: continueMovies, layout: 'wide', press: play },
    { id: 'my-serials', title: 'Rozkoukané seriály', items: flattenPages(continueSerials.data), q: continueSerials, layout: 'wide', press: openDetail },
    { id: 'my-queue-movies', title: multi ? `${active.name} chce vidět · filmy` : 'Chci vidět · filmy', items: mine(flattenPages(queueMovies.data)), q: queueMovies, layout: 'poster', press: openDetail },
    { id: 'my-queue-serials', title: multi ? `${active.name} chce vidět · seriály` : 'Chci vidět · seriály', items: mine(flattenPages(queueSerials.data)), q: queueSerials, layout: 'poster', press: openDetail },
    // Přehled, co mají v seznamu ostatní profily.
    ...profiles
      .filter((p) => p.id !== active.id)
      .map((p) => ({
        id: `my-queue-${p.id}`,
        title: `${p.name} chce vidět`,
        items: queued.filter((i) => ownersOf(state, i.kind, i.id).some((o) => o.id === p.id)),
        q: queueBoth,
        layout: 'poster' as const,
        press: openDetail,
      })),
    ...(multi
      ? [{ id: 'my-queue-shared', title: 'Společné · přidané na webu nebo jinde', items: queued.filter((i) => ownersOf(state, i.kind, i.id).length === 0), q: queueBoth, layout: 'poster' as const, press: openDetail }]
      : []),
    { id: 'my-finished', title: 'Dokoukané', items: flattenPages(finished.data), q: finished, layout: 'poster', press: openDetail },
  ];

  useInitialFocus(isLoggedIn ? rows.filter((r) => r.items.length).map((r) => `row-${r.id}`) : ['my-login'], [isLoggedIn, rows.some((r) => r.items.length)]);

  if (!isLoggedIn) {
    return (
      <div className="center">
        <div style={{ display: 'grid', gap: '1.5rem', justifyItems: 'start', maxWidth: '40rem' }}>
          <span className="eyebrow">Můj seznam</span>
          <h1 className="display display--md">Přihlas se a uvidíš, kde jsi skončil.</h1>
          <p className="lede">Rozkoukané filmy, frontu i dokoukané tituly bere aplikace z tvého účtu na Sosáči.</p>
          <Button variant="primary" focusKey="my-login" label="Přihlásit se" icon={<SignInIcon weight="bold" />} onPress={() => navigate({ name: 'profile' })} />
        </div>
      </div>
    );
  }

  const empty = rows.every((r) => r.q.isSuccess && r.items.length === 0);

  return (
    <div className="screen no-scrollbar" style={{ paddingTop: '8rem' }}>
      {rows.map((r, i) => (
        <Row
          key={r.id}
          id={r.id}
          index={i}
          title={r.title}
          items={r.items}
          layout={r.layout}
          loading={r.q.isLoading}
          hasMore={r.q.hasNextPage}
          onLoadMore={() => void r.q.fetchNextPage()}
          onPress={r.press}
          onFocusItem={setFocused}
          onRowFocus={(el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTucked(i > 0);
          }}
        />
      ))}
      {empty && <p className="empty">Zatím tu nic není. Pusť si něco a objeví se to tady.</p>}
    </div>
  );
}
