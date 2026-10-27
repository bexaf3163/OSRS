import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const { backupProgress, readProgress } = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
  backupProgress: (dir: string) => void;
  readProgress: (dir: string, now?: Date, name?: string, includeInvalid?: boolean) => string | null;
};

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'osrs-progress-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('the progress file', () => {
  it('the renderer can distinguish a damaged file from a new installation without losing its recovery copy', () => {
    const d = tmp();
    const raw = '{"version":3,"steps":';
    writeFileSync(join(d, 'progress.json'), raw);
    const at = new Date('2026-10-20T10:00:00Z');
    expect(readProgress(d, at, 'progress.json', true)).toBe(raw);
    expect(readFileSync(join(d, 'progress.json'), 'utf8')).toBe(raw);
    expect(readFileSync(join(d, 'progress.broken-20261020T100000.json'), 'utf8')).toBe(raw);
    expect(readProgress(tmp(), at, 'progress.json', true)).toBeNull();
  });
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
    writeFileSync(join(d, 'progress.json'), '{"version":3,"steps":{},"ok":1}');
    backupProgress(d);
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe('{"version":3,"steps":{},"ok":1}');
    writeFileSync(join(d, 'progress.json'), '{"version":');
    backupProgress(d);
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe('{"version":3,"steps":{},"ok":1}');
  });

  // T01: the first-write copy reported nothing when it failed; the shell now records what happened and shows a failure in Settings.
  it('says what the first-write copy did, and throws an I/O failure instead of hiding it', () => {
    const api = createRequire(import.meta.url)('../electron/progress-files.cjs') as { backupProgress: (dir: string) => string };
    const d = tmp();
    expect(api.backupProgress(d)).toBe('none');
    writeFileSync(join(d, 'progress.json'), '{"version":');
    expect(api.backupProgress(d)).toBe('skipped');
    writeFileSync(join(d, 'progress.json'), '{"version":3,"steps":{}}');
    writeFileSync(join(d, 'progress.bak.json'), '{damaged earlier copy');
    expect(api.backupProgress(d)).toBe('kept');
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe('{damaged earlier copy');
    rmSync(join(d, 'progress.bak.json'));
    expect(api.backupProgress(d)).toBe('copied');
    // A folder where the copy should be: the copy cannot be written, and the caller hears about it.
    rmSync(join(d, 'progress.bak.json'));
    mkdirSync(join(d, 'progress.bak.json'));
    expect(() => api.backupProgress(d)).toThrow();
  });
});

describe('profiles and the scheduled copy', () => {
  const api = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
    readProgress: (dir: string, now?: Date, name?: string) => string | null;
    backupProgress: (dir: string, name?: string) => void;
    dailyBackup: (dir: string, target: string, now?: Date, onSkipped?: (file: string, kind: string) => void) => number;
  };

  it('each profile has its own file, a broken one is set aside under its own name', () => {
    const d = tmp();
    writeFileSync(join(d, 'progress-ab12.json'), '{"x":1}');
    expect(api.readProgress(d, new Date(), 'progress-ab12.json')).toBe('{"x":1}');
    expect(api.readProgress(d, new Date(), 'progress.json')).toBeNull();
    writeFileSync(join(d, 'progress-ab12.json'), '{"x":');
    expect(api.readProgress(d, new Date(Date.UTC(2026, 9, 2, 1, 2, 3)), 'progress-ab12.json')).toBeNull();
    expect(readdirSync(d).filter((n) => n.includes('broken'))).toEqual(['progress-ab12.broken-20261002T010203.json']);
    writeFileSync(join(d, 'progress-ab12.json'), '{"steps":{},"x":2}');
    api.backupProgress(d, 'progress-ab12.json');
    expect(readFileSync(join(d, 'progress-ab12.bak.json'), 'utf8')).toBe('{"steps":{},"x":2}');
  });

  it('scheduled copy: once a day, one file per profile, today\'s is not overwritten, 14 are kept', () => {
    const d = tmp();
    const out = join(tmp(), 'copies');
    writeFileSync(join(d, 'progress.json'), '{"steps":{},"a":1}');
    writeFileSync(join(d, 'progress-xy.json'), '{"steps":{},"b":2}');
    writeFileSync(join(d, 'progress.bak.json'), '{"old":1}');
    writeFileSync(join(d, 'ui.json'), '{}');
    expect(api.dailyBackup(d, out, new Date(2026, 9, 2))).toBe(2);
    expect(readdirSync(out).sort()).toEqual(['osrs-put-progress-20261002.json', 'osrs-put-progress-xy-20261002.json']);
    writeFileSync(join(d, 'progress.json'), '{"steps":{},"a":99}');
    expect(api.dailyBackup(d, out, new Date(2026, 9, 2))).toBe(0);
    expect(readFileSync(join(out, 'osrs-put-progress-20261002.json'), 'utf8')).toBe('{"steps":{},"a":1}');
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
    dailyBackup: (dir: string, target: string, now?: Date, onSkipped?: (file: string, kind: string) => void) => number;
    latestCopy: (dir: string, target: string) => void;
    restoreFromCopies: (dir: string, source: string, replaceOlder?: boolean) => string[];
  };
  const at = (s: string) => JSON.stringify({ updatedAt: s, steps: { a: 'done' } });

  it.each(['dailyBackup', 'latestCopy'] as const)('%s reports unreadable sources while still copying healthy profiles, then recovers', method => {
    const d = tmp();
    const out = tmp();
    const good = at('2026-10-24T10:00:00Z');
    const blocked = join(d, 'progress-alt.json');
    mkdirSync(blocked); // Portable real-filesystem read failure without changing ACLs.
    writeFileSync(join(d, 'progress.json'), good);
    expect(() => api[method](d, out)).toThrow(expect.objectContaining({ code: 'COPY_INCOMPLETE' }));
    const copied = readdirSync(out).filter(n => n.startsWith('osrs-put-progress-'));
    expect(copied).toHaveLength(1);
    expect(readFileSync(join(out, copied[0]), 'utf8')).toBe(good);
    expect(existsSync(blocked)).toBe(true);
    rmdirSync(blocked); // Empty disposable directory only.
    writeFileSync(blocked, good);
    expect(() => api[method](d, out)).not.toThrow();
    expect(readdirSync(out).filter(n => n.startsWith('osrs-put-progress-alt-'))).toHaveLength(1);
  });

  it('an unreadable latest destination is retained and reported without preventing another profile copy', () => {
    const d = tmp();
    const out = tmp();
    const good = at('2026-10-24T10:00:00Z');
    writeFileSync(join(d, 'progress.json'), good);
    writeFileSync(join(d, 'progress-alt.json'), good);
    const blocked = join(out, 'osrs-put-progress-latest.json');
    mkdirSync(blocked);
    expect(() => api.latestCopy(d, out)).toThrow(expect.objectContaining({ code: 'COPY_INCOMPLETE' }));
    expect(readFileSync(join(out, 'osrs-put-progress-alt-latest.json'), 'utf8')).toBe(good);
    expect(existsSync(blocked)).toBe(true);
    rmdirSync(blocked);
    expect(() => api.latestCopy(d, out)).not.toThrow();
    expect(readFileSync(blocked, 'utf8')).toBe(good);
  });

  it.each(['null', '[]', '{"unrelated":true}', '{"version":99,"steps":{}}', '{"app":"another-app","steps":{}}'])('invalid/unsupported progress cannot replace backup copies: %s', raw => {
    const d = tmp();
    const out = tmp();
    const good = at('2026-10-05T10:00:00Z');
    writeFileSync(join(d, 'progress.json'), good);
    backupProgress(d);
    api.latestCopy(d, out);
    writeFileSync(join(d, 'progress.json'), raw);
    backupProgress(d);
    api.latestCopy(d, out);
    expect(api.dailyBackup(d, out, new Date(2026, 9, 6))).toBe(0);
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe(good);
    expect(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).toBe(good);
    expect(readFileSync(join(d, 'progress.json'), 'utf8')).toBe(raw);
  });

  it('unknown existing latest/session copies are retained for explicit recovery', () => {
    const d = tmp();
    const out = tmp();
    const future = '{"version":99,"steps":{}}';
    writeFileSync(join(d, 'progress.json'), at('2026-10-05T10:00:00Z'));
    writeFileSync(join(d, 'progress.bak.json'), future);
    writeFileSync(join(out, 'osrs-put-progress-latest.json'), future);
    backupProgress(d);
    api.latestCopy(d, out);
    expect(readFileSync(join(d, 'progress.bak.json'), 'utf8')).toBe(future);
    expect(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).toBe(future);
    expect(api.dailyBackup(d, out, new Date(2026, 9, 6))).toBe(1);
    expect(readFileSync(join(out, 'osrs-put-progress-20261006.json'), 'utf8')).toBe(at('2026-10-05T10:00:00Z'));
  });

  it('malformed profile rows do not replace good latest copies or create dated copies', () => {
    const d = tmp();
    const out = tmp();
    const good = '{"active":"alt","list":[{"id":"main"},{"id":"alt","player":"Alt tester"}]}';
    const bad = '{"active":"alt","list":[null]}';
    writeFileSync(join(d, 'profiles.json'), good);
    api.latestCopy(d, out);
    writeFileSync(join(d, 'profiles.json'), bad);
    api.latestCopy(d, out);
    expect(api.dailyBackup(d, out)).toBe(0);
    expect(readFileSync(join(out, 'osrs-put-profiles-latest.json'), 'utf8')).toBe(good);
    expect(readFileSync(join(d, 'profiles.json'), 'utf8')).toBe(bad);
  });

  it('daily rotation retains unknown old copies while bounding supported dated copies', () => {
    const d = tmp();
    const out = tmp();
    const future = '{"version":99,"steps":{}}';
    writeFileSync(join(out, 'osrs-put-progress-20260901.json'), future);
    writeFileSync(join(d, 'progress.json'), at('2026-10-05T10:00:00Z'));
    for (let day = 1; day <= 20; day++) api.dailyBackup(d, out, new Date(2026, 9, day));
    expect(readFileSync(join(out, 'osrs-put-progress-20260901.json'), 'utf8')).toBe(future);
    expect(readdirSync(out).filter(n => /^osrs-put-progress-202610\d{2}\.json$/.test(n))).toHaveLength(14);
  });

  it.each(['null', '[]', '{"unrelated":true}', '{"version":99,"steps":{},"updatedAt":"2099-01-01T00:00:00Z"}', '{"app":"another-app","version":3,"steps":{}}'])('does not restore a newer JSON record which is not supported progress: %s', raw => {
    const source = tmp();
    const good = at('2026-10-05T10:00:00Z');
    writeFileSync(join(source, 'osrs-put-progress-20261005.json'), good);
    writeFileSync(join(source, 'osrs-put-progress-latest.json'), raw);
    const destination = tmp();
    expect(api.restoreFromCopies(destination, source)).toEqual(['progress.json']);
    expect(readFileSync(join(destination, 'progress.json'), 'utf8')).toBe(good);
    expect(readFileSync(join(source, 'osrs-put-progress-latest.json'), 'utf8')).toBe(raw);
    const invalidOnly = tmp();
    writeFileSync(join(invalidOnly, 'osrs-put-progress-latest.json'), raw);
    const empty = tmp();
    expect(api.restoreFromCopies(empty, invalidOnly)).toEqual([]);
    expect(existsSync(join(empty, 'progress.json'))).toBe(false);
  });

  it('does not normalize a malformed copied profile list over a valid older one', () => {
    const source = tmp();
    const good = JSON.stringify({ active: 'alt', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Alt' }] });
    writeFileSync(join(source, 'osrs-put-profiles-20261005.json'), good);
    writeFileSync(join(source, 'osrs-put-profiles-latest.json'), '{"active":"alt","list":[null]}');
    const destination = tmp();
    expect(api.restoreFromCopies(destination, source)).toEqual(['profiles.json']);
    expect(readFileSync(join(destination, 'profiles.json'), 'utf8')).toBe(good);
  });

  it('a fresh-folder refresh cannot overwrite an existing unsupported source', () => {
    const source = tmp();
    writeFileSync(join(source, 'osrs-put-progress-latest.json'), at('2026-10-05T10:00:00Z'));
    const destination = tmp();
    const future = '{"version":99,"steps":{},"updatedAt":"2026-10-01T00:00:00Z"}';
    writeFileSync(join(destination, 'progress.json'), future);
    expect(api.restoreFromCopies(destination, source, true)).toEqual([]);
    expect(readFileSync(join(destination, 'progress.json'), 'utf8')).toBe(future);
  });

  it('the latest copy follows the source during the day, a broken source does not overwrite it, the profile list is copied', () => {
    const d = tmp();
    const out = join(tmp(), 'copies');
    writeFileSync(join(d, 'progress.json'), '{"steps":{},"a":1}');
    writeFileSync(join(d, 'profiles.json'), '{"active":"main","list":[{"id":"main","name":"Main"}]}');
    api.dailyBackup(d, out, new Date(2026, 9, 2));
    api.latestCopy(d, out);
    writeFileSync(join(d, 'progress.json'), '{"steps":{},"a":2}');
    api.latestCopy(d, out);
    expect(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).toBe('{"steps":{},"a":2}');
    expect(readFileSync(join(out, 'osrs-put-progress-20261002.json'), 'utf8')).toBe('{"steps":{},"a":1}');
    expect(readFileSync(join(out, 'osrs-put-profiles-20261002.json'), 'utf8')).toBe('{"active":"main","list":[{"id":"main","name":"Main"}]}');
    writeFileSync(join(d, 'progress.json'), '{"a":');
    api.latestCopy(d, out);
    expect(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).toBe('{"steps":{},"a":2}');
  });

  it('a new data folder is filled from the freshest valid copy, existing files stay as they are', () => {
    const src = tmp();
    writeFileSync(join(src, 'osrs-put-progress-20261001.json'), at('2026-10-01T10:00:00Z'));
    writeFileSync(join(src, 'osrs-put-progress-20261003.json'), at('2026-10-03T10:00:00Z'));
    writeFileSync(join(src, 'osrs-put-progress-latest.json'), at('2026-10-04T10:00:00Z'));
    writeFileSync(join(src, 'osrs-put-progress-ab12-20261002.json'), '{"updatedAt":');
    writeFileSync(join(src, 'osrs-put-progress-ab12-20261001.json'), at('2026-10-01T09:00:00Z'));
    writeFileSync(join(src, 'osrs-put-profiles-20261003.json'), '{"active":"ab12","list":[{"id":"main","name":"Main"},{"id":"ab12","name":"Alt"}]}');
    writeFileSync(join(src, 'notes.txt'), 'x');
    const d = tmp();
    writeFileSync(join(d, 'progress-zz.json'), 'mine');
    expect(api.restoreFromCopies(d, src).sort()).toEqual(['profiles.json', 'progress-ab12.json', 'progress.json']);
    expect(JSON.parse(readFileSync(join(d, 'progress.json'), 'utf8')).updatedAt).toBe('2026-10-04T10:00:00Z');
    expect(JSON.parse(readFileSync(join(d, 'progress-ab12.json'), 'utf8')).updatedAt).toBe('2026-10-01T09:00:00Z');
    expect(readFileSync(join(d, 'profiles.json'), 'utf8')).toBe('{"active":"ab12","list":[{"id":"main","name":"Main"},{"id":"ab12","name":"Alt"}]}');
    // The second launch changes nothing, and a missing copies folder is not an error.
    expect(api.restoreFromCopies(d, src)).toEqual([]);
    expect(api.restoreFromCopies(d, join(src, 'nope'))).toEqual([]);
  });

  it('a stale or fresh data folder never replaces the latest copy', () => {
    const d = tmp();
    const out = join(tmp(), 'copies');
    writeFileSync(join(d, 'progress.json'), at('2026-10-05T10:00:00Z'));
    api.latestCopy(d, out);
    // Another data folder (a new install, a test run) with an OLDER state is skipped…
    writeFileSync(join(d, 'progress.json'), at('2026-10-05T08:00:00Z'));
    api.latestCopy(d, out);
    expect(JSON.parse(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).updatedAt).toBe('2026-10-05T10:00:00Z');
    // …and a newer one (also a deliberate reset) goes through.
    writeFileSync(join(d, 'progress.json'), at('2026-10-05T11:00:00Z'));
    api.latestCopy(d, out);
    expect(JSON.parse(readFileSync(join(out, 'osrs-put-progress-latest.json'), 'utf8')).updatedAt).toBe('2026-10-05T11:00:00Z');
  });

  it('a just-created data folder holding an older state is refreshed from a newer copy, but not the other way round', () => {
    const src = tmp();
    writeFileSync(join(src, 'osrs-put-progress-latest.json'), at('2026-10-05T10:00:00Z'));
    const stale = tmp();
    writeFileSync(join(stale, 'progress.json'), at('2026-10-05T08:00:00Z'));
    expect(api.restoreFromCopies(stale, src)).toEqual([]);
    expect(api.restoreFromCopies(stale, src, true)).toEqual(['progress.json']);
    expect(JSON.parse(readFileSync(join(stale, 'progress.json'), 'utf8')).updatedAt).toBe('2026-10-05T10:00:00Z');
    const newerHere = tmp();
    writeFileSync(join(newerHere, 'progress.json'), at('2026-10-05T12:00:00Z'));
    expect(api.restoreFromCopies(newerHere, src, true)).toEqual([]);
  });
});


describe('skipped copy diagnostics preserve every protected record', () => {
  const api = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
    dailyBackup(dir: string, target: string, now?: Date, onSkipped?: (file: string, kind: string) => void): number;
    latestCopy(dir: string, target: string, onSkipped?: (file: string, kind: string) => void): void;
  };
  it.each(['{broken', '{"version":99,"steps":{}}'])('reports skipped source while copying healthy profiles: %s', raw => {
    const d = tmp(), out = tmp();
    const good = '{"version":3,"steps":{"S1-01":"done"}}';
    writeFileSync(join(d, 'progress.json'), raw);
    writeFileSync(join(d, 'progress-alt.json'), good);
    const skipped: [string, string][] = [];
    const report = (file: string, kind: string) => skipped.push([file, kind]);
    expect(api.dailyBackup(d, out, new Date(2026, 9, 27), report)).toBe(1);
    api.latestCopy(d, out, report);
    expect(skipped).toEqual([['progress.json', 'source'], ['progress.json', 'source']]);
    expect(readFileSync(join(d, 'progress.json'), 'utf8')).toBe(raw);
    expect(readFileSync(join(out, 'osrs-put-progress-alt-latest.json'), 'utf8')).toBe(good);
    expect(readFileSync(join(out, 'osrs-put-progress-alt-20261027.json'), 'utf8')).toBe(good);
  });
  it('names protected latest and current daily destinations without overwriting either', () => {
    const d = tmp(), out = tmp();
    writeFileSync(join(d, 'progress.json'), '{"version":3,"steps":{}}');
    const raw = '{"version":99,"steps":{}}';
    const names = ['osrs-put-progress-latest.json', 'osrs-put-progress-20261027.json'];
    for (const name of names) writeFileSync(join(out, name), raw);
    const skipped: [string, string][] = [];
    const report = (file: string, kind: string) => skipped.push([file, kind]);
    expect(api.dailyBackup(d, out, new Date(2026, 9, 27), report)).toBe(0);
    api.latestCopy(d, out, report);
    expect(skipped).toEqual([[names[1], 'copy'], [names[0], 'copy']]);
    for (const name of names) expect(readFileSync(join(out, name), 'utf8')).toBe(raw);
  });
});
