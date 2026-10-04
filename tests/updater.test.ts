import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

type Rel = { version: string; name: string; url: string; size: number; sha256: string | null; notes: string };
interface Updater {
  state: { state: string; latest: string | null; progress: number; error: string | null; canInstall: boolean };
  check(): Promise<unknown>;
  download(): Promise<unknown>;
  install(): boolean;
  cleanup(): void;
}
const m = createRequire(import.meta.url)('../electron/updater.cjs') as {
  createUpdater(o: Record<string, unknown>): Updater;
  pickRelease(r: unknown): Rel | null;
  parseVersion(v: unknown): number[] | null;
  isNewer(a: string, b: string): boolean;
  safeForCmd(p: unknown): boolean;
};

const SIZE = 25 * 1024 * 1024;
const asset = (v: string, over: Record<string, unknown> = {}) => ({
  name: `OSRS-Put-${v}-portable.exe`,
  size: SIZE,
  browser_download_url: `https://github.com/bexaf3163/OSRS/releases/download/v${v}/OSRS-Put-${v}-portable.exe`,
  digest: `sha256:${'ab'.repeat(32)}`,
  ...over,
});
const release = (v: string, over: Record<string, unknown> = {}, assetOver: Record<string, unknown> = {}) => ({
  tag_name: `v${v}`, draft: false, prerelease: false, body: '**Окно у банка** и ещё\nвторая строка', assets: [asset(v, assetOver)], ...over,
});

describe('версии', () => {
  it('разбор и сравнение', () => {
    expect(m.parseVersion('v2.24.0')).toEqual([2, 24, 0]);
    expect(m.parseVersion('2.24.0')).toEqual([2, 24, 0]);
    for (const bad of ['2.24', 'v2.24.0-beta', '', null, undefined, 'latest', '1.2.3.4']) expect(m.parseVersion(bad), String(bad)).toBeNull();
    expect(m.isNewer('2.24.0', '2.23.0')).toBe(true);
    expect(m.isNewer('2.10.0', '2.9.0')).toBe(true);
    expect(m.isNewer('3.0.0', '2.99.99')).toBe(true);
    expect(m.isNewer('2.24.0', '2.24.0')).toBe(false);
    expect(m.isNewer('2.23.0', '2.24.0')).toBe(false);
    expect(m.isNewer('мусор', '2.24.0')).toBe(false);
  });
});

describe('что скачивать из выпуска GitHub', () => {
  it('нормальный выпуск: версия, файл, адрес, размер, сумма, первая строка описания', () => {
    const r = m.pickRelease(release('2.25.0'));
    expect(r).toMatchObject({ version: '2.25.0', name: 'OSRS-Put-2.25.0-portable.exe', size: SIZE, sha256: 'ab'.repeat(32), notes: 'Окно у банка и ещё' });
  });

  it('суммы может не быть — тогда проверяется только размер', () => {
    expect(m.pickRelease(release('2.25.0', {}, { digest: undefined }))?.sha256).toBeNull();
    expect(m.pickRelease(release('2.25.0', {}, { digest: 'md5:abc' }))?.sha256).toBeNull();
  });

  it('черновик, предварительный, чужой адрес, не тот файл, странный размер — отбрасываются', () => {
    const bad = [
      release('2.25.0', { draft: true }),
      release('2.25.0', { prerelease: true }),
      release('2.25.0', {}, { browser_download_url: 'https://evil.example/OSRS-Put-2.25.0-portable.exe' }),
      release('2.25.0', {}, { browser_download_url: 'https://github.com/other/repo/releases/download/v2.25.0/OSRS-Put-2.25.0-portable.exe' }),
      release('2.25.0', {}, { browser_download_url: 'http://github.com/bexaf3163/OSRS/releases/download/v2.25.0/OSRS-Put-2.25.0-portable.exe' }),
      release('2.25.0', {}, { name: 'OSRS-Put-2.24.0-portable.exe' }),
      release('2.25.0', {}, { name: 'setup.exe', browser_download_url: 'https://github.com/bexaf3163/OSRS/releases/download/v2.25.0/setup.exe' }),
      release('2.25.0', {}, { size: 1000 }),
      release('2.25.0', {}, { size: 5 * 1024 ** 3 }),
      release('2.25.0', {}, { size: 'много' }),
      release('latest'),
      { tag_name: 'v2.25.0', assets: 'нет' },
      null, 'x', [],
    ];
    for (const r of bad) expect(m.pickRelease(r), JSON.stringify(r).slice(0, 80)).toBeNull();
  });
});

describe('путь в командной строке', () => {
  it('кавычки, &, %, ^ и переводы строки не допускаются', () => {
    expect(m.safeForCmd('C:\\Users\\Mark\\Downloads\\OSRS-Put-2.25.0-portable.exe')).toBe(true);
    expect(m.safeForCmd('C:\\Мои файлы\\OSRS-Put-2.25.0-portable.exe')).toBe(true);
    for (const bad of ['a"b', 'a&b', 'a%PATH%b', 'a^b', 'a\nb', 'a|b', '', null]) expect(m.safeForCmd(bad), String(bad)).toBe(false);
  });
});

describe('обновление приложения', () => {
  let dir: string;
  let data: string;
  const quit = { n: 0 };
  const spawned: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'osrs-upd-'));
    data = join(dir, 'OSRS-Put-data');
    mkdirSync(data, { recursive: true });
    writeFileSync(join(dir, 'OSRS-Put-2.24.0-portable.exe'), 'старая');
    quit.n = 0;
    spawned.length = 0;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const make = (over: Record<string, unknown> = {}, env: Record<string, string> = {}) => {
    const states: string[] = [];
    const u = m.createUpdater({
      version: '2.24.0',
      env: { PORTABLE_EXECUTABLE_FILE: join(dir, 'OSRS-Put-2.24.0-portable.exe'), PORTABLE_EXECUTABLE_DIR: dir, ComSpec: 'cmd.exe', ...env },
      userData: data,
      onState: (s: { state: string }) => states.push(s.state),
      quit: () => { quit.n++; },
      fetchRelease: async () => release('2.25.0'),
      downloader: async (rel: Rel, dest: string, onProgress: (p: number) => void) => { onProgress(0.5); writeFileSync(dest, ''); truncateSync(dest, rel.size); onProgress(1); },
      spawner: (cmd: string, args: string[], opts: Record<string, unknown>) => { spawned.push({ cmd, args, opts }); return { unref() { /* ничего */ } }; },
      ...over,
    });
    return { u, states };
  };

  it('новая версия: проверка → скачать → готово → перезапуск; старый exe помечен на удаление', async () => {
    const { u, states } = make();
    await u.check();
    expect(u.state).toMatchObject({ state: 'available', latest: '2.25.0', canInstall: true });
    expect(u.install(), 'пока не скачано — нельзя').toBe(false);
    await u.download();
    expect(u.state.state).toBe('ready');
    expect(existsSync(join(dir, 'OSRS-Put-2.25.0-portable.exe'))).toBe(true);
    expect(states).toContain('downloading');
    expect(u.install()).toBe(true);
    expect(quit.n).toBe(1);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].opts).toMatchObject({ detached: true, windowsVerbatimArguments: true });
    expect(spawned[0].args.join(' ')).toContain(`start "" "${join(dir, 'OSRS-Put-2.25.0-portable.exe')}"`);
    expect(JSON.parse(readFileSync(join(data, 'update-cleanup.json'), 'utf8')).delete).toBe(join(dir, 'OSRS-Put-2.24.0-portable.exe'));
  });

  it('та же или более старая версия — «последняя»', async () => {
    const { u } = make({ fetchRelease: async () => release('2.24.0') });
    await u.check();
    expect(u.state.state).toBe('current');
    const { u: u2 } = make({ fetchRelease: async () => release('2.23.0') });
    await u2.check();
    expect(u2.state.state).toBe('current');
  });

  it('уже скачанное прошлый раз не качается снова', async () => {
    const f = join(dir, 'OSRS-Put-2.25.0-portable.exe');
    writeFileSync(f, '');
    truncateSync(f, SIZE);
    let downloads = 0;
    const { u } = make({ downloader: async () => { downloads++; } });
    await u.check();
    expect(u.state.state).toBe('ready');
    await u.download();
    expect(downloads).toBe(0);
  });

  it('недокачанный файл другого размера не считается готовым', async () => {
    writeFileSync(join(dir, 'OSRS-Put-2.25.0-portable.exe'), 'обрывок');
    const { u } = make();
    await u.check();
    expect(u.state.state).toBe('available');
  });

  it('сбой сети и сбой загрузки — ошибка с текстом, программа цела', async () => {
    const { u } = make({ fetchRelease: async () => { throw new Error('нет сети'); } });
    await u.check();
    expect(u.state).toMatchObject({ state: 'error', error: 'нет сети' });
    const { u: u2 } = make({ downloader: async () => { throw new Error('контрольная сумма не сошлась'); } });
    await u2.check();
    await u2.download();
    expect(u2.state).toMatchObject({ state: 'error', error: 'контрольная сумма не сошлась' });
    expect(u2.install()).toBe(false);
    expect(quit.n).toBe(0);
  });

  it('не переносная сборка: сообщает о новой версии, но не качает и не ставит', async () => {
    const { u } = make({}, { PORTABLE_EXECUTABLE_FILE: '', PORTABLE_EXECUTABLE_DIR: '' });
    await u.check();
    expect(u.state).toMatchObject({ state: 'available', canInstall: false });
    await u.download();
    expect(u.state.state).toBe('available');
    expect(u.install()).toBe(false);
  });

  it('небезопасный путь не уходит в командную строку', async () => {
    const odd = join(dir, 'a&b');
    mkdirSync(odd);
    writeFileSync(join(odd, 'OSRS-Put-2.24.0-portable.exe'), 'x');
    const { u } = make({}, { PORTABLE_EXECUTABLE_FILE: join(odd, 'OSRS-Put-2.24.0-portable.exe'), PORTABLE_EXECUTABLE_DIR: odd });
    await u.check();
    await u.download();
    expect(u.state.state).toBe('ready');
    expect(u.install()).toBe(false);
    expect(spawned).toHaveLength(0);
    expect(quit.n).toBe(0);
  });

  describe('уборка прежнего exe при запуске новой версии', () => {
    const note = (old: string) => writeFileSync(join(data, 'update-cleanup.json'), JSON.stringify({ delete: old }));

    it('удаляет прежний, если он старше и лежит рядом', () => {
      const old = join(dir, 'OSRS-Put-2.24.0-portable.exe');
      note(old);
      const { u } = make({ version: '2.25.0' }, { PORTABLE_EXECUTABLE_FILE: join(dir, 'OSRS-Put-2.25.0-portable.exe') });
      u.cleanup();
      expect(existsSync(old)).toBe(false);
      expect(existsSync(join(data, 'update-cleanup.json'))).toBe(false);
    });

    it('не трогает файл новее запущенной версии, чужое имя и чужую папку', () => {
      const newer = join(dir, 'OSRS-Put-2.26.0-portable.exe');
      writeFileSync(newer, 'x');
      note(newer);
      make({ version: '2.25.0' }).u.cleanup();
      expect(existsSync(newer)).toBe(true);
      expect(existsSync(join(data, 'update-cleanup.json'))).toBe(false);

      const other = join(dir, 'документы.docx');
      writeFileSync(other, 'x');
      note(other);
      make({ version: '2.25.0' }).u.cleanup();
      expect(existsSync(other)).toBe(true);

      const elsewhere = mkdtempSync(join(tmpdir(), 'osrs-else-'));
      const foreign = join(elsewhere, 'OSRS-Put-2.20.0-portable.exe');
      writeFileSync(foreign, 'x');
      note(foreign);
      make({ version: '2.25.0' }).u.cleanup();
      expect(existsSync(foreign)).toBe(true);
      rmSync(elsewhere, { recursive: true, force: true });
    });

    it('без записи или с мусором в ней — ничего не происходит', () => {
      make().u.cleanup();
      writeFileSync(join(data, 'update-cleanup.json'), 'не json');
      make().u.cleanup();
      expect(existsSync(join(dir, 'OSRS-Put-2.24.0-portable.exe'))).toBe(true);
    });
  });
});
