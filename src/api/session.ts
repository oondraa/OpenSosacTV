import { storage } from '../lib/storage';
import type { ServiceSettings } from './discovery';
import { sosacPasswordHash } from './hash';
import { ApiError } from './http';
import { SosacClient } from './sosac';
import type { SosacCredentials, WriteMode } from './sosac';
import { DEFAULT_STREAM_PREFERENCES } from './streamuj';
import type { StreamLocation, StreamPreferences } from './streamuj';

/**
 * Vše, co si klient pamatuje o uživateli. Jen hash hesla, ne čisté heslo.
 * Hash katalogu je ale fakticky ekvivalent hesla (API ho bere přímo), takže
 * zařízení musí být důvěryhodné. Tohle chování má i Kodi plugin.
 */
export interface Session {
  sosac: SosacCredentials | null;
}

export interface ClientPreferences {
  location: StreamLocation;
  writeMode: WriteMode;
  stream: StreamPreferences;
  /** Automaticky zapínat titulky, když je audio cizí. */
  autoSubtitles: boolean;
}

const SESSION_KEY = 'session';
const PREFS_KEY = 'preferences';

export const DEFAULT_PREFERENCES: ClientPreferences = {
  location: 1,
  writeMode: 'json-as-text',
  stream: DEFAULT_STREAM_PREFERENCES,
  autoSubtitles: true,
};

export const EMPTY_SESSION: Session = { sosac: null };

export function loadSession(): Session {
  // Starší verze ukládaly i účet Streamuj, ten se už nepoužívá.
  const stored = storage.get<Session>(SESSION_KEY);
  return stored?.sosac ? { sosac: stored.sosac } : EMPTY_SESSION;
}

export function saveSession(s: Session): void {
  storage.set(SESSION_KEY, s);
}

export function clearSession(): void {
  storage.remove(SESSION_KEY);
}

export function loadPreferences(): ClientPreferences {
  const stored = storage.get<Partial<ClientPreferences>>(PREFS_KEY) ?? {};
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    stream: { ...DEFAULT_PREFERENCES.stream, ...stored.stream },
  };
}

export function savePreferences(p: ClientPreferences): void {
  storage.set(PREFS_KEY, p);
}

export interface Clients {
  sosac: SosacClient;
}

export function createClients(settings: ServiceSettings, session: Session, prefs: ClientPreferences): Clients {
  return {
    sosac: new SosacClient({
      domain: settings.sosacDomain,
      credentials: session.sosac,
      writeMode: prefs.writeMode,
    }),
  };
}

export interface LoginInput {
  sosacUsername: string;
  sosacPassword: string;
}

/** Ověří účet Sosáč a vrátí session k uložení. Nic neukládá sama, to dělá volající. */
export async function login(input: LoginInput, settings: ServiceSettings, prefs: ClientPreferences): Promise<Session> {
  const sosac: SosacCredentials = {
    username: input.sosacUsername.trim(),
    passwordHash: sosacPasswordHash(input.sosacUsername.trim(), input.sosacPassword),
  };
  try {
    await createClients(settings, { sosac }, prefs).sosac.verifyCredentials();
  } catch (err) {
    throw new Error(err instanceof ApiError && err.kind === 'unauthorized' ? 'Špatné jméno nebo heslo k Sosáči' : `Sosáč: ${(err as Error).message}`);
  }
  return { sosac };
}
