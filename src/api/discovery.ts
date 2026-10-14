import { DEFAULT_SOSAC_DOMAIN, DEFAULT_STREAMING_PROVIDER, SETTINGS_URL } from './config';
import { requestJson } from './http';
import type { RawSettings } from './raw';
import { storage } from '../lib/storage';

export interface ServiceSettings {
  /** Doména katalogového API, např. kodi-api.sosac.to. */
  sosacDomain: string;
  /** Doména Streamuj, např. www.streamuj.tv. */
  streamingProvider: string;
  /** Aktuální téma, např. {en: "Christmas movies", cs: "Vánoční filmy"}. */
  currentTopic?: { en: string; cs: string };
  news?: string;
  fetchedAt: number;
}

const CACHE_KEY = 'service-settings';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const FALLBACK_SETTINGS: ServiceSettings = {
  sosacDomain: DEFAULT_SOSAC_DOMAIN,
  streamingProvider: DEFAULT_STREAMING_PROVIDER,
  fetchedAt: 0,
};

/** Doména musí být holý hostname. Chrání před podvrženým settings (např. "evil.com/x?"). */
function isHostname(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v);
}

export function parseSettings(raw: RawSettings, now = Date.now()): ServiceSettings {
  let currentTopic: ServiceSettings['currentTopic'];
  if (raw.current_topic) {
    const parts = raw.current_topic.split('|');
    currentTopic = { en: parts[0] ?? '', cs: parts[parts.length - 1] ?? '' };
  }
  return {
    sosacDomain: isHostname(raw.domain) ? raw.domain : DEFAULT_SOSAC_DOMAIN,
    streamingProvider: isHostname(raw.streaming_provider) ? raw.streaming_provider : DEFAULT_STREAMING_PROVIDER,
    currentTopic,
    news: raw.news || undefined,
    fetchedAt: now,
  };
}

/**
 * Zjistí aktuální domény. Kodi plugin zkouší i mirrory (tv.sosac.ph, sosac.eu…),
 * ty ale vrací redirect a nemají CORS, takže v prohlížeči nemají smysl.
 * Při chybě se použije cache nebo výchozí hodnoty.
 */
export async function discoverSettings(opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<ServiceSettings> {
  const cached = storage.get<ServiceSettings>(CACHE_KEY);
  if (!opts.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  try {
    const raw = await requestJson<RawSettings>(SETTINGS_URL, { signal: opts.signal, timeoutMs: 10_000 });
    const settings = parseSettings(raw);
    storage.set(CACHE_KEY, settings);
    return settings;
  } catch (err) {
    if (cached) return cached;
    console.warn('[discovery] settings nedostupné, používám výchozí domény', err);
    return FALLBACK_SETTINGS;
  }
}
