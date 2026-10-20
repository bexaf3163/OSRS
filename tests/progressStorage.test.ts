import { describe, expect, it } from 'vitest';
import { known } from '../src/data';
import { emptyProgress, normalizeProgress, STORAGE_KEY } from '../src/lib/progress';
import { readProgressText, restoreProgress } from '../src/lib/progressStorage';

const saved = (step = 'S2-01', at = '2026-10-01T00:00:00.000Z') => ({ ...emptyProgress(), steps: { [step]: 'done' as const }, updatedAt: at });
function memory(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[STORAGE_KEY, raw]]);
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}

describe('safe progress recovery', () => {
  it('damaged local storage cannot beat an older valid file with a new empty timestamp', () => {
    const storage = memory('{broken');
    const progress = saved();
    const restored = restoreProgress(storage, known, STORAGE_KEY, () => JSON.stringify(progress));
    expect(restored.progress).toEqual(progress);
    expect(restored.writable).toBe(true);
    expect(storage.getItem(`${STORAGE_KEY}:recovery:local`)).toBe('{broken');
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken'); // The reader itself never overwrites a source.
  });
  it('an invalid file is preserved and the valid browser copy is used', () => {
    const p = saved();
    const storage = memory(JSON.stringify(p));
    const restored = restoreProgress(storage, known, STORAGE_KEY, () => '{broken file');
    expect(restored.progress).toEqual(p);
    expect(restored.writable).toBe(true);
    expect(storage.getItem(`${STORAGE_KEY}:recovery:file`)).toBe('{broken file');
  });
  it('chooses the newer of valid sources, never the time an undated source was read', () => {
    const p = saved();
    const file = saved('S3-01', '2026-10-02T00:00:00.000Z');
    expect(restoreProgress(memory(JSON.stringify(p)), known, STORAGE_KEY, () => JSON.stringify(file)).progress).toEqual(file);
    expect(restoreProgress(memory(JSON.stringify(file)), known, STORAGE_KEY, () => JSON.stringify(p)).progress).toEqual(file);
    const { updatedAt: _at, ...undated } = file;
    expect(restoreProgress(memory(JSON.stringify(undated)), known, STORAGE_KEY, () => JSON.stringify(p)).progress).toEqual(p);
  });
  it('a fresh install is writable, two damaged sources are not', () => {
    expect(restoreProgress(memory(), known, STORAGE_KEY).writable).toBe(true);
    const restored = restoreProgress(memory('broken'), known, STORAGE_KEY, () => 'also broken');
    expect(restored.writable).toBe(false);
    expect(restored.preserved).toBe(true);
    expect(restored.warning).toContain('Automatic saving is paused');
  });
  it.each(['local', 'file'])('an unsupported %s source is not migrated or automatically overwritten', (source) => {
    const future = JSON.stringify({ ...saved(), version: 99 });
    const current = JSON.stringify(saved('S3-01'));
    const storage = memory(source === 'local' ? future : current);
    const restored = restoreProgress(storage, known, STORAGE_KEY, () => source === 'file' ? future : current);
    expect(restored.progress.steps).toEqual({ 'S3-01': 'done' });
    expect(restored.writable).toBe(false);
    expect(restored.warning).toContain('not supported');
    expect(storage.getItem(`${STORAGE_KEY}:recovery:${source}`)).toBe(future);
    expect(normalizeProgress(JSON.parse(future), known)).toBeNull();
  });
  it('does not overwrite a previous recovery copy or continue saving when preservation fails', () => {
    const storage = memory('new broken');
    storage.setItem(`${STORAGE_KEY}:recovery:local`, 'older broken');
    const restored = restoreProgress(storage, known, STORAGE_KEY, () => JSON.stringify(saved()));
    expect(restored.progress.steps).toEqual({ 'S2-01': 'done' });
    expect(restored.writable).toBe(false);
    expect(restored.preserved).toBe(false);
    expect(storage.getItem(`${STORAGE_KEY}:recovery:local`)).toBe('older broken');
  });
  it('restoring twice does not replace an identical recovery copy', () => {
    const storage = memory('broken');
    const read = () => restoreProgress(storage, known, STORAGE_KEY, () => JSON.stringify(saved()));
    expect(read().writable).toBe(true);
    expect(read().writable).toBe(true);
    expect(storage.values.size).toBe(2);
  });
  it('an unavailable storage or unreadable file is a protected state', () => {
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
    expect(restoreProgress(storage, known, STORAGE_KEY).writable).toBe(false);
    expect(restoreProgress(memory(), known, STORAGE_KEY, () => { throw new Error('denied'); }).writable).toBe(false);
  });
  it('keeps profile recovery copies under that profile key', () => {
    const storage = memory();
    const key = `${STORAGE_KEY}:p:alt`;
    storage.setItem(key, 'broken alt');
    restoreProgress(storage, known, key, () => JSON.stringify(saved()));
    expect(storage.getItem(`${key}:recovery:local`)).toBe('broken alt');
    expect(storage.getItem(`${STORAGE_KEY}:recovery:local`)).toBeNull();
  });
  it.each(['', 'null', '[]', '{}', '{"app":"another","steps":{}}'])('does not accept an invalid source %s', (raw) => {
    expect(readProgressText(raw, known).kind).toBe('invalid');
  });
  it('retains legacy saves and migrates task prefixes with their V2 steps', () => {
    expect(readProgressText(JSON.stringify({ steps: { 'S2-01': 'done' } }), known).kind).toBe('valid');
    const result = normalizeProgress({ version: 2, steps: { 'S1-06': 'done' }, tasksDone: { 'S1-06:book': true } }, known)!;
    expect(result.progress.steps).toEqual({ 'S1-10': 'done' });
    expect(result.progress.tasksDone).toEqual({ 'S1-10:book': true });
  });
});
