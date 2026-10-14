import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Variant = 'hero' | 'full' | 'dim';

interface StageApi {
  set(src: string | undefined, variant?: Variant): void;
}

const StageContext = createContext<StageApi>({ set: () => {} });

/**
 * Pozadí přes celou obrazovku. Dvě vrstvy obrázku se prolínají, takže při
 * přechodu mezi tituly nikdy neprobleskne černá. Obrázek pomalu dojíždí
 * z mírného zvětšení (Ken Burns), jen přes transform.
 */
export function StageProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const [variant, setVariant] = useState<Variant>('hero');
  const current = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const api = useRef<StageApi>({
    set(src, v = 'hero') {
      setVariant(v);
      if (src === current.current) return;
      current.current = src;
      // Při rychlém projíždění řady neměnit pozadí u každé karty.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!src) {
          setLayers([undefined, undefined]);
          return;
        }
        const img = new Image();
        img.src = src;
        const swap = () => {
          // Mezitím mohl přijít novější obrázek, starší už nezobrazovat.
          if (current.current !== src) return;
          const next = frontRef.current === 0 ? 1 : 0;
          frontRef.current = next;
          setLayers((l) => {
            const copy: [string | undefined, string | undefined] = [l[0], l[1]];
            copy[next] = src;
            return copy;
          });
          setFront(next);
        };
        if (img.complete) swap();
        else img.decode().then(swap, swap);
      }, 260);
    },
  }).current;

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <StageContext.Provider value={api}>
      <div className={`stage stage--${variant}`} aria-hidden>
        {layers.map((src, i) => (src ? <StageImg key={`${i}-${src}`} src={src} active={i === front} /> : null))}
        <div className="stage__shade" />
      </div>
      {children}
    </StageContext.Provider>
  );
}

/** Vrstva se zapne až snímek po připojení, aby proběhl přechod opacity i zoomu. */
function StageImg({ src, active }: { src: string; active: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return <img className={`stage__img ${mounted && active ? 'is-on' : ''}`} src={src} alt="" />;
}

/** Nastaví pozadí, dokud je komponenta připojená. */
export function useStage(src: string | undefined, variant: Variant = 'hero') {
  const stage = useContext(StageContext);
  useEffect(() => {
    stage.set(src, variant);
  }, [stage, src, variant]);
  return stage;
}
