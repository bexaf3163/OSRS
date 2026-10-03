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

describe('файл прогресса', () => {
  it('целый файл читается как есть, отсутствующий — null', () => {
    const d = tmp();
    expect(readProgress(d)).toBeNull();
    writeFileSync(join(d, 'progress.json'), '{"version":3}');
    expect(readProgress(d)).toBe('{"version":3}');
    expect(readdirSync(d)).toEqual(['progress.json']);
  });

  it('битый файл откладывается целиком, а не пропадает; хранятся три последних', () => {
    const d = tmp();
    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(d, 'progress.json'), `{"steps":{"S1-01":"do${i}`);
      expect(readProgress(d, new Date(Date.UTC(2026, 8, 28, 12, 0, i)))).toBeNull();
    }
    const broken = readdirSync(d).filter((n) => n.startsWith('progress.broken-')).sort();
    expect(broken).toEqual(['progress.broken-20260928T120003.json', 'progress.broken-20260928T120004.json', 'progress.broken-20260928T120005.json']);
    expect(readFileSync(join(d, broken[2]), 'utf8')).toBe('{"steps":{"S1-01":"do5');
  });

  it('копия делается только с целого файла и не затирает хорошую битой', () => {
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

describe('профили и копия по расписанию', () => {
  const api = createRequire(import.meta.url)('../electron/progress-files.cjs') as {
    readProgress: (dir: string, now?: Date, name?: string) => string | null;
    backupProgress: (dir: string, name?: string) => void;
    dailyBackup: (dir: string, target: string, now?: Date) => number;
  };

  it('у каждого профиля свой файл, битый откладывается под своим именем', () => {
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

  it('копия по расписанию: раз в сутки, по файлу на профиль, сегодняшняя не затирается, хранятся 14', () => {
    const d = tmp();
    const out = join(tmp(), 'копии');
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
    // Профиль «xy» не съеден основным при удалении старых.
    expect(readdirSync(out).filter((n) => n.startsWith('osrs-put-progress-xy-'))).toHaveLength(14);
    // Битый файл не копируется.
    writeFileSync(join(d, 'progress.json'), '{"a":');
    expect(api.dailyBackup(d, out, new Date(2026, 9, 21))).toBe(1);
  });
});
