import { useEffect, useState } from 'react';
import { SignInIcon } from '@phosphor-icons/react';
import { flattenPages, useMovieList, useSerialList, useServices } from '../../app';
import type { MediaItem } from '../../api';
import { useStage } from '../components/Backdrop';
import { Button } from '../components/Buttons';
import { Row } from '../components/Row';
import { useChrome, useInitialFocus } from '../chrome';
import { openDetail, play } from '../itemStore';
import { navigate } from '../router';

/** Můj seznam: rozkoukané, fronta, dokoukané. Vše z účtu na Sosáči. */
export function MyList() {
  const { isLoggedIn } = useServices();
  const [focused, setFocused] = useState<MediaItem>();
  const { setTucked } = useChrome();
  useStage(focused?.backdrop, 'dim');
  useEffect(() => () => setTucked(false), [setTucked]);

  const enabled = isLoggedIn;
  const rows = [
    { id: 'my-continue', title: 'Pokračovat ve sledování', q: useMovieList('unfinished', { enabled }), layout: 'wide' as const, press: play },
    { id: 'my-serials', title: 'Rozkoukané seriály', q: useSerialList('unfinished', { enabled }), layout: 'wide' as const, press: openDetail },
    { id: 'my-queue-movies', title: 'Chci vidět · filmy', q: useMovieList('queue', { enabled }), layout: 'poster' as const, press: openDetail },
    { id: 'my-queue-serials', title: 'Chci vidět · seriály', q: useSerialList('queue', { enabled }), layout: 'poster' as const, press: openDetail },
    { id: 'my-finished', title: 'Dokoukané', q: useMovieList('finished', { enabled }), layout: 'poster' as const, press: openDetail },
  ];

  useInitialFocus(isLoggedIn ? rows.map((r) => `row-${r.id}`) : ['my-login'], [isLoggedIn, rows.some((r) => r.q.isSuccess)]);

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

  const empty = rows.every((r) => r.q.isSuccess && flattenPages(r.q.data as never).length === 0);

  return (
    <div className="screen no-scrollbar" style={{ paddingTop: '8rem' }}>
      {rows.map((r, i) => (
        <Row
          key={r.id}
          id={r.id}
          index={i}
          title={r.title}
          items={flattenPages(r.q.data as never)}
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
