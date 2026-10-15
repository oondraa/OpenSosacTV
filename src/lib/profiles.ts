import { storage } from './storage';

/**
 * Profily v rámci jednoho účtu Sosáč, bez hesel. Sosáč profily nezná: fronta
 * "Chci vidět" je jedna na účet. Proto si každá položka fronty nese štítky
 * profilů, které ji přidaly. Štítky žijí jen v tomto zařízení.
 *
 * Položka ve frontě bez štítku (přidaná na webu nebo v jiném zařízení) je
 * společná a patří všem profilům.
 */
export interface Profile {
  id: string;
  name: string;
}

export interface ProfilesState {
  profiles: Profile[];
  activeId: string;
  /** `movie:123` → id profilů, které položku chtějí vidět. */
  owners: Record<string, string[]>;
}

export type QueueKind = 'movie' | 'serial';

export const queueKey = (kind: QueueKind, id: number) => `${kind}:${id}`;

const storageKey = (account: string) => `profiles:${account.toLowerCase()}`;

export function defaultProfiles(account: string): ProfilesState {
  const id = newProfileId();
  return { profiles: [{ id, name: account }], activeId: id, owners: {} };
}

export function loadProfiles(account: string): ProfilesState {
  const stored = storage.get<ProfilesState>(storageKey(account));
  if (!stored?.profiles?.length) return defaultProfiles(account);
  const activeId = stored.profiles.some((p) => p.id === stored.activeId) ? stored.activeId : stored.profiles[0]!.id;
  return { profiles: stored.profiles, activeId, owners: stored.owners ?? {} };
}

export function saveProfiles(account: string, state: ProfilesState): void {
  storage.set(storageKey(account), state);
}

export function newProfileId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Profily, které položku chtějí vidět. Prázdné = společná položka. */
export function ownersOf(state: ProfilesState, kind: QueueKind, id: number): Profile[] {
  const ids = state.owners[queueKey(kind, id)] ?? [];
  return state.profiles.filter((p) => ids.includes(p.id));
}

/** Patří položka ze serverové fronty profilu? Společné patří všem. */
export function isQueuedFor(state: ProfilesState, profileId: string, kind: QueueKind, id: number): boolean {
  const owners = ownersOf(state, kind, id);
  return owners.length === 0 || owners.some((p) => p.id === profileId);
}

/**
 * Přidá nebo odebere štítek profilu. Vrací nový stav a co udělat se serverovou
 * frontou: přidat, když tam položka není; odebrat, když už ji nikdo nechce.
 */
export function toggleOwner(
  state: ProfilesState,
  kind: QueueKind,
  id: number,
  queued: boolean,
  onServer: boolean,
): { state: ProfilesState; server: 'add' | 'remove' | 'none' } {
  const key = queueKey(kind, id);
  const known = new Set(state.profiles.map((p) => p.id));
  // Štítky položky, která ze serveru mezitím zmizela, už neplatí.
  const current = onServer ? (state.owners[key] ?? []).filter((p) => known.has(p)) : [];
  const nextOwners = queued ? [...new Set([...current, state.activeId])] : current.filter((p) => p !== state.activeId);
  const owners = { ...state.owners };
  if (nextOwners.length) owners[key] = nextOwners;
  else delete owners[key];

  let server: 'add' | 'remove' | 'none' = 'none';
  if (queued && !onServer) server = 'add';
  else if (!queued && onServer && nextOwners.length === 0) server = 'remove';
  return { state: { ...state, owners }, server };
}

/**
 * Smaže profil. Jeho položky zůstanou ve frontě na serveru: co chtěl jen on,
 * se stane společným. Mazat z účtu bez ptaní by bylo horší.
 */
export function removeProfile(state: ProfilesState, profileId: string): ProfilesState {
  if (state.profiles.length <= 1) return state;
  const profiles = state.profiles.filter((p) => p.id !== profileId);
  const owners: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(state.owners)) {
    const rest = ids.filter((p) => p !== profileId);
    if (rest.length) owners[key] = rest;
  }
  return { profiles, activeId: state.activeId === profileId ? profiles[0]!.id : state.activeId, owners };
}
