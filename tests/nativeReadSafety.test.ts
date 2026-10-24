import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { known } from '../src/data';
import { emptyProgress, STORAGE_KEY } from '../src/lib/progress';
import { restoreProgress } from '../src/lib/progressStorage';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');
const native = require('../electron/progress-files.cjs') as {
  readProgress(dir: string, now?: Date, name?: string, includeInvalid?: boolean): string | null;
  readProgressResult(dir: string, now?: Date, name?: string): unknown;
};
const preload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

function exposed(reply: unknown) {
  let api!: { loadProgressFile(id?: string): string | null; loadProfilesFile(): string | null };
  const sendSync = vi.fn(() => reply);
  runInNewContext(preload, { require: () => ({
    contextBridge: { exposeInMainWorld: (_: string, value: typeof api) => { api = value; } },
    ipcRenderer: { sendSync },
  }) });
  return { api, sendSync };
}

afterEach(() => vi.restoreAllMocks());

describe('native saved-file read failures', () => {
  it.each(['EACCES', 'EPERM', 'EIO', 'EISDIR', 'ENOTDIR'])('%s is not a missing progress file', code => {
    const error = Object.assign(new Error('read failed'), { code });
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => { throw error; });
    expect(() => native.readProgress('unused', new Date(), 'progress.json', true)).toThrow(error);
  });
  it('only ENOENT means no saved file', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
    expect(native.readProgress('unused', new Date(), 'profiles.json', true)).toBeNull();
  });
  it.each(['progress.json', 'profiles.json'])('a %s error reaches the preload instead of becoming an empty source', name => {
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); });
    const reply = native.readProgressResult('unused', new Date(), name);
    expect(reply).toEqual({ ok: false, error: 'READ_FAILED' });
    const { api } = exposed(reply);
    expect(() => name === 'profiles.json' ? api.loadProfilesFile() : api.loadProgressFile()).toThrow('saved');
  });
  it.each([null, '{"steps":{}}', '{broken original'])('a successful read retains the original text: %s', text => {
    const { api, sendSync } = exposed({ ok: true, text });
    expect(api.loadProgressFile('alt')).toBe(text);
    expect(sendSync).toHaveBeenCalledWith('progress:load', 'alt');
    expect(api.loadProfilesFile()).toBe(text);
    expect(sendSync).toHaveBeenLastCalledWith('profiles:load');
  });
  it.each([undefined, {}, { ok: true }, { ok: true, text: 42 }])('a malformed IPC receipt is not a fresh installation: %j', reply => {
    expect(() => exposed(reply).api.loadProgressFile()).toThrow();
  });
  it.each([false, true])('an unreadable native source pauses writes with a browser fallback present: %s', localExists => {
    const raw = localExists ? JSON.stringify({ ...emptyProgress(), steps: { 'S2-01': 'done' }, notes: { 'S2-01': 'Keep me' } }) : null;
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn() };
    const { api } = exposed({ ok: false, error: 'READ_FAILED' });
    const restored = restoreProgress(storage, known, STORAGE_KEY, () => api.loadProgressFile());
    expect(restored.writable).toBe(false);
    expect(restored.preserved).toBe(false);
    expect(restored.warning).toContain('Automatic saving is paused');
    expect(restored.progress.steps['S2-01']).toBe(localExists ? 'done' : undefined);
    if (localExists) expect(restored.progress.notes['S2-01']).toBe('Keep me');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
