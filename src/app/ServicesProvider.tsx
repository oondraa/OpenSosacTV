import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  EMPTY_SESSION,
  FALLBACK_SETTINGS,
  clearSession,
  createClients,
  discoverSettings,
  loadPreferences,
  loadSession,
  login as apiLogin,
  savePreferences,
  saveSession,
} from '../api';
import type { ClientPreferences, Clients, LoginInput, ServiceSettings, Session } from '../api';
import { ProfilesProvider } from './ProfilesProvider';

interface ServicesValue {
  /** false, dokud neproběhne discovery domén. */
  ready: boolean;
  settings: ServiceSettings;
  session: Session;
  preferences: ClientPreferences;
  clients: Clients;
  /** Přihlášen k Sosáči (katalog, fronta, rozkoukané). */
  isLoggedIn: boolean;
  login(input: LoginInput): Promise<void>;
  logout(): void;
  updatePreferences(patch: Partial<ClientPreferences>): void;
}

const ServicesContext = createContext<ServicesValue | null>(null);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          // 401 se opakováním nespraví.
          if (err instanceof ApiError && err.kind === 'unauthorized') return false;
          return count < 2;
        },
      },
    },
  });
}

export function ServicesProvider({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ServicesState>{children}</ServicesState>
    </QueryClientProvider>
  );
}

function ServicesState({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<ServiceSettings>(FALLBACK_SETTINGS);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>(() => loadSession());
  const [preferences, setPreferences] = useState<ClientPreferences>(() => loadPreferences());

  useEffect(() => {
    const ctrl = new AbortController();
    discoverSettings({ signal: ctrl.signal })
      .then(setSettings)
      .finally(() => setReady(true));
    return () => ctrl.abort();
  }, []);

  const clients = useMemo(() => createClients(settings, session, preferences), [settings, session, preferences]);

  const login = useCallback(
    async (input: LoginInput) => {
      const next = await apiLogin(input, settings, preferences);
      saveSession(next);
      setSession(next);
      // Data se liší podle uživatele (pozice, fronta), proto vše znovu.
      queryClient.clear();
    },
    [settings, preferences, queryClient],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(EMPTY_SESSION);
    queryClient.clear();
  }, [queryClient]);

  const updatePreferences = useCallback((patch: Partial<ClientPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch, stream: { ...prev.stream, ...patch.stream } };
      savePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo<ServicesValue>(
    () => ({
      ready,
      settings,
      session,
      preferences,
      clients,
      isLoggedIn: session.sosac !== null,
      login,
      logout,
      updatePreferences,
    }),
    [ready, settings, session, preferences, clients, login, logout, updatePreferences],
  );

  // Profily patří k účtu: klíč zajistí, že se po přihlášení jiným účtem načtou jeho.
  const account = session.sosac?.username ?? '';
  return (
    <ServicesContext.Provider value={value}>
      <ProfilesProvider key={account} account={account}>
        {children}
      </ProfilesProvider>
    </ServicesContext.Provider>
  );
}

export function useServices(): ServicesValue {
  const v = useContext(ServicesContext);
  if (!v) throw new Error('useServices musí být uvnitř <ServicesProvider>');
  return v;
}
