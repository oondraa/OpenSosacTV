import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useProfileInitial } from '../../app';
import { navigate } from '../router';
import type { Route } from '../router';
import { FocusGroup, Pressable } from './focus';
import { Logo } from './Logo';

const TABS: Array<{ route: Route; label: string }> = [
  { route: { name: 'home' }, label: 'Domů' },
  { route: { name: 'movies' }, label: 'Filmy' },
  { route: { name: 'serials' }, label: 'Seriály' },
  { route: { name: 'my' }, label: 'Můj seznam' },
];

/**
 * Plovoucí skleněný ostrov nahoře. Když je fokus hluboko v obsahu,
 * schová se a vrátí se, jakmile se fokus přesune nahoru.
 */
export function NavBar({ route, tucked }: { route: Route; tucked: boolean }) {
  const initial = useProfileInitial();
  const go = (r: Route) => navigate(r, { replace: true });

  return (
    <>
    <a className={`brand ${tucked ? 'is-tucked' : ''}`} href="#/" aria-label="OpenSosacTV, domů">
      <Logo size={34} />
    </a>
    <FocusGroup as="nav" focusKey="nav" className={`nav ${tucked ? 'is-tucked' : ''}`} preferredChild={`nav-${route.name}`}>
      <Pressable
        className={`nav__item nav__item--icon ${route.name === 'search' ? 'is-active' : ''}`}
        focusKey="nav-search"
        ariaLabel="Hledat"
        onPress={() => go({ name: 'search' })}
        scroll="none"
      >
        <MagnifyingGlassIcon weight="light" />
      </Pressable>
      {TABS.map((t) => (
        <Pressable
          key={t.label}
          className={`nav__item ${route.name === t.route.name ? 'is-active' : ''}`}
          focusKey={`nav-${t.route.name}`}
          onPress={() => go(t.route)}
          scroll="none"
        >
          {t.label}
        </Pressable>
      ))}
      <Pressable
        className={`nav__item nav__item--icon ${route.name === 'profile' ? 'is-active' : ''}`}
        focusKey="nav-profile"
        ariaLabel="Profil"
        onPress={() => go({ name: 'profile' })}
        scroll="none"
      >
        <span className="nav__avatar">{initial}</span>
      </Pressable>
    </FocusGroup>
    </>
  );
}
