// One file out of a jar (a zip) by its name, for the release gate that checks the plugin shipped inside the portable app. Reads the central
// directory, so data descriptors and entry order do not matter; stored and deflated entries only (what Gradle writes).
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export function jarEntry(file: string, name: string): Buffer | null {
  const zip = readFileSync(file);
  if (zip.readUInt32LE(0) !== 0x04034b50) return null;
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) return null;
  const entries = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let n = 0; n < entries; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const skip = nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString('utf8', at + 46, at + 46 + nameLen) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    at += 46 + skip;
  }
  return null;
}
