import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ loadProfilesFile: vi.fn(), saveProfilesFile: vi.fn() }));
vi.mock('../src/lib/desktop', () => ({ desktop: () => shell }));
const key = 'osrs-put:profiles';
const good = { active: 'alt', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Alt', player: 'Tester' }] };
let data: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  data = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } });
  shell.loadProfilesFile.mockReturnValue(JSON.stringify(good));
});
afterEach(() => vi.unstubAllGlobals());

describe('profile list recovery', () => {
  it.each([
    JSON.stringify({ active: 'alt', list: [null] }),
    JSON.stringify({ active: 'alt', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'First' }, { id: 'alt', name: 'Second' }] }),
    JSON.stringify({ active: 'missing', list: [{ id: 'main', name: 'Main' }] }),
    JSON.stringify({ version: 99, active: 'main', list: [{ id: 'main', name: 'Future' }] }),
    JSON.stringify({ active: 'p8', list: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `Profile ${i}` })) }),
    JSON.stringify({ active: 'p7', list: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Profile ${i}` })) }),
    JSON.stringify({ active: 'alt', list: [{ id: 'alt', name: 'Alt', player: { name: 'Wrong shape' } }] }),
  ])('does not mirror a lossy or unsupported source over the valid profile file: %s', async raw => {
    data.set(key, raw);
    const { readProfiles } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
    expect(data.get(`${key}:recovery`)).toBe(raw);
    expect(data.get(key)).toBe(raw);
  });

  it('retains a compatible list which needs the implicit Main profile without dropping its character', async () => {
    data.set(key, JSON.stringify({ active: 'alt', list: [good.list[1]] }));
    const { readProfiles } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(shell.loadProfilesFile).not.toHaveBeenCalled();
    expect(JSON.parse(shell.saveProfilesFile.mock.calls[0][0])).toEqual(good);
  });

  it.each(['{broken', '{"list":null}', 'null'])('uses the valid file instead of damaged browser profiles: %s', async (raw) => {
    data.set(key, raw);
    const { readProfiles } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
    expect(data.get(`${key}:recovery`)).toBe(raw);
    expect(data.get(key)).toBe(raw);
  });
  it('mirrors only a validated list into the file', async () => {
    data.set(key, JSON.stringify(good));
    const { readProfiles } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(shell.loadProfilesFile).not.toHaveBeenCalled();
    expect(JSON.parse(shell.saveProfilesFile.mock.calls[0][0])).toEqual(good);
  });
  it('does not write defaults into a damaged file while reading', async () => {
    data.set(key, '{broken'); shell.loadProfilesFile.mockReturnValue('{also broken');
    const { readProfiles } = await import('../src/lib/profiles');
    expect(readProfiles().active).toBe('main');
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });
});
