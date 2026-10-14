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
  verifyStreamuj,
  savePreferences,
  saveSession,
} from '../api';
import type { ClientPreferences, Clients, LoginInput, ServiceSettings, Session, StreamujAccount } from '../api';

interface ServicesValue {
  /** false, dokud neproběhne discovery domén. */
  ready: boolean;
  settings: ServiceSettings;
  session: Session;
  preferences: ClientPreferences;
  clients: Clients;
  /** Přihlášen k Sosáči (katalog, fronta, rozkoukané). */
  isLoggedIn: boolean;
  /** Připojený účet Streamuj (plné přehrávání). */
  hasStreamuj: boolean;
  login(input: LoginInput, opts?: { requireStreamuj?: boolean }): Promise<StreamujAccount | null>;
  /** Připojí nebo změní účet Streamuj u existující session. */
  connectStreamuj(username: string, password: string): Promise<StreamujAccount>;
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
    async (input: LoginInput, opts?: { requireStreamuj?: boolean }) => {
      const result = await apiLogin(input, settings, preferences, opts);
      saveSession(result.session);
      setSession(result.session);
      // Data se liší podle uživatele (pozice, fronta), proto vše znovu.
      queryClient.clear();
      return result.streamujAccount;
    },
    [settings, preferences, queryClient],
  );

  const connectStreamuj = useCallback(
    async (username: string, password: string) => {
      const { credentials, account } = await verifyStreamuj(username, password, settings, preferences);
      setSession((prev) => {
        const next: Session = {
          ...prev,
          streamuj: credentials,
          streamujAccount: { userId: account.userId, vipUntil: account.vipUntil?.toISOString() },
        };
        saveSession(next);
        return next;
      });
      return account;
    },
    [settings, preferences],
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
      hasStreamuj: session.streamuj !== null,
      login,
      connectStreamuj,
      logout,
      updatePreferences,
    }),
    [ready, settings, session, preferences, clients, login, connectStreamuj, logout, updatePreferences],
  );

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): ServicesValue {
  const v = useContext(ServicesContext);
  if (!v) throw new Error('useServices musí být uvnitř <ServicesProvider>');
  return v;
}
