import { useSyncExternalStore } from 'react';

/**
 * Hash router. GitHub Pages neumí SPA fallback, hash funguje všude včetně TV.
 *
 *   #/                    home
 *   #/movies  #/serials   procházení
 *   #/my                  můj seznam
 *   #/search              hledání
 *   #/profile             účty a nastavení
 *   #/movie/156           detail filmu
 *   #/serial/6608         detail seriálu
 *   #/play/movie/156
 *   #/play/episode/159497?serial=6608
 */
export type Route =
  | { name: 'home' }
  | { name: 'movies' }
  | { name: 'serials' }
  | { name: 'my' }
  | { name: 'search' }
  | { name: 'profile' }
  | { name: 'movie'; id: number }
  | { name: 'serial'; id: number }
  | { name: 'play'; kind: 'movie' | 'episode'; id: number; serialId?: number };

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const id = Number(parts[1]);
  switch (parts[0]) {
    case 'movies':
    case 'serials':
    case 'my':
    case 'search':
    case 'profile':
      return { name: parts[0] };
    case 'movie':
      if (Number.isFinite(id)) return { name: 'movie', id };
      break;
    case 'serial':
      if (Number.isFinite(id)) return { name: 'serial', id };
      break;
    case 'play': {
      const pid = Number(parts[2]);
      const kind = parts[1];
      if ((kind === 'movie' || kind === 'episode') && Number.isFinite(pid)) {
        const serialId = Number(params.get('serial'));
        return { name: 'play', kind, id: pid, serialId: Number.isFinite(serialId) && serialId > 0 ? serialId : undefined };
      }
      break;
    }
  }
  return { name: 'home' };
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'movie':
    case 'serial':
      return `#/${r.name}/${r.id}`;
    case 'play':
      return `#/play/${r.kind}/${r.id}${r.serialId ? `?serial=${r.serialId}` : ''}`;
    default:
      return `#/${r.name}`;
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

let lastHash = '';
let lastRoute: Route = { name: 'home' };
function snapshot(): Route {
  if (location.hash !== lastHash) {
    lastHash = location.hash;
    lastRoute = parseRoute(lastHash);
  }
  return lastRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Kolik kroků historie patří aplikaci, aby Zpět nikdy neodešel ze stránky. */
let depth = 0;

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const hash = routeToHash(r);
  if (hash === location.hash) return;
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth++;
    location.hash = hash;
  }
}

export function goBack(): void {
  if (depth > 0) {
    depth--;
    history.back();
  } else if (location.hash && location.hash !== '#/') {
    navigate({ name: 'home' }, { replace: true });
  }
}
