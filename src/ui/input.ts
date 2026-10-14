/**
 * Čím uživatel zrovna ovládá aplikaci.
 *
 *  - keys: ovladač TV nebo klávesnice. Fokus řídí spatial navigation a obsah
 *    se posouvá za fokusem (řada se zarovná, karta vyjede do obrazu).
 *  - pointer: myš nebo dotyk. Obsah se nikdy neposouvá sám, jinak by najetí
 *    myší na kartu posunulo řadu, pod kurzor by přijela další karta a řada by
 *    "ujížděla". Uživatel scrolluje sám (kolečko, šipky u řad, swipe).
 *
 * Stav je i na <html data-input="…"> kvůli CSS (šipky u řad jen pro myš).
 */
export type InputMode = 'keys' | 'pointer';

let mode: InputMode =
  typeof matchMedia !== 'undefined' && matchMedia('(hover: none), (pointer: coarse)').matches ? 'pointer' : 'keys';

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'GoBack', 'BrowserBack']);

function set(next: InputMode) {
  if (next === mode) return;
  mode = next;
  document.documentElement.dataset.input = next;
}

export function initInputModeTracking(): void {
  document.documentElement.dataset.input = mode;
  window.addEventListener(
    'pointermove',
    (e) => {
      // Některé TV prohlížeče posílají falešné pohyby s nulovým posunem.
      if (e.movementX !== 0 || e.movementY !== 0) set('pointer');
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', () => set('pointer'), { passive: true });
  window.addEventListener('wheel', () => set('pointer'), { passive: true });
  window.addEventListener(
    'keydown',
    (e) => {
      if (NAV_KEYS.has(e.key) || e.keyCode === 10009 || e.keyCode === 461) set('keys');
    },
    { capture: true },
  );
}

export function isPointerMode(): boolean {
  return mode === 'pointer';
}
