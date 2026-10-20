import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const { atomicWrite } = createRequire(import.meta.url)('../electron/atomic-write.cjs') as {
  atomicWrite(target: string, text: string, io?: { writeFileSync: typeof writeFileSync; renameSync: typeof renameSync }): { ok: boolean; error: string | null };
};
const dirs: string[] = [];
const target = () => { const dir = mkdtempSync(join(tmpdir(), 'osrs-write-')); dirs.push(dir); return join(dir, 'progress.json'); };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('physical save acknowledgement', () => {
  it('only reports success after the new file replaces the old one', () => {
    const file = target();
    writeFileSync(file, 'old');
    expect(atomicWrite(file, 'new')).toEqual({ ok: true, error: null });
    expect(readFileSync(file, 'utf8')).toBe('new');
  });
  it('reports a full disk without replacing the previous save', () => {
    const file = target();
    writeFileSync(file, 'old');
    const result = atomicWrite(file, 'new', { writeFileSync() { throw Object.assign(new Error('private path'), { code: 'ENOSPC' }); }, renameSync });
    expect(result).toEqual({ ok: false, error: 'ENOSPC' });
    expect(readFileSync(file, 'utf8')).toBe('old');
  });
  it('reports a failed rename, preserves the previous file and allows a subsequent retry', () => {
    const file = target();
    writeFileSync(file, 'old');
    expect(atomicWrite(file, 'new', { writeFileSync, renameSync() { throw Object.assign(new Error('locked'), { code: 'EACCES' }); } })).toEqual({ ok: false, error: 'EACCES' });
    expect(readFileSync(file, 'utf8')).toBe('old');
    expect(atomicWrite(file, 'retry').ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('retry');
  });
});
