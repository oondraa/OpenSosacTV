import { useSyncExternalStore } from 'react';

/** Stejná hranice jako v app.css (@media (max-width: 760px)). */
const QUERY = '(max-width: 760px)';

const mql = typeof matchMedia !== 'undefined' ? matchMedia(QUERY) : undefined;

function subscribe(cb: () => void) {
  mql?.addEventListener('change', cb);
  return () => mql?.removeEventListener('change', cb);
}

/** Telefon na výšku i na šířku do 760 px. Layout se přepíná bez reloadu. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => mql?.matches ?? false, () => false);
}
