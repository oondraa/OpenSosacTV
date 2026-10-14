import { FilmSlateIcon, HouseIcon, MagnifyingGlassIcon, StackIcon, TelevisionSimpleIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { navigate } from '../router';
import type { Route } from '../router';

const TABS: Array<{ route: Route; label: string; icon: (active: boolean) => ReactNode }> = [
  { route: { name: 'home' }, label: 'Domů', icon: (a) => <HouseIcon weight={a ? 'fill' : 'light'} /> },
  { route: { name: 'movies' }, label: 'Filmy', icon: (a) => <FilmSlateIcon weight={a ? 'fill' : 'light'} /> },
  { route: { name: 'serials' }, label: 'Seriály', icon: (a) => <TelevisionSimpleIcon weight={a ? 'fill' : 'light'} /> },
  { route: { name: 'search' }, label: 'Hledat', icon: (a) => <MagnifyingGlassIcon weight={a ? 'bold' : 'light'} /> },
  { route: { name: 'my' }, label: 'Moje', icon: (a) => <StackIcon weight={a ? 'fill' : 'light'} /> },
];

/**
 * Spodní lišta pro telefon (iOS / Android styl). Na velkých obrazovkách
 * se místo ní ukazuje plovoucí NavBar nahoře.
 */
export function TabBar({ route }: { route: Route }) {
  // Detail a profil patří k záložce, ze které se na ně přišlo; zvýrazní se Domů.
  const active = TABS.some((t) => t.route.name === route.name) ? route.name : route.name === 'profile' ? 'my' : 'home';
  return (
    <nav className="tabbar" aria-label="Hlavní navigace">
      {TABS.map((t) => {
        const on = active === t.route.name;
        return (
          <button
            key={t.label}
            type="button"
            className={`tabbar__item ${on ? 'is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => navigate(t.route, { replace: true })}
          >
            {t.icon(on)}
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
