import type { ReactNode } from 'react';
import { Pressable } from './focus';

interface ButtonProps {
  label?: string;
  icon?: ReactNode;
  variant?: 'primary' | 'glass';
  onPress: () => void;
  focusKey?: string;
  /** 0–1, tenký průběh v tlačítku (Pokračovat). */
  progress?: number;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Pilulka s ikonou ve vlastním kruhu ("tlačítko v tlačítku").
 * Bez labelu = kulaté ikonové tlačítko.
 */
export function Button({ label, icon, variant = 'glass', onPress, focusKey, progress, ariaLabel, disabled }: ButtonProps) {
  const iconOnly = !label;
  return (
    <Pressable
      className={`btn btn--${variant} ${iconOnly ? 'btn--icon-only' : ''} ${!icon && label ? 'btn--plain' : ''}`}
      focusKey={focusKey}
      onPress={onPress}
      ariaLabel={ariaLabel ?? label}
      disabled={disabled}
    >
      {iconOnly ? (
        icon
      ) : (
        <>
          <span>{label}</span>
          {icon && <span className="btn__orb">{icon}</span>}
          {progress !== undefined && progress > 0 && (
            <span className="btn__progress">
              <i style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, focusKey }: { label: string; selected?: boolean; onPress: () => void; focusKey?: string }) {
  return (
    <Pressable className={`chip ${selected ? 'is-selected' : ''}`} focusKey={focusKey} onPress={onPress} scroll="nearest">
      {label}
    </Pressable>
  );
}
