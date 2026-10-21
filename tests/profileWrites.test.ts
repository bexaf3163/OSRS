import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ loadProfilesFile: vi.fn(), saveProfilesFile: vi.fn(), saveProfilesFileChecked: vi.fn() }));
vi.mock('../src/lib/desktop', () => ({ desktop: () => shell }));
const key = 'osrs-put:profiles';
const original = { active: 'main', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Alt' }] };
let data: Map<string, string>;
let browserFailure: boolean;
const reload = vi.fn();
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  data = new Map([[key, JSON.stringify(original)]]); browserFailure = false;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { if (browserFailure) throw Error('Quota'); data.set(k, v); },
  });
  vi.stubGlobal('location', { reload });
  shell.loadProfilesFile.mockReturnValue(JSON.stringify(original));
  shell.saveProfilesFileChecked.mockReturnValue({ ok: true, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('confirmed profile persistence', () => {
  it('does not publish a rename or change browser bytes when the physical native write fails', async () => {
    const api = await import('../src/lib/profiles');
    api.readProfiles(); shell.saveProfilesFileChecked.mockReturnValue({ ok: false, error: 'ENOSPC' });
    expect(api.writeProfiles(api.renameProfile(original, 'alt', 'Renamed'))).toBe(false);
    expect(api.readProfiles()).toEqual(original);
    expect(data.get(key)).toBe(JSON.stringify(original));
    expect(api.profileSaveError()).toMatch(/profile file could not be saved/);
    expect(shell.saveProfilesFile).not.toHaveBeenCalled();
  });

  it('does not switch or reload after a thrown native write', async () => {
    const api = await import('../src/lib/profiles');
    api.readProfiles(); shell.saveProfilesFileChecked.mockImplementation(() => { throw Error('IPC failed'); });
    api.switchProfile('alt');
    expect(reload).not.toHaveBeenCalled();
    expect(api.readProfiles().active).toBe('main');
    expect(api.profileSaveError()).not.toBeNull();
  });

  it('a successful retry persists the intended switch and only then reloads once', async () => {
    const api = await import('../src/lib/profiles');
    api.readProfiles(); shell.saveProfilesFileChecked.mockReturnValue({ ok: false, error: 'ENOSPC' });
    api.switchProfile('alt');
    shell.saveProfilesFileChecked.mockReturnValue({ ok: true, error: null });
    api.retryProfileSave();
    expect(JSON.parse(data.get(key)!).active).toBe('alt');
    expect(JSON.parse(shell.saveProfilesFileChecked.mock.calls.at(-1)![0]).active).toBe('alt');
    expect(api.readProfiles().active).toBe('alt');
    expect(reload).toHaveBeenCalledOnce();
    expect(api.profileSaveError()).toBeNull();
  });

  it('a failed browser copy also prevents switching, and retry retains the intended edit', async () => {
    const api = await import('../src/lib/profiles');
    api.readProfiles(); browserFailure = true;
    api.switchProfile('alt');
    expect(reload).not.toHaveBeenCalled();
    expect(api.readProfiles()).toEqual(original);
    expect(api.profileSaveError()).toMatch(/browser profile copy/);
    browserFailure = false; api.retryProfileSave();
    expect(api.readProfiles().active).toBe('alt');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('the most recent failed edit replaces an older retry without publishing either early', async () => {
    const api = await import('../src/lib/profiles');
    api.readProfiles(); shell.saveProfilesFileChecked.mockReturnValue({ ok: false, error: 'EACCES' });
    api.writeProfiles(api.renameProfile(original, 'alt', 'First'));
    api.writeProfiles(api.renameProfile(original, 'alt', 'Latest'));
    expect(api.readProfiles()).toEqual(original);
    shell.saveProfilesFileChecked.mockReturnValue({ ok: true, error: null }); api.retryProfileSave();
    expect(api.readProfiles().list[1].name).toBe('Latest');
    expect(reload).not.toHaveBeenCalled();
  });

  it('deleting the active alternate reloads Main only after the deletion is confirmed', async () => {
    const active = { ...original, active: 'alt' };
    data.set(key, JSON.stringify(active)); shell.loadProfilesFile.mockReturnValue(JSON.stringify(active));
    const api = await import('../src/lib/profiles');
    api.readProfiles(); shell.saveProfilesFileChecked.mockReturnValue({ ok: false, error: 'ENOSPC' });
    expect(api.writeProfiles(api.removeProfile(active, 'alt'))).toBe(false);
    expect(api.readProfiles()).toEqual(active);
    expect(reload).not.toHaveBeenCalled();
    shell.saveProfilesFileChecked.mockReturnValue({ ok: true, error: null }); api.retryProfileSave();
    expect(api.readProfiles()).toEqual({ active: 'main', list: [original.list[0]] });
    expect(reload).toHaveBeenCalledOnce();
  });
});
