import type { InputHTMLAttributes } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { UseFocusableResult } from '@noriginmedia/norigin-spatial-navigation';
import { scrollToFocus } from './focus';

interface FocusInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onFocus'> {
  focusKey?: string;
  onSubmit?: () => void;
}

/**
 * Textové pole ovladatelné šipkami. Fokus ze spatial navigation dá DOM fokus
 * na <input>, takže TV prohlížeč otevře systémovou klávesnici.
 * Šipky vlevo/vpravo nechává kurzoru v textu, nahoru/dolů opouští pole.
 */
export function FocusInput({ focusKey, onSubmit, className = '', ...rest }: FocusInputProps) {
  const { ref, focused, focusSelf }: UseFocusableResult<HTMLInputElement> = useFocusable<object, HTMLInputElement>({
    focusKey,
    onEnterPress: () => {
      ref.current?.focus();
      onSubmit?.();
    },
    onArrowPress: (dir: string): boolean => {
      const el: HTMLInputElement | null = ref.current;
      if (!el || (dir !== 'left' && dir !== 'right')) return true;
      // Uvnitř textu se kurzor hýbe normálně, ven jen z okraje.
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd = el.selectionStart === el.value.length;
      return (dir === 'left' && atStart) || (dir === 'right' && atEnd);
    },
    onFocus: (layout, _p, details) => scrollToFocus(layout.node, 'nearest', details),
  });

  return (
    <input
      ref={ref}
      className={`input ${className} ${focused ? 'is-focused' : ''}`}
      onMouseDown={() => focusSelf()}
      {...rest}
    />
  );
}
