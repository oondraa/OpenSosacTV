import { useCallback, useEffect, useRef, useState } from 'react';
import { doesFocusableExist, getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { flattenPages, useHomeRow, useHomeRowDefs, useQueueIds } from '../../app';
import type { HomeRowDef } from '../../app';
import type { MediaItem } from '../../api';
import { formatEpisodeCode } from '../../api';
import { useStage } from '../components/Backdrop';
import { LanguageTags, MetaLine } from '../components/Meta';
import { Row } from '../components/Row';
import { useChrome } from '../chrome';
import { isPointerMode } from '../input';
import { openDetail, play } from '../itemStore';
import { useIsPhone } from '../useIsPhone';
import { navigate } from '../router';
import { useServices } from '../../app';
import { Button } from '../components/Buttons';
import { FadeImg } from '../components/Card';
import { Logo } from '../components/Logo';
import { InfoIcon, PlayIcon } from '@phosphor-icons/react';

/**
 * Home: nahoře billboard s detailem právě vybraného titulu,
 * pozadí se prolne na jeho fanart. Řady pod ním jezdí tak,
 * aby aktivní řada byla vždy hned pod billboardem.
 */
export function Home() {
  const rows = useHomeRowDefs();
  const [hero, setHero] = useState<MediaItem>();
  const rowsRef = useRef<HTMLDivElement>(null);
  const { setTucked } = useChrome();
  const queuedMovies = useQueueIds('movie').data;
  const queuedSerials = useQueueIds('serial').data;

  const phone = useIsPhone();
  // Telefon: obrázek je součástí stránky a scrolluje s ní, pevné pozadí ne.
  useStage(phone ? undefined : hero?.backdrop ?? (hero?.kind === 'episode' ? hero.thumbnail : undefined) ?? hero?.poster, 'hero');

  // Úvodní fokus: první řada, která má data. Řady bez dat (např. prázdné
  // "Pokračovat") se přeskočí.
  const status = useRef<Record<number, 'ready' | 'empty'>>({});
  const firstItems = useRef<Record<number, MediaItem | undefined>>({});
  const focused = useRef(false);
  const onRowStatus = useCallback(
    (index: number, s: 'ready' | 'empty', first?: MediaItem) => {
      status.current[index] = s;
      firstItems.current[index] = first;
      if (focused.current) return;
      for (let i = 0; i < rows.length; i++) {
        const st = status.current[i];
        if (st === undefined) return; // čekáme na řadu s vyšší prioritou
        if (st === 'ready') {
          const key = `row-${rows[i]!.id}`;
          if (!isPointerMode() && doesFocusableExist(key) && !getCurrentFocusKey()?.startsWith('nav')) {
            focused.current = true;
            void setFocus(key);
          }
          const f = firstItems.current[i];
          if (f) setHero((h) => h ?? f);
          return;
        }
      }
    },
    [rows],
  );

  const onRowFocus = useCallback(
    (el: HTMLElement, index: number) => {
      const container = rowsRef.current;
      if (container) container.scrollTo({ top: el.offsetTop - container.offsetTop, behavior: 'smooth' });
      setTucked(index > 0);
    },
    [setTucked],
  );

  useEffect(() => () => setTucked(false), [setTucked]);

  return (
    <div className="home">
      {phone ? (
        <PhoneHero item={hero} />
      ) : (
        <header className="hero">{hero && <HeroInfo key={`${hero.kind}-${hero.id}`} item={hero} />}</header>
      )}
      <div className="home__rows no-scrollbar" ref={rowsRef}>
        {rows.map((r, i) => (
          <HomeRow
            key={r.id}
            def={r}
            index={i}
            onStatus={onRowStatus}
            onFocusItem={phone ? undefined : setHero}
            onRowFocus={onRowFocus}
            queuedIds={r.source === 'serial' ? queuedSerials : queuedMovies}
          />
        ))}
      </div>
    </div>
  );
}

function HeroInfo({ item }: { item: MediaItem }) {
  const isEp = item.kind === 'episode';
  return (
    <div className="hero__swap">
      {isEp && (
        <span className="eyebrow">
          {formatEpisodeCode(item.season, item.episode)} · {item.episodeTitle}
        </span>
      )}
      <h1 className="display">{isEp ? item.serialTitle ?? item.title : item.title}</h1>
      <MetaLine item={item} showKind={!isEp} />
      <LanguageTags item={item} />
      {item.description && <p className="lede">{item.description}</p>}
    </div>
  );
}

function HomeRow({
  def,
  index,
  onStatus,
  onFocusItem,
  onRowFocus,
  queuedIds,
}: {
  def: HomeRowDef;
  index: number;
  onStatus: (index: number, s: 'ready' | 'empty', first?: MediaItem) => void;
  onFocusItem?: (item: MediaItem) => void;
  onRowFocus: (el: HTMLElement, index: number) => void;
  queuedIds?: Set<number>;
}) {
  const q = useHomeRow(def);
  const items = flattenPages(q.data);

  useEffect(() => {
    if (q.isSuccess) onStatus(index, items.length ? 'ready' : 'empty', items[0]);
    else if (q.isError) onStatus(index, 'empty');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, q.isError, items.length]);

  return (
    <Row
      id={def.id}
      index={index}
      title={def.title}
      items={items}
      layout={def.layout}
      loading={q.isLoading}
      hasMore={q.hasNextPage}
      onLoadMore={() => {
        if (!q.isFetchingNextPage) void q.fetchNextPage();
      }}
      onPress={def.action === 'play' ? play : openDetail}
      onFocusItem={onFocusItem}
      onRowFocus={(el) => onRowFocus(el, index)}
      queuedIds={queuedIds}
    />
  );
}

/** Telefon: hlavička s profilem a velký náhled doporučeného titulu. */
function PhoneHero({ item }: { item?: MediaItem }) {
  const { session } = useServices();
  const initial = session.sosac?.username?.[0]?.toUpperCase() ?? '?';
  const img = item ? item.backdrop ?? (item.kind === 'episode' ? item.thumbnail : undefined) ?? item.poster : undefined;
  const isEp = item?.kind === 'episode';
  return (
    <header className="phero">
      <div className="mtop">
        <Logo size={28} className="mtop__brand" />
        <button type="button" className="nav__avatar" aria-label="Profil" onClick={() => navigate({ name: 'profile' })}>
          {initial}
        </button>
      </div>
      <div className="phero__media">
        <FadeImg src={img} />
        <div className="phero__shade" />
      </div>
      {item && (
        <div className="phero__body" key={`${item.kind}-${item.id}`}>
          {isEp && <span className="eyebrow">{formatEpisodeCode(item.season, item.episode)} · {item.episodeTitle}</span>}
          <h1 className="display">{isEp ? item.serialTitle ?? item.title : item.title}</h1>
          <MetaLine item={item} showKind={!isEp} />
          <div className="phero__actions">
            <Button variant="primary" label="Přehrát" icon={<PlayIcon weight="fill" />} onPress={() => play(item)} />
            <Button label="Detail" icon={<InfoIcon weight="bold" />} onPress={() => openDetail(item)} />
          </div>
        </div>
      )}
    </header>
  );
}
