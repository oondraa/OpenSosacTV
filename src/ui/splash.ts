/**
 * Úvodní obrazovka z index.html. Schová se, až je aplikace připravená,
 * ale ne dřív, než doběhne animace loga (~1,5 s od načtení stránky),
 * aby neproblikla napůl.
 */
const MIN_VISIBLE_MS = 1500;

let hidden = false;

export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  setTimeout(() => {
    el.classList.add('is-done');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // Pojistka, kdyby transitionend nepřišel (reduced motion, skrytý tab).
    setTimeout(() => el.remove(), 1200);
  }, wait);
}
