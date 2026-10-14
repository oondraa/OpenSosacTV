import { useEffect, useRef } from 'react';

export type RemoteKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'rewind'
  | 'fastForward';

/**
 * Sjednotí klávesy z různých TV platforem.
 * - Samsung Tizen: Back = 10009, media klávesy 415/19/413/412/417
 * - LG webOS: Back = 461
 * - Android TV / Google TV v Chrome: standardní `key` hodnoty
 * - Desktop: šipky, Enter, Escape/Backspace, mezerník
 */
export function normalizeKey(e: KeyboardEvent): RemoteKey | undefined {
  switch (e.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Enter':
      return 'select';
    case 'Escape':
    case 'GoBack':
    case 'BrowserBack':
      return 'back';
    case 'Backspace':
      // Backspace v inputu je mazání, ne Zpět.
      return isTextInput(e.target) ? undefined : 'back';
    case ' ':
      return isTextInput(e.target) ? undefined : 'playPause';
    case 'MediaPlayPause':
      return 'playPause';
    case 'MediaPlay':
      return 'play';
    case 'MediaPause':
      return 'pause';
    case 'MediaStop':
      return 'stop';
    case 'MediaRewind':
      return 'rewind';
    case 'MediaFastForward':
      return 'fastForward';
  }
  switch (e.keyCode) {
    case 10009: // Tizen
    case 461: // webOS
      return 'back';
    case 415:
      return 'play';
    case 19:
      return 'pause';
    case 413:
      return 'stop';
    case 412:
      return 'rewind';
    case 417:
      return 'fastForward';
    case 10252: // Tizen MediaPlayPause
      return 'playPause';
  }
  return undefined;
}

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
}

/**
 * Globální posluchač ovladače. Handler vrací `true`, když klávesu zpracoval,
 * pak se zavolá preventDefault (např. aby Back nezavřel aplikaci).
 */
export function useRemoteKeys(handler: (key: RemoteKey, e: KeyboardEvent) => boolean | void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const key = normalizeKey(e);
      if (key && ref.current(key, e) === true) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
