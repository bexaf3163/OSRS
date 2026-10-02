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
