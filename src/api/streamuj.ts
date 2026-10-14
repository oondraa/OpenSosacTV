import { CLIENT_VERSION, STREAM_QUALITIES, STREAM_QUALITY_HEIGHT } from './config';
import type { StreamQuality } from './config';
import { ApiError, buildUrl, requestJson, requestText } from './http';
import type { RawStreamujCheckUser, RawStreamujLinks } from './raw';

export interface StreamujCredentials {
  username: string;
  /** md5(heslo). */
  passwordHash: string;
}

/** Server Streamuj (parametr `location`). Kodi nabízí 1 a 2. */
export type StreamLocation = 1 | 2;

export interface StreamujAccount {
  valid: boolean;
  userId: number;
  /** Konec VIP, undefined = bez VIP. */
  vipUntil?: Date;
  message?: string;
}

export interface StreamVariant {
  /** Jazyk podle Streamuj, velkými písmeny: CZ, SK, EN… */
  language: string;
  quality: StreamQuality | string;
  /** Výška obrazu, pokud kvalitu známe. */
  height?: number;
  /**
   * URL "kroku 2". Ještě to není video: GET vrátí text s finální adresou.
   * Platí jen pro IP, ze které přišel požadavek, proto se rozbaluje až těsně
   * před přehráním a vždy z prohlížeče.
   */
  resolveUrl: string;
}

export interface SubtitleTrack {
  language: string;
  label: string;
  url: string;
}

export interface StreamOptions {
  variants: StreamVariant[];
  subtitles: SubtitleTrack[];
  /**
   * Hláška Streamuj. Bez platného VIP přijde i s odkazy, např. "Přehraje se
   * pouze část videa." UI ji musí ukázat, jinak uživatel nepochopí, proč
   * film skončí po pár minutách.
   */
  warning?: string;
}

export class StreamujClient {
  readonly provider: string;
  private readonly credentials: StreamujCredentials | null;
  private readonly location: StreamLocation;

  constructor(opts: { provider: string; credentials?: StreamujCredentials | null; location?: StreamLocation }) {
    this.provider = opts.provider;
    this.credentials = opts.credentials ?? null;
    this.location = opts.location ?? 1;
  }

  private apiUrl(params: Record<string, string | number | undefined>): string {
    return buildUrl(`https://${this.provider}/`, 'json_api_player.php', params);
  }

  async checkUser(signal?: AbortSignal): Promise<StreamujAccount> {
    if (!this.credentials) return { valid: false, userId: 0, message: 'Chybí účet Streamuj' };
    const raw = await requestJson<RawStreamujCheckUser>(
      this.apiUrl({
        action: 'check-user',
        login: this.credentials.username,
        password: this.credentials.passwordHash,
        passwordinmd5: 1,
      }),
      { signal },
    );
    const vipUntil = raw.expiration > 0 ? new Date(raw.expiration * 1000) : undefined;
    return {
      valid: raw.result === 1 && raw.UID > 0,
      userId: raw.UID,
      vipUntil,
      message: typeof raw.errormessage === 'string' && raw.errormessage ? raw.errormessage : undefined,
    };
  }

  /** Krok 1: dostupné jazyky, kvality a titulky pro link ID z katalogu. */
  async getStreamOptions(streamId: string, signal?: AbortSignal): Promise<StreamOptions> {
    const raw = await requestJson<RawStreamujLinks>(
      this.apiUrl({
        action: 'get-video-links',
        d: CLIENT_VERSION,
        link: streamId,
        login: this.credentials?.username,
        password: this.credentials?.passwordHash,
        location: this.location,
      }),
      { signal },
    );
    return parseStreamOptions(raw);
  }

  /**
   * Krok 2: finální URL videa (https://sNN.streamuj.tv/vid/<hash>/<čas>/<id>_hd.mp4).
   * Volat až těsně před přehráním a nikdy přes proxy, kvůli vazbě na IP.
   */
  async resolveVideoUrl(variant: StreamVariant, signal?: AbortSignal): Promise<string> {
    const text = await requestText(variant.resolveUrl, { signal });
    if (!/^https?:\/\//i.test(text)) {
      throw new ApiError('parse', `Streamuj nevrátil adresu videa: ${text.slice(0, 160)}`);
    }
    return text;
  }
}

export function parseStreamOptions(raw: RawStreamujLinks): StreamOptions {
  const variants: StreamVariant[] = [];
  const subtitles: SubtitleTrack[] = [];

  for (const [language, entries] of Object.entries(raw.URL ?? {})) {
    for (const [key, value] of Object.entries(entries ?? {})) {
      if (key === 'subtitles') {
        if (value && typeof value === 'object') {
          for (const [label, url] of Object.entries(value)) {
            if (typeof url === 'string') subtitles.push({ language, label, url });
          }
        }
        continue;
      }
      if (typeof value !== 'string' || !value) continue;
      variants.push({
        language,
        quality: key,
        height: STREAM_QUALITY_HEIGHT[key as StreamQuality],
        resolveUrl: value,
      });
    }
  }

  const message = typeof raw.errormessage === 'string' && raw.errormessage ? raw.errormessage : undefined;
  if (!variants.length && !message) {
    return { variants, subtitles, warning: 'Pro tento titul nejsou dostupné žádné streamy.' };
  }
  return { variants, subtitles, warning: message };
}

export interface StreamPreferences {
  /** Jazyky podle priority, velkými písmeny. */
  languages: string[];
  /** Preferovaná kvalita. Když chybí, bere se nejbližší horší, pak lepší. */
  quality: StreamQuality;
}

export const DEFAULT_STREAM_PREFERENCES: StreamPreferences = {
  languages: ['CZ', 'SK', 'EN'],
  quality: 'FHD',
};

/**
 * Automatický výběr streamu. Stejná logika jako `resolve_auto` v Kodi pluginu:
 * jazyky podle priority, v rámci jazyka přesná kvalita, pak nejbližší horší.
 * Navíc oproti pluginu: když horší není, vezme nejbližší lepší.
 */
export function pickVariant(variants: StreamVariant[], prefs: StreamPreferences = DEFAULT_STREAM_PREFERENCES): StreamVariant | undefined {
  if (!variants.length) return undefined;
  const target = STREAM_QUALITIES.indexOf(prefs.quality);

  const rank = (q: string) => {
    const i = STREAM_QUALITIES.indexOf(q as StreamQuality);
    if (i === -1) return 1000; // neznámá kvalita až nakonec
    // Přesná shoda 0, horší 1..n, lepší až za nimi.
    return i >= target ? i - target : 100 + (target - i);
  };

  const languages = [...prefs.languages.map((l) => l.toUpperCase())];
  for (const v of variants) if (!languages.includes(v.language)) languages.push(v.language);

  for (const lang of languages) {
    const candidates = variants.filter((v) => v.language === lang);
    if (!candidates.length) continue;
    return [...candidates].sort((a, b) => rank(a.quality) - rank(b.quality))[0];
  }
  return variants[0];
}
