// T01: a conflict between two supported profile lists is the player's choice: merge (nothing lost), or keep one list. Both originals are kept
// before anything is written; damage or a newer format is never released by this choice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ loadProfilesFile: vi.fn(), saveProfilesFile: vi.fn(), saveProfilesFileChecked: vi.fn() }));
vi.mock('../src/lib/desktop', () => ({ desktop: () => shell }));
const key = 'osrs-put:profiles';
const browser = { active: 'alt', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Alt', player: 'Tester' }] };
const native = { active: 'main', list: [{ id: 'main', name: 'Main' }, { id: 'third', name: 'Native only' }] };
let data: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  data = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } });
  reload = vi.fn(); vi.stubGlobal('location', { reload });
  shell.saveProfilesFileChecked.mockReturnValue({ ok: true, error: null });
  data.set(key, JSON.stringify(browser));
  shell.loadProfilesFile.mockReturnValue(JSON.stringify(native));
});
afterEach(() => vi.unstubAllGlobals());

describe('profile list conflict: the player chooses', () => {
  it('offers both lists and a merge that keeps every profile and this window\'s active one', async () => {
    const { profileConflict } = await import('../src/lib/profiles');
    const c = profileConflict()!;
    expect(c.local).toEqual(browser);
    expect(c.file).toEqual(native);
    expect(c.merged).toEqual({ active: 'alt', list: [...browser.list, native.list[1]] });
  });

  it('merge writes the merged list to both sources after keeping both originals, then reloads', async () => {
    const { resolveProfileConflict, guardedProfileGate, readProfiles } = await import('../src/lib/profiles');
    expect(resolveProfileConflict('merge')).toBe(true);
    const merged = JSON.parse(data.get(key)!);
    expect(merged.list.map((p: { id: string }) => p.id)).toEqual(['main', 'alt', 'third']);
    expect(shell.saveProfilesFileChecked).toHaveBeenCalledWith(data.get(key));
    expect(data.get(`${key}:recovery:local`)).toBe(JSON.stringify(browser));
    expect(data.get(`${key}:recovery:file`)).toBe(JSON.stringify(native));
    expect(guardedProfileGate(readProfiles(), 'Tester').kind).toBe('ok');
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each(['local', 'file'] as const)('keeping one list (%s) writes exactly that list', async (choice) => {
    const { resolveProfileConflict } = await import('../src/lib/profiles');
    expect(resolveProfileConflict(choice)).toBe(true);
    expect(JSON.parse(data.get(key)!)).toEqual(choice === 'local' ? browser : native);
  });

  it('no merge when one profile id is bound to two characters; keeping one list still works', async () => {
    shell.loadProfilesFile.mockReturnValue(JSON.stringify({ ...browser, list: [browser.list[0], { ...browser.list[1], player: 'Someone' }] }));
    const { profileConflict, resolveProfileConflict } = await import('../src/lib/profiles');
    expect(profileConflict()!.merged).toBeNull();
    expect(resolveProfileConflict('merge')).toBe(false);
    expect(shell.saveProfilesFileChecked).not.toHaveBeenCalled();
    expect(resolveProfileConflict('local')).toBe(true);
  });

  it('a failed native write changes nothing in the browser and does not reload', async () => {
    shell.saveProfilesFileChecked.mockReturnValue({ ok: false, error: 'WRITE_FAILED' });
    const { resolveProfileConflict, guardedProfileGate, readProfiles } = await import('../src/lib/profiles');
    expect(resolveProfileConflict('merge')).toBe(false);
    expect(data.get(key)).toBe(JSON.stringify(browser));
    expect(reload).not.toHaveBeenCalled();
    expect(guardedProfileGate(readProfiles(), 'Tester').kind).toBe('protected');
  });

  it.each(['{broken', '{"version":99,"list":[]}'])('damage or a newer format is not a conflict the player can resolve: %s', async (raw) => {
    shell.loadProfilesFile.mockReturnValue(raw);
    const { profileConflict, resolveProfileConflict } = await import('../src/lib/profiles');
    expect(profileConflict()).toBeNull();
    expect(resolveProfileConflict('local')).toBe(false);
    expect(shell.saveProfilesFileChecked).not.toHaveBeenCalled();
  });
});
