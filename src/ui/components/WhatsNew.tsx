import { useEffect, useState } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { storage } from '../../lib/storage';
import { useRemoteKeys } from '../../app';
import { CHANGELOG, CURRENT_VERSION } from '../changelog';
import { useInitialFocus } from '../chrome';
import { Button } from './Buttons';
import { FocusGroup } from './focus';
import { LogoMark } from './Logo';

const SEEN_KEY = 'seen-version';

/**
 * Po aktualizaci jednou ukáže, co je nového. Při úplně prvním spuštění ne:
 * tam nový uživatel nemá s čím srovnávat, jen se verze zapamatuje.
 */
export function useWhatsNew(isReturning: boolean): { show: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState(() => storage.get<string>(SEEN_KEY));
  useEffect(() => {
    if (seen === undefined && !isReturning) {
      storage.set(SEEN_KEY, CURRENT_VERSION);
      setSeen(CURRENT_VERSION);
    }
  }, [seen, isReturning]);
  return {
    show: isReturning && seen !== CURRENT_VERSION,
    dismiss: () => {
      storage.set(SEEN_KEY, CURRENT_VERSION);
      setSeen(CURRENT_VERSION);
    },
  };
}

/** Vydání, která uživatel ještě neviděl (od poslední viděné verze). */
function unseenReleases() {
  const seen = storage.get<string>(SEEN_KEY);
  const i = CHANGELOG.findIndex((r) => r.version === seen);
  return CHANGELOG.slice(0, i === -1 ? 1 : Math.max(1, i));
}

export function WhatsNew({ onClose }: { onClose: () => void }) {
  const [releases] = useState(unseenReleases);
  useInitialFocus(['whatsnew-ok']);
  useRemoteKeys((key) => {
    if (key === 'back') {
      onClose();
      return true;
    }
  });

  return (
    <div className="whatsnew" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">
      <div className="whatsnew__panel bezel">
        <FocusGroup className="bezel__core" focusKey="whatsnew" trap={['up', 'down', 'left', 'right']}>
          <LogoMark size={56} className="whatsnew__mark" />
          <span className="eyebrow">Aktualizace · verze {CURRENT_VERSION}</span>
          <h1 id="whatsnew-title" className="display display--md">
            Co je nového
          </h1>
          <ol className="whatsnew__list">
            {releases.flatMap((r) => r.items).map((item, i) => (
              <li key={item.title} style={{ animationDelay: `${300 + i * 90}ms` }}>
                <b>{item.title}</b>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
          <div className="detail__actions">
            <Button variant="primary" focusKey="whatsnew-ok" label="Pokračovat" icon={<ArrowRightIcon weight="bold" />} onPress={onClose} />
          </div>
        </FocusGroup>
      </div>
    </div>
  );
}
