import { useId } from 'react';

/**
 * Značka OpenSosacTV: otevřený kruh ("Open") s Play uprostřed.
 * Stejná geometrie jako public/icon.svg a splash v index.html.
 */
export function LogoMark({ size = 32, className }: { size?: number | string; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`logo-mark ${className ?? ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset="0.5" stopColor="#ff5a36" />
          <stop offset="1" stopColor="#e0245e" />
        </linearGradient>
      </defs>
      {/* Animace jen na obalových <g>; atribut rotate() na kruhu zůstává nedotčený. */}
      <g className="logo-mark__spin">
        <circle
          cx="32"
          cy="32"
          r="22"
          fill="none"
          stroke={`url(#lg-${id})`}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="117 21"
          transform="rotate(-50 32 32)"
        />
      </g>
      <g className="logo-mark__play">
        <path d="M27.5 22.75 L41.25 32 L27.5 41.25 Z" fill="#fff" stroke="#fff" strokeWidth="2.75" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Nápis "OpenSosacTV": Open tence, Sosac tučně, TV jako štítek s přechodem. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark ${className ?? ''}`} aria-label="OpenSosacTV">
      <span className="wordmark__open">Open</span>
      <span className="wordmark__name">Sosac</span>
      <span className="wordmark__tv">TV</span>
    </span>
  );
}

export function Logo({ size = 32, className }: { size?: number | string; className?: string }) {
  return (
    <span className={`logo ${className ?? ''}`}>
      <LogoMark size={size} />
      <Wordmark />
    </span>
  );
}
