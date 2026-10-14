import { useEffect, useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useSearch } from '../../app';
import type { MediaItem } from '../../api';
import { useStage } from '../components/Backdrop';
import { FocusGroup } from '../components/focus';
import { FocusInput } from '../components/FocusInput';
import { Row } from '../components/Row';
import { useChrome, useInitialFocus } from '../chrome';
import { openDetail } from '../itemStore';

export function Search() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState<MediaItem>();
  const search = useSearch(query);
  const { setTucked } = useChrome();
  useStage(focused?.backdrop, 'dim');
  useInitialFocus(['search-input']);
  useEffect(() => () => setTucked(false), [setTucked]);

  const hasQuery = search.query.length >= 2;
  const nothing = hasQuery && !search.isLoading && !search.movies.length && !search.serials.length;

  return (
    <div className="screen no-scrollbar">
      <FocusGroup className="search-bar" focusKey="search-bar" onFocusIn={() => setTucked(false)}>
        <div style={{ position: 'relative' }}>
          <MagnifyingGlassIcon weight="light" className="search-bar__icon" />
          <FocusInput
            focusKey="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filmy, seriály…"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            style={{ width: '100%' }}
          />
        </div>
      </FocusGroup>

      {!hasQuery && <p className="empty">Napiš aspoň dvě písmena.</p>}
      {nothing && <p className="empty">Pro „{search.query}“ nic nemáme.</p>}

      {hasQuery && (
        <div style={{ paddingTop: '1.5rem' }}>
          <Row
            id="search-movies"
            title="Filmy"
            items={search.movies}
            layout="poster"
            loading={search.isLoading}
            onPress={openDetail}
            onFocusItem={setFocused}
            onRowFocus={() => setTucked(true)}
          />
          <Row
            id="search-serials"
            title="Seriály"
            index={1}
            items={search.serials}
            layout="poster"
            loading={search.isLoading}
            onPress={openDetail}
            onFocusItem={setFocused}
            onRowFocus={(el) => {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTucked(true);
            }}
          />
        </div>
      )}
    </div>
  );
}
