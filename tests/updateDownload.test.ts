// T02: the real download path against a scripted connection: a connection that drops, closes early, sends other bytes or is cancelled
// leaves no partial file and never touches the destination; a retry afterwards installs the verified file.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Rel = { version: string; name: string; url: string; size: number; sha256: string | null; notes: string };
type Getter = (url: string, headers: unknown, onResponse: (res: PassThrough & { statusCode: number }) => void, onError: (e: Error) => void) => { destroy(): void };
const m = createRequire(import.meta.url)('../electron/updater.cjs') as {
  download(rel: Rel, dest: string, onProgress: (p: number) => void, o?: { signal?: AbortSignal; getter?: Getter }): Promise<void>;
  createUpdater(o: Record<string, unknown>): {
    state: { state: string; error: string | null };
    check(): Promise<unknown>; download(): Promise<unknown>; cancel(): unknown;
  };
};

const BYTES = Buffer.from('x'.repeat(64 * 1024));
const rel: Rel = { version: '2.99.0', name: 'OSRS-Put-2.99.0-portable.exe', url: 'https://github.com/x', size: BYTES.length, sha256: createHash('sha256').update(BYTES).digest('hex'), notes: '' };

/** A connection that sends `parts` one tick apart and then does `end` ('end', 'error' or 'hang'). */
function scripted(parts: Buffer[], end: 'end' | 'error' | 'hang', status = 200): Getter & { started: Promise<void> } {
  let started!: () => void;
  const ready = new Promise<void>((r) => { started = r; });
  const g = ((_url: string, _h: unknown, onResponse: (res: PassThrough & { statusCode: number }) => void) => {
    const res = Object.assign(new PassThrough(), { statusCode: status });
    setImmediate(() => {
      onResponse(res);
      started();
      let i = 0;
      const next = () => {
        if (res.destroyed) return;
        if (i < parts.length) { res.write(parts[i++]); setImmediate(next); return; }
        if (end === 'end') res.end();
        else if (end === 'error') res.destroy(new Error('ECONNRESET'));
      };
      next();
    });
    return { destroy() { /* the response is destroyed by the downloader */ } };
  }) as unknown as Getter & { started: Promise<void> };
  g.started = ready;
  return g;
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'osrs-dl-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const dest = () => join(dir, rel.name);
const leftovers = () => readdirSync(dir);

describe('download: partial, interrupted, wrong or cancelled', () => {
  it('a whole verified file is renamed into place', async () => {
    await m.download(rel, dest(), () => undefined, { getter: scripted([BYTES.subarray(0, 1000), BYTES.subarray(1000)], 'end') });
    expect(readFileSync(dest()).equals(BYTES)).toBe(true);
    expect(leftovers()).toEqual([rel.name]);
  });

  it('a connection that closes early leaves nothing behind', async () => {
    await expect(m.download(rel, dest(), () => undefined, { getter: scripted([BYTES.subarray(0, 1000)], 'end') })).rejects.toThrow(/size/);
    expect(leftovers()).toEqual([]);
  });

  it('a connection that drops mid-file leaves nothing behind', async () => {
    await expect(m.download(rel, dest(), () => undefined, { getter: scripted([BYTES.subarray(0, 1000)], 'error') })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(leftovers()).toEqual([]);
  });

  it('other bytes of the right size fail the checksum and leave nothing behind', async () => {
    const other = Buffer.from('y'.repeat(BYTES.length));
    await expect(m.download(rel, dest(), () => undefined, { getter: scripted([other], 'end') })).rejects.toThrow(/checksum/);
    expect(leftovers()).toEqual([]);
  });

  it('a cancel mid-file stops it, removes the partial file and keeps an earlier destination untouched', async () => {
    writeFileSync(dest(), 'earlier bytes');
    const ac = new AbortController();
    const g = scripted([BYTES.subarray(0, 1000)], 'hang');
    const run = m.download(rel, dest(), () => undefined, { getter: g, signal: ac.signal });
    await g.started;
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' });
    await new Promise((r) => setTimeout(r, 20));
    expect(leftovers()).toEqual([rel.name]);
    expect(readFileSync(dest(), 'utf8')).toBe('earlier bytes');
  });

  it('a retry after a dropped connection gives the whole file', async () => {
    await expect(m.download(rel, dest(), () => undefined, { getter: scripted([BYTES.subarray(0, 1000)], 'error') })).rejects.toThrow();
    await m.download(rel, dest(), () => undefined, { getter: scripted([BYTES], 'end') });
    expect(readFileSync(dest()).equals(BYTES)).toBe(true);
  });
});

describe('the updater: cancel and retry', () => {
  const SIZE = 25 * 1024 * 1024;
  const DIGEST = createHash('sha256').update(Buffer.alloc(SIZE)).digest('hex');
  const release = { tag_name: 'v2.25.0', draft: false, prerelease: false, body: '', assets: [{
    name: 'OSRS-Put-2.25.0-portable.exe', size: SIZE, digest: `sha256:${DIGEST}`,
    browser_download_url: 'https://github.com/bexaf3163/OSRS/releases/download/v2.25.0/OSRS-Put-2.25.0-portable.exe',
  }] };
  const make = (downloader: unknown) => m.createUpdater({
    version: '2.24.0', env: { PORTABLE_EXECUTABLE_FILE: join(dir, 'OSRS-Put-2.24.0-portable.exe'), PORTABLE_EXECUTABLE_DIR: dir },
    userData: dir, onState: () => undefined, quit: () => undefined, fetchRelease: async () => release, downloader,
  });

  it('cancel returns to "available" without an error; downloading again gets to "ready"', async () => {
    let attempt = 0;
    const u = make((r: Rel, file: string, _p: unknown, o: { signal: AbortSignal }) => {
      attempt++;
      if (attempt === 1) {
        return new Promise((_res, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }))));
      }
      writeFileSync(file, ''); truncateSync(file, r.size);
      return Promise.resolve();
    });
    await u.check();
    const first = u.download();
    await new Promise((r) => setTimeout(r, 5));
    expect(u.state.state).toBe('downloading');
    u.cancel();
    await first;
    expect(u.state).toMatchObject({ state: 'available', error: null });
    await u.download();
    expect(u.state.state).toBe('ready');
    expect(existsSync(join(dir, 'OSRS-Put-2.25.0-portable.exe'))).toBe(true);
  });

  it('a failed download keeps the release, so "Try again" can download it', async () => {
    let attempt = 0;
    const u = make((r: Rel, file: string) => {
      if (++attempt === 1) return Promise.reject(new Error('the connection was interrupted'));
      writeFileSync(file, ''); truncateSync(file, r.size);
      return Promise.resolve();
    });
    await u.check();
    await u.download();
    expect(u.state).toMatchObject({ state: 'error', error: 'the connection was interrupted' });
    await u.download();
    expect(u.state.state).toBe('ready');
  });
});
