// T15: the release gate reads BridgeServer.class out of the plugin jar shipped in the portable app; the reader itself is checked on zips built here.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { jarEntry } from '../scripts/jarEntry';

/** A zip with the given entries, each stored (0) or deflated (8), with a central directory as Gradle writes it. */
function zip(entries: { name: string; data: string; method: 0 | 8 }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data);
    const body = e.method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(e.method, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const file = (b: Buffer) => { const d = mkdtempSync(join(tmpdir(), 'osrs-jar-')); dirs.push(d); const f = join(d, 'x.jar'); writeFileSync(f, b); return f; };

describe('jarEntry', () => {
  it('reads a deflated and a stored entry by name, whatever the order', () => {
    const f = file(zip([
      { name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0', method: 0 },
      { name: 'com/osrspath/bridge/BridgeServer.class', data: 'PLUGIN_VERSION 2.74.14 '.repeat(40), method: 8 },
    ]));
    expect(jarEntry(f, 'com/osrspath/bridge/BridgeServer.class')?.toString()).toContain('2.74.14');
    expect(jarEntry(f, 'META-INF/MANIFEST.MF')?.toString()).toBe('Manifest-Version: 1.0');
  });

  it('an absent entry or a file that is not a zip gives null', () => {
    expect(jarEntry(file(zip([{ name: 'a', data: 'b', method: 0 }])), 'missing')).toBeNull();
    expect(jarEntry(file(Buffer.from('not a zip at all, long enough to look for an end record')), 'a')).toBeNull();
  });
});
