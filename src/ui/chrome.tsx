import { createContext, useContext, useEffect } from 'react';
import { doesFocusableExist, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { isPointerMode } from './input';

/** Sdílený stav "rámu" aplikace: schovaná navigace. */
export const ChromeContext = createContext<{ setTucked(v: boolean): void }>({ setTucked: () => {} });

export function useChrome() {
  return useContext(ChromeContext);
}

/**
 * Po zobrazení obrazovky dá fokus prvnímu existujícímu klíči.
 * Zkouší opakovaně, protože obsah se často dorenderuje až po načtení dat.
 */
export function useInitialFocus(keys: string[], deps: unknown[] = []) {
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      // Myš a dotyk fokus nepotřebují, na telefonu by se jen zvětšila první karta.
      if (isPointerMode()) return;
      const key = keys.find((k) => doesFocusableExist(k));
      if (key) {
        void setFocus(key);
        return;
      }
      if (++tries < 40) timer = setTimeout(attempt, 75);
    };
    attempt();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
