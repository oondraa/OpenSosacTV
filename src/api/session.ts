import { storage } from '../lib/storage';
import type { ServiceSettings } from './discovery';
import { sosacPasswordHash, streamujPasswordHash } from './hash';
import { ApiError } from './http';
import { SosacClient } from './sosac';
import type { SosacCredentials, WriteMode } from './sosac';
import { DEFAULT_STREAM_PREFERENCES, StreamujClient } from './streamuj';
import type { StreamLocation, StreamPreferences, StreamujAccount, StreamujCredentials } from './streamuj';

/**
 * Vše, co si klient pamatuje o uživateli. Jen hashe hesel, ne čistá hesla.
 * Hash katalogu je ale fakticky ekvivalent hesla (API ho bere přímo), takže
 * zařízení musí být důvěryhodné. Tohle chování má i Kodi plugin.
 */
export interface Session {
  sosac: SosacCredentials | null;
  streamuj: StreamujCredentials | null;
  /** Výsledek posledního check-user, jen pro zobrazení. */
  streamujAccount?: { userId: number; vipUntil?: string };
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

export const EMPTY_SESSION: Session = { sosac: null, streamuj: null };

export function loadSession(): Session {
  return storage.get<Session>(SESSION_KEY) ?? EMPTY_SESSION;
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
  streamuj: StreamujClient;
}

export function createClients(settings: ServiceSettings, session: Session, prefs: ClientPreferences): Clients {
  return {
    sosac: new SosacClient({
      domain: settings.sosacDomain,
      credentials: session.sosac,
      writeMode: prefs.writeMode,
    }),
    streamuj: new StreamujClient({
      provider: settings.streamingProvider,
      credentials: session.streamuj,
      location: prefs.location,
    }),
  };
}

export interface LoginInput {
  sosacUsername: string;
  sosacPassword: string;
  streamujUsername: string;
  streamujPassword: string;
}

export interface LoginResult {
  session: Session;
  streamujAccount: StreamujAccount;
}

export class LoginError extends Error {
  readonly field: 'sosac' | 'streamuj';
  constructor(field: 'sosac' | 'streamuj', message: string) {
    super(message);
    this.name = 'LoginError';
    this.field = field;
  }
}

/**
 * Ověří oba účty a vrátí session k uložení. Nic neukládá sama, to dělá volající
 * (React vrstva) až po úspěchu.
 */
export async function login(input: LoginInput, settings: ServiceSettings, prefs: ClientPreferences): Promise<LoginResult> {
  const sosac: SosacCredentials = {
    username: input.sosacUsername.trim(),
    passwordHash: sosacPasswordHash(input.sosacUsername.trim(), input.sosacPassword),
  };
  const streamuj: StreamujCredentials = {
    username: input.streamujUsername.trim(),
    passwordHash: streamujPasswordHash(input.streamujPassword),
  };
  const clients = createClients(settings, { sosac, streamuj }, prefs);

  const [sosacResult, streamujResult] = await Promise.allSettled([
    clients.sosac.verifyCredentials(),
    clients.streamuj.checkUser(),
  ]);

  if (sosacResult.status === 'rejected') {
    const err = sosacResult.reason;
    throw new LoginError(
      'sosac',
      err instanceof ApiError && err.kind === 'unauthorized' ? 'Špatné jméno nebo heslo k Sosáči' : `Sosáč: ${(err as Error).message}`,
    );
  }
  if (streamujResult.status === 'rejected') {
    throw new LoginError('streamuj', `Streamuj: ${(streamujResult.reason as Error).message}`);
  }
  const account = streamujResult.value;
  if (!account.valid) {
    throw new LoginError('streamuj', account.message ?? 'Špatné jméno nebo heslo ke Streamuj.tv');
  }

  return {
    session: {
      sosac,
      streamuj,
      streamujAccount: { userId: account.userId, vipUntil: account.vipUntil?.toISOString() },
    },
    streamujAccount: account,
  };
}
