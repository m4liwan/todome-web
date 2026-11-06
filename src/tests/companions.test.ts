import { AVATARS, DEFAULT_AVATAR, LEGACY_AVATARS, avatarProfile, helloMessage, normalizeAvatar } from '../domain/companion';
import { PRO_AVATARS } from '../app/pro';
import { createStore, parseState } from '../state/store';
import { emptyState } from '../state/defaults';

describe('companion line-up (1.12)', () => {
  it('offers exactly six free companions: two neutral, two boy-vibe, two girl-vibe', () => {
    const free = AVATARS.filter((a) => !PRO_AVATARS.has(a.id));
    expect(free.map((a) => a.name)).toEqual(['Spike', 'Mark', 'Bit', 'Spark', 'Kiki', 'Pixie']);
    expect(free.map((a) => a.vibe)).toEqual(['neutral', 'neutral', 'boy', 'boy', 'girl', 'girl']);
    expect(DEFAULT_AVATAR).toBe('spike');
  });

  it('gives every companion its own intro and thank-you in the calm voice', () => {
    for (const a of AVATARS) {
      expect(a.intro).toContain(a.name);
      expect(a.thanks.length).toBeGreaterThan(8);
      expect(`${a.intro} ${a.thanks} ${a.description}`).not.toMatch(/überfällig|Deadline|\bmuss\b|\bmusst\b/i);
    }
    expect(helloMessage('m1', 'Lena', 'spark').text).toContain('Ich bin Spark');
  });

  it('moves companions of earlier versions to their closest successor', () => {
    expect(normalizeAvatar('mochi')).toBe('kiki');
    expect(normalizeAvatar('nova')).toBe('pixie');
    expect(normalizeAvatar('tropf')).toBe('spike');
    expect(normalizeAvatar('kumo')).toBe('woody');
    expect(normalizeAvatar('pingo')).toBe('spark');
    expect(normalizeAvatar('bit')).toBe('bit');
    expect(normalizeAvatar('mio')).toBe('kiki');
    expect(normalizeAvatar('gibt-es-nicht')).toBe('spike');
    expect(Object.values(LEGACY_AVATARS).every((id) => avatarProfile(id).id === id)).toBe(true);
    const old = emptyState();
    const stored = JSON.stringify({ ...old, settings: { ...old.settings, companion: { ...old.settings.companion, avatar: 'mochi' } } });
    expect(parseState(stored)!.settings.companion.avatar).toBe('kiki');
  });

  it('has Mark the tomato in the free line-up, Woody in Pro, and no Mio any more', () => {
    expect(AVATARS.map((a) => a.id)).toEqual(['spike', 'mark', 'bit', 'spark', 'kiki', 'pixie', 'keimi', 'woody']);
    expect(avatarProfile('mark').name).toBe('Mark');
    expect(avatarProfile('mark').intro).toContain('Tomate');
    expect([...PRO_AVATARS]).toEqual(['keimi', 'woody']);
    expect(AVATARS.some((a) => (a.id as string) === 'mio' || a.name === 'Mio')).toBe(false);
    expect(normalizeAvatar('stubbi')).toBe('woody');
  });

  it('keeps a saved choice of every free companion across a restart', () => {
    const memory = new Map<string, string>();
    const storage = { get: (k: string) => memory.get(k) ?? null, set: (k: string, v: string) => (memory.set(k, v), true), remove: (k: string) => void memory.delete(k) };
    for (const id of ['spike', 'mark', 'bit', 'spark', 'kiki', 'pixie'] as const) {
      const store = createStore({ storage, key: 'todome', initial: emptyState() });
      const s = store.getState().settings;
      store.dispatch({ type: 'settings/update', patch: { companion: { ...s.companion, avatar: id } } });
      store.flush();
      expect(parseState(memory.get('todome') ?? null)!.settings.companion.avatar).toBe(id);
    }
  });
});
