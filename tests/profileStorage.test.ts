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
  it.each(['{broken', '{"version":99,"list":[]}', '{"active":"alt","list":[null]}'])('protects a damaged or future native profile source even when the browser is valid: %s', async raw => {
    data.set(key, JSON.stringify(good)); shell.loadProfilesFile.mockReturnValue(raw);
    const { readProfiles, writeProfiles, guardedProfileGate, gateAllows } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
    expect(writeProfiles({ ...good, active: 'main' })).toBe(false);
    expect(data.get(key)).toBe(JSON.stringify(good));
    expect(gateAllows(guardedProfileGate(good, 'Tester'))).toBe(false);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });

  it('cannot serialize a Main fallback over two damaged profile sources or reload it', async () => {
    data.set(key, '{browser broken'); shell.loadProfilesFile.mockReturnValue('{file broken');
    const reload = vi.fn(); vi.stubGlobal('location', { reload });
    const { readProfiles, writeProfiles, switchProfile, guardedProfileGate, gateAllows } = await import('../src/lib/profiles');
    const recovered = readProfiles();
    expect(writeProfiles({ ...recovered, list: [...recovered.list, { id: 'new', name: 'New' }] })).toBe(false);
    switchProfile('new');
    expect(reload).not.toHaveBeenCalled();
    expect(data.get(key)).toBe('{browser broken');
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
    expect(gateAllows(guardedProfileGate(recovered, 'Tester'))).toBe(false);
  });

  it('an unsupported browser format stays protected alongside a compatible native fallback', async () => {
    const future = '{"version":99,"list":[]}'; data.set(key, future);
    const { readProfiles, writeProfiles, guardedProfileGate } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(guardedProfileGate(good, null).kind).toBe('protected');
    expect(writeProfiles(good)).toBe(false);
    expect(data.get(key)).toBe(future);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });

  it('a failed native read cannot authorize mirroring or profile edits', async () => {
    data.set(key, JSON.stringify(good)); shell.loadProfilesFile.mockImplementation(() => { throw Error('read failed'); });
    const { readProfiles, writeProfiles } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(writeProfiles(good)).toBe(false);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });

  it('a conflicting recovery copy is preserved and cannot authorize a lossy recovery', async () => {
    data.set(key, '{new damage'); data.set(`${key}:recovery`, '{older damage');
    const { readProfiles, writeProfiles } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(writeProfiles(good)).toBe(false);
    expect(data.get(key)).toBe('{new damage');
    expect(data.get(`${key}:recovery`)).toBe('{older damage');
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });

  it('a preserved damaged browser source can use the valid native list without leaving profiles locked', async () => {
    data.set(key, '{broken');
    const { readProfiles, writeProfiles, guardedProfileGate, gateAllows } = await import('../src/lib/profiles');
    expect(readProfiles()).toEqual(good);
    expect(gateAllows(guardedProfileGate(good, 'Tester'))).toBe(true);
    expect(writeProfiles(good)).toBe(true);
    expect(data.get(`${key}:recovery`)).toBe('{broken');
    expect(data.get(key)).toBe(JSON.stringify(good));
  });

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
    expect(shell.loadProfilesFile).toHaveBeenCalledOnce();
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
    expect(shell.loadProfilesFile).toHaveBeenCalledOnce();
    expect(JSON.parse(shell.saveProfilesFile.mock.calls[0][0])).toEqual(good);
  });
  it('does not write defaults into a damaged file while reading', async () => {
    data.set(key, '{broken'); shell.loadProfilesFile.mockReturnValue('{also broken');
    const { readProfiles } = await import('../src/lib/profiles');
    expect(readProfiles().active).toBe('main');
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });
});
