import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../domain/persistence/storageKeys';
import { profileStorageKey } from '../domain/persistence/profiles';

const profile = vi.hoisted(() => ({ active: 'main', protected: false }));
vi.mock('./profiles', () => ({ readProfiles: () => ({ active: profile.active, list: [] }),
  guardedProfileGate: () => ({ kind: profile.protected ? 'protected' : 'unknown' }), useProfiles: () => ({ active: profile.active, list: [] }) }));
const texts = new Map<string, string>();
const rawGoal = (questId: string) => JSON.stringify({ version: 1, intent: { kind: 'quest', questId } });
beforeEach(() => {
  vi.resetModules();
  profile.active = 'main'; profile.protected = false;
  texts.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => texts.get(key) ?? null,
    setItem: (key: string, value: string) => texts.set(key, value), removeItem: (key: string) => texts.delete(key) });
});

describe('one durable profile-scoped owner intent', () => {
  it('migrates the legacy Main training goal without losing it or copying it into another profile', async () => {
    const legacy = JSON.stringify({ skill: 'ranged', mode: 'fast', target: 63, freeOnly: true });
    texts.set(STORAGE_KEYS.skillTrack, legacy);
    const store = await import('./planningIntent');
    expect(store.getPlanningIntent().intent).toMatchObject({ kind: 'training', training: { target: 63, freeOnly: true } });
    profile.active = 'alt';
    expect(store.getPlanningIntent().intent).toEqual({ kind: 'auto' });
    expect(store.setPlanningIntent({ kind: 'quest', questId: "Doric's Quest" })).toBe(true);
    expect(texts.get(profileStorageKey(STORAGE_KEYS.planningIntent, 'alt'))).toBe(rawGoal("Doric's Quest"));
    profile.active = 'main';
    expect(store.getPlanningIntent().intent.kind).toBe('training');
    expect(texts.get(STORAGE_KEYS.skillTrack)).toBe(legacy);
  });
  it('does not resurrect an old training goal after an explicit return to automatic quests and reload', async () => {
    texts.set(STORAGE_KEYS.skillTrack, JSON.stringify({ skill: 'mining', mode: 'afk', target: 60 }));
    const store = await import('./planningIntent');
    expect(store.setPlanningIntent({ kind: 'auto' })).toBe(true);
    vi.resetModules();
    expect((await import('./planningIntent')).getPlanningIntent().intent).toEqual({ kind: 'auto' });
  });
  it('keeps future/damaged sources and protected profiles immutable', async () => {
    const future = '{"version":99,"important":"retained"}';
    texts.set(STORAGE_KEYS.planningIntent, future);
    const store = await import('./planningIntent');
    expect(store.getPlanningIntent()).toMatchObject({ readOnly: true, warning: expect.stringContaining('newer') });
    expect(store.setPlanningIntent({ kind: 'auto' })).toBe(false);
    expect(texts.get(STORAGE_KEYS.planningIntent)).toBe(future);
    profile.active = 'alt'; profile.protected = true;
    expect(store.setPlanningIntent({ kind: 'auto' })).toBe(false);
    expect(texts.has(profileStorageKey(STORAGE_KEYS.planningIntent, 'alt'))).toBe(false);
  });
  it('refuses to overwrite an external change discovered before a save', async () => {
    texts.set(STORAGE_KEYS.planningIntent, rawGoal('Imp Catcher'));
    const store = await import('./planningIntent');
    expect(store.getPlanningIntent().intent).toMatchObject({ questId: 'Imp Catcher' });
    texts.set(STORAGE_KEYS.planningIntent, rawGoal('Demon Slayer'));
    expect(store.setPlanningIntent({ kind: 'auto' })).toBe(false);
    expect(texts.get(STORAGE_KEYS.planningIntent)).toBe(rawGoal('Demon Slayer'));
    expect(store.getPlanningIntent()).toMatchObject({ readOnly: true, warning: expect.stringContaining('outside') });
  });
});
