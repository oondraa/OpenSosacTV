import type { PlayableItem } from './models';
import type { SosacClient } from './sosac';

export interface ProgressReporterOptions {
  /** Jak často ukládat během přehrávání. */
  intervalMs?: number;
  /** Minimální posun, aby se vyplatilo posílat. */
  minDeltaSeconds?: number;
  onError?: (err: unknown) => void;
}

/**
 * Ukládá pozici přehrávání na Sosáč (stejně jako player.py v Kodi).
 *
 * - během přehrávání max jednou za `intervalMs`,
 * - hned při pauze, konci, skrytí stránky,
 * - posledních 60 s se ukládá jako celá délka (= dokoukáno), stejně jako plugin.
 */
export class ProgressReporter {
  private lastSentAt = 0;
  private lastSentPosition = -1;
  private inFlight: Promise<void> | null = null;
  private readonly intervalMs: number;
  private readonly minDelta: number;
  private readonly onError?: (err: unknown) => void;
  private readonly sosac: SosacClient;
  private readonly item: Pick<PlayableItem, 'kind' | 'id'>;

  constructor(sosac: SosacClient, item: Pick<PlayableItem, 'kind' | 'id'>, opts: ProgressReporterOptions = {}) {
    this.sosac = sosac;
    this.item = item;
    this.intervalMs = opts.intervalMs ?? 30_000;
    this.minDelta = opts.minDeltaSeconds ?? 5;
    this.onError = opts.onError;
  }

  /** Volat z `timeupdate`. Odešle jen, když uplynul interval. */
  tick(position: number, duration: number): void {
    if (Date.now() - this.lastSentAt < this.intervalMs) return;
    void this.flush(position, duration);
  }

  /** Okamžité uložení (pauza, konec, zavření). */
  flush(position: number, duration: number): Promise<void> {
    if (!this.sosac.isAuthenticated || !Number.isFinite(position)) return Promise.resolve();
    const seconds = normalizePosition(position, duration);
    if (Math.abs(seconds - this.lastSentPosition) < this.minDelta) return this.inFlight ?? Promise.resolve();

    this.lastSentAt = Date.now();
    this.lastSentPosition = seconds;
    const p = this.sosac
      .saveWatchingTime(this.item.kind, this.item.id, seconds)
      .catch((err) => {
        // Při chybě povolíme další pokus hned při dalším ticku.
        this.lastSentPosition = -1;
        this.lastSentAt = 0;
        this.onError?.(err);
      })
      .finally(() => {
        if (this.inFlight === p) this.inFlight = null;
      });
    this.inFlight = p;
    return p;
  }
}

export function normalizePosition(position: number, duration: number): number {
  const pos = Math.max(0, Math.floor(position));
  if (Number.isFinite(duration) && duration > 0 && pos >= duration - 60) return Math.floor(duration);
  return pos;
}
