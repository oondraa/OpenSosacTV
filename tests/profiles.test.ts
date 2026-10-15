import { describe, expect, it } from 'vitest';
import { isQueuedFor, ownersOf, removeProfile, toggleOwner } from '../src/lib/profiles';
import type { ProfilesState } from '../src/lib/profiles';

const base: ProfilesState = {
  profiles: [
    { id: 'a', name: 'Ondra' },
    { id: 'b', name: 'Pavla' },
  ],
  activeId: 'a',
  owners: {},
};

describe('profily', () => {
  it('položka bez štítku je společná', () => {
    expect(isQueuedFor(base, 'a', 'movie', 1)).toBe(true);
    expect(isQueuedFor(base, 'b', 'movie', 1)).toBe(true);
  });

  it('přidání nové položky zapíše na server a označí profil', () => {
    const r = toggleOwner(base, 'movie', 1, true, false);
    expect(r.server).toBe('add');
    expect(ownersOf(r.state, 'movie', 1).map((p) => p.name)).toEqual(['Ondra']);
    expect(isQueuedFor(r.state, 'b', 'movie', 1)).toBe(false);
  });

  it('položka už na serveru: druhý profil jen přidá štítek', () => {
    const one = toggleOwner(base, 'movie', 1, true, false).state;
    const r = toggleOwner({ ...one, activeId: 'b' }, 'movie', 1, true, true);
    expect(r.server).toBe('none');
    expect(ownersOf(r.state, 'movie', 1)).toHaveLength(2);
  });

  it('ze serveru se maže, až když položku nikdo nechce', () => {
    const both = { ...base, owners: { 'movie:1': ['a', 'b'] } };
    const r1 = toggleOwner(both, 'movie', 1, false, true);
    expect(r1.server).toBe('none');
    const r2 = toggleOwner({ ...r1.state, activeId: 'b' }, 'movie', 1, false, true);
    expect(r2.server).toBe('remove');
    expect(r2.state.owners['movie:1']).toBeUndefined();
  });

  it('odebrání společné položky ji smaže ze serveru', () => {
    expect(toggleOwner(base, 'serial', 5, false, true).server).toBe('remove');
  });

  it('smazaný profil: jeho položky zůstanou jako společné', () => {
    const s = removeProfile({ ...base, owners: { 'movie:1': ['b'], 'movie:2': ['a', 'b'] } }, 'b');
    expect(s.profiles).toHaveLength(1);
    expect(s.owners).toEqual({ 'movie:2': ['a'] });
    expect(removeProfile(s, 'a')).toBe(s);
  });
});
