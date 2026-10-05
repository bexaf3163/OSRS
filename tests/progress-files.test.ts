import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const { backupProgress, readProgress } = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
  backupProgress: (dir: string) => void;
  readProgress: (dir: string, now?: Date) => string | null;
};

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'osrs-progress-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('the progress file', () => {
  it('a whole file is read as is, a missing one — null', () => {
    const d = tmp();
    expect(readProgress(d)).toBeNull();
    writeFileSync(join(d, 'progress.json'), '{"version":3}');
    expect(readProgress(d)).toBe('{"version":3}');
    expect(readdirSync(d)).toEqual(['progress.json']);
  });

  it('a broken file is set aside whole, not lost; the last three are kept', () => {
    const d = tmp();
    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(d, 'progress.json'), `{"steps":{"S1-01":"do${i}`);
      expect(readProgress(d, new Date(Date.UTC(2026, 8, 28, 12, 0, i)))).toBeNull();
    }
    const broken = readdirSync(d).filter((n) => n.startsWith('progress.broken-')).sort();
    expect(broken).toEqual(['progress.broken-20260928T120003.json', 'progress.broken-20260928T120004.json', 'progress.broken-20260928T120005.json']);
    expect(readFileSync(join(d, broken[2]), 'utf8')).toBe('{"steps":{"S1-01":"do5');
  });

  it('a copy is made only from a whole file and does not overwrite a good one with a broken one', () => {
    const d = tmp();
    backupProgress(d);
    expect(existsSync(join(d, 'progress.bak.json'))).toBe(false);
    writeFileSync(join(d, 'progress.json'), '{"version":3,"ok":1}');
    backupProgress(d);
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe('{"version":3,"ok":1}');
    writeFileSync(join(d, 'progress.json'), '{"version":');
    backupProgress(d);
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe('{"version":3,"ok":1}');
  });
});

describe('profiles and the scheduled copy', () => {
  const api = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
    readProgress: (dir: string, now?: Date, name?: string) => string | null;
    backupProgress: (dir: string, name?: string) => void;
    dailyBackup: (dir: string, target: string, now?: Date) => number;
  };

  it('each profile has its own file, a broken one is set aside under its own name', () => {
    const d = tmp();
    writeFileSync(join(d, 'progress-ab12.json'), '{"x":1}');
    expect(api.readProgress(d, new Date(), 'progress-ab12.json')).toBe('{"x":1}');
    expect(api.readProgress(d, new Date(), 'progress.json')).toBeNull();
    writeFileSync(join(d, 'progress-ab12.json'), '{"x":');
    expect(api.readProgress(d, new Date(Date.UTC(2026, 9, 2, 1, 2, 3)), 'progress-ab12.json')).toBeNull();
    expect(readdirSync(d).filter((n) => n.includes('broken'))).toEqual(['progress-ab12.broken-20261002T010203.json']);
    writeFileSync(join(d, 'progress-ab12.json'), '{"x":2}');
    api.backupProgress(d, 'progress-ab12.json');
    expect(readFileSync(join(d, 'progress-ab12.bak.json'), 'utf8')).toBe('{"x":2}');
  });

  it('scheduled copy: once a day, one file per profile, today\'s is not overwritten, 14 are kept', () => {
    const d = tmp();
    const out = join(tmp(), 'copies');
    writeFileSync(join(d, 'progress.json'), '{"a":1}');
    writeFileSync(join(d, 'progress-xy.json'), '{"b":2}');
    writeFileSync(join(d, 'progress.bak.json'), '{"old":1}');
    writeFileSync(join(d, 'ui.json'), '{}');
    expect(api.dailyBackup(d, out, new Date(2026, 9, 2))).toBe(2);
    expect(readdirSync(out).sort()).toEqual(['osrs-put-progress-20261002.json', 'osrs-put-progress-xy-20261002.json']);
    writeFileSync(join(d, 'progress.json'), '{"a":99}');
    expect(api.dailyBackup(d, out, new Date(2026, 9, 2))).toBe(0);
    expect(readFileSync(join(out, 'osrs-put-progress-20261002.json'), 'utf8')).toBe('{"a":1}');
    for (let day = 3; day <= 20; day++) api.dailyBackup(d, out, new Date(2026, 9, day));
    const main = readdirSync(out).filter((n) => /^osrs-put-progress-\d{8}\.json$/.test(n));
    expect(main).toHaveLength(14);
    expect(main[0]).toBe('osrs-put-progress-20261007.json');
    // Profile "xy" is not eaten by the main one when old ones are deleted.
    expect(readdirSync(out).filter((n) => n.startsWith('osrs-put-progress-xy-'))).toHaveLength(14);
    // A broken file is not copied.
    writeFileSync(join(d, 'progress.json'), '{"a":');
    expect(api.dailyBackup(d, out, new Date(2026, 9, 21))).toBe(1);
  });
});

describe('copies outside the app and the restore of a fresh data folder', () => {
  const api = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
    dailyBackup: (dir: string, target: string, now?: Date) => number;
    latestCopy: (dir: string, target: string) => void;
    restoreFromCopies: (dir: string, source: string) => string[];
  };
  const at = (s: string) => JSON.stringify({ updatedAt: s, steps: { a: 'done' } });

  it('the latest copy follows the source during the day, a broken source does not overwrite it, the profile list is copied', () => {
    const d = tmp();
    const out = join(tmp(), 'copies');
    writeFileSync(join(d, 'progress.json'), '{"a":1}');
    writeFileSync(join(d, 'profiles.json'), '{"active":"main"}');
    api.dailyBackup(d, out, new Date(2026, 9, 2));
    api.latestCopy(d, out);
    writeFileSync(join(d, 'progress.json'), '{"a":2}');
    api.latestCopy(d, out);
    expect(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).toBe('{"a":2}');
    expect(readFileSync(join(out, 'osrs-put-progress-20261002.json'), 'utf8')).toBe('{"a":1}');
    expect(readFileSync(join(out, 'osrs-put-profiles-20261002.json'), 'utf8')).toBe('{"active":"main"}');
    writeFileSync(join(d, 'progress.json'), '{"a":');
    api.latestCopy(d, out);
    expect(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).toBe('{"a":2}');
  });

  it('a new data folder is filled from the freshest valid copy, existing files stay as they are', () => {
    const src = tmp();
    writeFileSync(join(src, 'osrs-put-progress-20261001.json'), at('2026-10-01T10:00:00Z'));
    writeFileSync(join(src, 'osrs-put-progress-20261003.json'), at('2026-10-03T10:00:00Z'));
    writeFileSync(join(src, 'osrs-put-progress-latest.json'), at('2026-10-04T10:00:00Z'));
    writeFileSync(join(src, 'osrs-put-progress-ab12-20261002.json'), '{"updatedAt":');
    writeFileSync(join(src, 'osrs-put-progress-ab12-20261001.json'), at('2026-10-01T09:00:00Z'));
    writeFileSync(join(src, 'osrs-put-profiles-20261003.json'), '{"active":"ab12"}');
    writeFileSync(join(src, 'notes.txt'), 'x');
    const d = tmp();
    writeFileSync(join(d, 'progress-zz.json'), 'mine');
    expect(api.restoreFromCopies(d, src).sort()).toEqual(['profiles.json', 'progress-ab12.json', 'progress.json']);
    expect(JSON.parse(readFileSync(join(d, 'progress.json'), 'utf8')).updatedAt).toBe('2026-10-04T10:00:00Z');
    expect(JSON.parse(readFileSync(join(d, 'progress-ab12.json'), 'utf8')).updatedAt).toBe('2026-10-01T09:00:00Z');
    expect(readFileSync(join(d, 'profiles.json'), 'utf8')).toBe('{"active":"ab12"}');
    // The second launch changes nothing, and a missing copies folder is not an error.
    expect(api.restoreFromCopies(d, src)).toEqual([]);
    expect(api.restoreFromCopies(d, join(src, 'nope'))).toEqual([]);
  });
});
