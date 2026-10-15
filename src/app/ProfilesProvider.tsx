import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadProfiles, newProfileId, removeProfile, saveProfiles, toggleOwner } from '../lib/profiles';
import type { Profile, ProfilesState, QueueKind } from '../lib/profiles';

interface ProfilesValue {
  state: ProfilesState;
  profiles: Profile[];
  active: Profile;
  switchTo(id: string): void;
  add(name: string): void;
  rename(id: string, name: string): void;
  remove(id: string): void;
  /** Přepne štítek aktivního profilu a vrátí, co udělat se serverovou frontou. */
  setOwner(kind: QueueKind, id: number, queued: boolean, onServer: boolean): 'add' | 'remove' | 'none';
  /** Vrátí štítky do stavu před `setOwner` (zápis na server selhal). */
  restore(state: ProfilesState): void;
}

const ProfilesContext = createContext<ProfilesValue | null>(null);

/** Profily jednoho účtu. Volající ho klíčuje jménem účtu, takže se při přihlášení načte znovu. */
export function ProfilesProvider({ account, children }: { account: string; children: ReactNode }) {
  const [state, setStateRaw] = useState<ProfilesState>(() => loadProfiles(account));
  const ref = useRef(state);

  const setState = useCallback(
    (next: ProfilesState) => {
      ref.current = next;
      saveProfiles(account, next);
      setStateRaw(next);
    },
    [account],
  );

  const switchTo = useCallback((id: string) => setState({ ...ref.current, activeId: id }), [setState]);
  const add = useCallback(
    (name: string) => {
      const id = newProfileId();
      setState({ ...ref.current, profiles: [...ref.current.profiles, { id, name: name.trim() }], activeId: id });
    },
    [setState],
  );
  const rename = useCallback(
    (id: string, name: string) => setState({ ...ref.current, profiles: ref.current.profiles.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) }),
    [setState],
  );
  const remove = useCallback((id: string) => setState(removeProfile(ref.current, id)), [setState]);
  const setOwner = useCallback(
    (kind: QueueKind, id: number, queued: boolean, onServer: boolean) => {
      const r = toggleOwner(ref.current, kind, id, queued, onServer);
      setState(r.state);
      return r.server;
    },
    [setState],
  );

  const value = useMemo<ProfilesValue>(
    () => ({
      state,
      profiles: state.profiles,
      active: state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0]!,
      switchTo,
      add,
      rename,
      remove,
      setOwner,
      restore: setState,
    }),
    [state, switchTo, add, rename, remove, setOwner, setState],
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles(): ProfilesValue {
  const v = useContext(ProfilesContext);
  if (!v) throw new Error('useProfiles musí být uvnitř <ProfilesProvider>');
  return v;
}

/** Písmeno do kolečka profilu v navigaci. */
export function useProfileInitial(): string {
  const { active } = useProfiles();
  return active.name.trim()[0]?.toUpperCase() ?? '?';
}
