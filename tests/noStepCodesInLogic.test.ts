// Engines, not patches: no feature may single out a route step by its code. A rule reads the step's data (its place, its fights, its quest, its reward)
// or a data file that names the step and is checked against the route (transport.json "unlocks", trainers.defs.json), so a fix reaches every step, and a
// new or renumbered step needs no code. This scan fails as soon as a step code is written into the logic again.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Where a step code is data, not a rule: the save migration map of retired and renumbered codes, and a search box example. */
const ALLOWED = new Set(['src/lib/progress.ts', 'src/components/SearchBox.tsx']);
const CODE = /["'`]S\d+-\d{2}["'`]/;

/** The Windows path separator, a backslash. */
const sep = String.fromCharCode(92);

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(n) ? [p.split(sep).join('/')] : [];
  });
}

/** The lines of a file that are code, not comments. */
function codeLines(text: string): { n: number; line: string }[] {
  let block = false;
  return text.split('\n').map((line, i) => ({ n: i + 1, line })).filter(({ line }) => {
    const t = line.trim();
    if (block) { if (t.includes('*/')) block = false; return false; }
    if (t.startsWith('/*')) { block = !t.includes('*/'); return false; }
    return !t.startsWith('//') && !t.startsWith('*');
  }).map(({ n, line }) => ({ n, line: line.replace(/\/\/.*$/, '') }));
}

describe('no rule is tied to one route step', () => {
  it('the app logic names no step code', () => {
    const hits = ['src/lib', 'src/components', 'src/services', 'src/pages'].flatMap((d) => files(d, /\.tsx?$/))
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) => codeLines(readFileSync(f, 'utf8')).filter(({ line }) => CODE.test(line)).map(({ n, line }) => `${f}:${n}: ${line.trim()}`));
    expect(hits).toEqual([]);
  });

  it('the game plugin names no step code', () => {
    const hits = files('runelite-bridge/src/main', /\.java$/)
      .flatMap((f) => codeLines(readFileSync(f, 'utf8')).filter(({ line }) => /"S\d+-\d{2}"/.test(line)).map(({ n, line }) => `${f}:${n}: ${line.trim()}`));
    expect(hits).toEqual([]);
  });
});
