const PREFIX = 'sosac:';

/**
 * localStorage s JSON a prefixem. Nikdy nehází: v privátním okně nebo na TV
 * prohlížeči s vypnutým úložištěm se chová jako prázdné.
 */
export const storage = {
  get<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* úložiště nedostupné nebo plné */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};
