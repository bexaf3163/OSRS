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
  tag_name: `v${v}`, draft: false, prerelease: false, body: '**Window by the bank** and more\nsecond line', assets: [asset(v, assetOver)], ...over,
});

describe('versions', () => {
  it('parsing and comparison', () => {
    expect(m.parseVersion('v2.24.0')).toEqual([2, 24, 0]);
    expect(m.parseVersion('2.24.0')).toEqual([2, 24, 0]);
    for (const bad of ['2.24', 'v2.24.0-beta', '', null, undefined, 'latest', '1.2.3.4']) expect(m.parseVersion(bad), String(bad)).toBeNull();
    expect(m.isNewer('2.24.0', '2.23.0')).toBe(true);
    expect(m.isNewer('2.10.0', '2.9.0')).toBe(true);
    expect(m.isNewer('3.0.0', '2.99.99')).toBe(true);
    expect(m.isNewer('2.24.0', '2.24.0')).toBe(false);
    expect(m.isNewer('2.23.0', '2.24.0')).toBe(false);
    expect(m.isNewer('garbage', '2.24.0')).toBe(false);
  });
});

describe('what to download from a GitHub release', () => {
  it('a normal release: version, file, address, size, checksum, the first line of the description', () => {
    const r = m.pickRelease(release('2.25.0'));
    expect(r).toMatchObject({ version: '2.25.0', name: 'OSRS-Put-2.25.0-portable.exe', size: SIZE, sha256: 'ab'.repeat(32), notes: 'Window by the bank and more' });
  });

  it('the checksum may be absent — then only the size is checked', () => {
    expect(m.pickRelease(release('2.25.0', {}, { digest: undefined }))?.sha256).toBeNull();
    expect(m.pickRelease(release('2.25.0', {}, { digest: 'md5:abc' }))?.sha256).toBeNull();
  });

  it('a draft, a pre-release, a foreign address, the wrong file, a strange size — are dropped', () => {
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
      release('2.25.0', {}, { size: 'a lot' }),
      release('latest'),
      { tag_name: 'v2.25.0', assets: 'none' },
      null, 'x', [],
    ];
    for (const r of bad) expect(m.pickRelease(r), JSON.stringify(r).slice(0, 80)).toBeNull();
  });
});

describe('a path in the command line', () => {
  it('quotes, &, %, ^ and line breaks are not allowed', () => {
    expect(m.safeForCmd('C:\\Users\\Mark\\Downloads\\OSRS-Put-2.25.0-portable.exe')).toBe(true);
    expect(m.safeForCmd('C:\\My files\\OSRS-Put-2.25.0-portable.exe')).toBe(true);
    for (const bad of ['a"b', 'a&b', 'a%PATH%b', 'a^b', 'a\nb', 'a|b', '', null]) expect(m.safeForCmd(bad), String(bad)).toBe(false);
  });
});

describe('the app update', () => {
  let dir: string;
  let data: string;
  const quit = { n: 0 };
  const spawned: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'osrs-upd-'));
    data = join(dir, 'OSRS-Put-data');
    mkdirSync(data, { recursive: true });
    writeFileSync(join(dir, 'OSRS-Put-2.24.0-portable.exe'), 'old');
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
      spawner: (cmd: string, args: string[], opts: Record<string, unknown>) => { spawned.push({ cmd, args, opts }); return { unref() { /* nothing */ } }; },
      ...over,
    });
    return { u, states };
  };

  it('a new version: check → download → ready → restart; the old exe is marked for deletion', async () => {
    const { u, states } = make();
    await u.check();
    expect(u.state).toMatchObject({ state: 'available', latest: '2.25.0', canInstall: true });
    expect(u.install(), 'not downloaded yet — cannot install').toBe(false);
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

  it('the same or an older version — "latest"', async () => {
    const { u } = make({ fetchRelease: async () => release('2.24.0') });
    await u.check();
    expect(u.state.state).toBe('current');
    const { u: u2 } = make({ fetchRelease: async () => release('2.23.0') });
    await u2.check();
    expect(u2.state.state).toBe('current');
  });

  it('what was downloaded last time is not downloaded again', async () => {
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

  it('a partly downloaded file of another size is not considered ready', async () => {
    writeFileSync(join(dir, 'OSRS-Put-2.25.0-portable.exe'), 'stub');
    const { u } = make();
    await u.check();
    expect(u.state.state).toBe('available');
  });

  it('a network failure and a download failure — an error with text, the program is intact', async () => {
    const { u } = make({ fetchRelease: async () => { throw new Error('no network'); } });
    await u.check();
    expect(u.state).toMatchObject({ state: 'error', error: 'no network' });
    const { u: u2 } = make({ downloader: async () => { throw new Error('the checksum did not match'); } });
    await u2.check();
    await u2.download();
    expect(u2.state).toMatchObject({ state: 'error', error: 'the checksum did not match' });
    expect(u2.install()).toBe(false);
    expect(quit.n).toBe(0);
  });

  it('not a portable build: reports a new version, but does not download or install', async () => {
    const { u } = make({}, { PORTABLE_EXECUTABLE_FILE: '', PORTABLE_EXECUTABLE_DIR: '' });
    await u.check();
    expect(u.state).toMatchObject({ state: 'available', canInstall: false });
    await u.download();
    expect(u.state.state).toBe('available');
    expect(u.install()).toBe(false);
  });

  it('an unsafe path does not go into the command line', async () => {
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

  describe('cleaning up the previous exe when the new version starts', () => {
    const note = (old: string) => writeFileSync(join(data, 'update-cleanup.json'), JSON.stringify({ delete: old }));

    it('deletes the previous one if it is older and lies next to it', () => {
      const old = join(dir, 'OSRS-Put-2.24.0-portable.exe');
      note(old);
      const { u } = make({ version: '2.25.0' }, { PORTABLE_EXECUTABLE_FILE: join(dir, 'OSRS-Put-2.25.0-portable.exe') });
      u.cleanup();
      expect(existsSync(old)).toBe(false);
      expect(existsSync(join(data, 'update-cleanup.json'))).toBe(false);
    });

    it('does not touch a file newer than the running version, a foreign name and a foreign folder', () => {
      const newer = join(dir, 'OSRS-Put-2.26.0-portable.exe');
      writeFileSync(newer, 'x');
      note(newer);
      make({ version: '2.25.0' }).u.cleanup();
      expect(existsSync(newer)).toBe(true);
      expect(existsSync(join(data, 'update-cleanup.json'))).toBe(false);

      const other = join(dir, 'documents.docx');
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

    it('without a record or with garbage in it — nothing happens', () => {
      make().u.cleanup();
      writeFileSync(join(data, 'update-cleanup.json'), 'not json');
      make().u.cleanup();
      expect(existsSync(join(dir, 'OSRS-Put-2.24.0-portable.exe'))).toBe(true);
    });
  });
});
