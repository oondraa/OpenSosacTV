import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { FocusableComponentLayout, FocusDetails } from '@noriginmedia/norigin-spatial-navigation';
import { isPointerMode } from '../input';

export type ScrollMode = 'row' | 'nearest' | 'center' | 'none';

/**
 * Posune prvek do viditelné oblasti. Fokus přes ovladač nescrolluje sám
 * (preventScroll), takže pohyb je vždy plynulý a předvídatelný:
 *  - row: karta se zarovná na levý okraj řady,
 *  - nearest: jen pokud je mimo obraz,
 *  - center: vertikálně na střed (seznamy v panelech).
 */
export function scrollToFocus(el: Element | null | undefined, mode: ScrollMode, details?: FocusDetails) {
  if (!el || mode === 'none') return;
  // Myš a dotyk: obsah pod kurzorem neposouvat, uživatel scrolluje sám (viz input.ts).
  if (isPointerMode() || (details as { event?: Event } | undefined)?.event?.type === 'mouseenter') return;
  const behavior: ScrollBehavior = 'smooth';
  if (mode === 'row') {
    // Jen vodorovně v rámci řady. Svislou polohu řídí rodič (řada se zarovná
    // pod billboard); scrollIntoView by ji přebil "nejbližší" pozicí.
    const track = el.closest('.row__track');
    if (track instanceof HTMLElement) {
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const delta = el.getBoundingClientRect().left - track.getBoundingClientRect().left - pad;
      track.scrollBy({ left: delta, behavior });
      return;
    }
    el.scrollIntoView({ behavior, block: 'nearest', inline: 'start' });
  } else if (mode === 'center') el.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
  else el.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' });
}

export interface PressableProps {
  className?: string;
  focusedClassName?: string;
  style?: CSSProperties;
  focusKey?: string;
  onPress?: () => void;
  onFocus?: (layout: FocusableComponentLayout) => void;
  onBlur?: () => void;
  /** Vlastní šipky; vrať false, když je zpracuješ (spatial nav pak nepokračuje). */
  onArrow?: (direction: string) => boolean;
  scroll?: ScrollMode;
  disabled?: boolean;
  /** Na fokus nastaví CSS proměnné --px/--py podle kurzoru (náklon karty). */
  tilt?: boolean;
  ariaLabel?: string;
  children?: ReactNode | ((focused: boolean) => ReactNode);
}

export interface PressableHandle {
  focus(): void;
}

/**
 * Jediný interaktivní prvek UI. Funguje stejně na ovladač (šipky, OK),
 * myš (hover = fokus, klik) i dotyk.
 */
export const Pressable = forwardRef<PressableHandle, PressableProps>(function Pressable(
  { className = '', focusedClassName = 'is-focused', style, focusKey, onPress, onFocus, onBlur, onArrow, scroll = 'nearest', disabled, tilt, ariaLabel, children },
  handle,
) {
  const { ref, focused, focusSelf } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    focusable: !disabled,
    onEnterPress: () => onPress?.(),
    onArrowPress: onArrow ? (dir) => onArrow(dir) : undefined,
    onFocus: (layout, _p, details) => {
      scrollToFocus(layout.node, scroll, details);
      onFocus?.(layout);
    },
    onBlur: () => onBlur?.(),
  });

  useImperativeHandle(handle, () => ({ focus: () => focusSelf() }), [focusSelf]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!tilt) return;
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--px', String(((e.clientX - r.left) / r.width - 0.5) * 2));
      e.currentTarget.style.setProperty('--py', String(((e.clientY - r.top) / r.height - 0.5) * 2));
    },
    [tilt],
  );

  useEffect(() => {
    if (!focused && tilt && ref.current) {
      ref.current.style.removeProperty('--px');
      ref.current.style.removeProperty('--py');
    }
  }, [focused, tilt, ref]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`${className} ${focused ? focusedClassName : ''}`}
      style={style}
      onMouseEnter={(e) => {
        if (!disabled) focusSelf({ event: e.nativeEvent } as FocusDetails);
      }}
      onMouseMove={onMouseMove}
      onClick={() => {
        if (!disabled) {
          focusSelf();
          onPress?.();
        }
      }}
    >
      {typeof children === 'function' ? children(focused) : children}
    </button>
  );
});

export interface FocusGroupProps {
  focusKey?: string;
  className?: string;
  style?: CSSProperties;
  /** Pamatovat poslední fokus v rámci skupiny (řady, menu). */
  remember?: boolean;
  /** Nepustit fokus ven danými směry (panel v přehrávači). */
  trap?: Array<'up' | 'down' | 'left' | 'right'>;
  preferredChild?: string;
  onFocusIn?: (el: HTMLElement) => void;
  as?: 'div' | 'section' | 'nav';
  children: ReactNode;
}

/** Skupina fokusovatelných prvků (řada, menu, panel). */
export function FocusGroup({ focusKey, className, style, remember = true, trap, preferredChild, onFocusIn, as = 'div', children }: FocusGroupProps) {
  const { ref, focusKey: key, hasFocusedChild } = useFocusable<object, HTMLElement>({
    focusKey,
    trackChildren: true,
    saveLastFocusedChild: remember,
    isFocusBoundary: !!trap?.length,
    focusBoundaryDirections: trap,
    preferredChildFocusKey: preferredChild,
  });

  useEffect(() => {
    // Rodiče tu posouvají obsah (řada pod billboard), to chceme jen u ovladače.
    if (hasFocusedChild && ref.current && !isPointerMode()) onFocusIn?.(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFocusedChild]);

  const Tag = as;
  return (
    <FocusContext.Provider value={key}>
      <Tag ref={ref as React.RefObject<never>} className={className} style={style} data-focus-within={hasFocusedChild || undefined}>
        {children}
      </Tag>
    </FocusContext.Provider>
  );
}
