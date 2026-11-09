// Builds src/data/generated/trainers.json from scripts/data/trainers.defs.json: the training spots the combat training engine
// may send the player to (2.75, T10). One list, checked against the OSRS Wiki, so adding an opponent is an entry in the
// definitions and a run of this script, not a change of code:
//   written  - a place written out with its NPC names, goal and text;
//   location - the {{LocLine}} of the opponent's article whose location matches: the spawn nearest the middle of its spawns is
//              the place (a tile an opponent really stands on).
// For every spot: the bank must be a bank of majorLocations.json; the drops the opponent always drops come from the article's
// drop table, and the one to sell must be among them. Members spots carry members: true (from the LocLine) and are offered only
// to members. It needs a network.
// Run: npm run build-trainers (then npm run build-combat-foes, which takes its opponents from the same definitions).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wikitext } from './wiki.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${root}src/data/generated/trainers.json`;

interface Pt { x: number; y: number; plane: number; label?: string }
interface Def {
  foe: string;
  /** How the guide says them: "cows", "Giant frogs"; proper - one named opponent ("Brutus"). */
  name: string;
  proper?: boolean;
  location?: string;
  plane?: number;
  levels?: number[];
  bank: string;
  bankWhy?: string;
  sell?: string;
  label?: string;
  place?: Pt & { label: string };
  waypoints?: Pt[];
  npcNames?: string[];
  goal?: string;
  where?: string;
  requires?: { quest: string };
  betweenKills?: [number, number];
  betweenWhy?: string;
  freeHeal?: boolean;
  specialMaxHit?: number;
  groupAggro?: boolean;
}

const defs = JSON.parse(readFileSync(`${root}scripts/data/trainers.defs.json`, 'utf8')) as { spots: Def[] };
const banks = (JSON.parse(readFileSync(`${root}src/data/generated/majorLocations.json`, 'utf8')) as { locations: Record<string, { kind: string }> }).locations;


const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** The LocLine whose location matches: its spawns and whether it is members-only. */
function locLine(text: string, re: RegExp, plane: number): { pts: Pt[]; members: boolean } | null {
  for (const m of text.matchAll(/\{\{LocLine([\s\S]*?)\n\}\}/g)) {
    const block = m[1];
    const loc = /\|\s*location\s*=\s*(.*)/.exec(block)?.[1]?.trim() ?? '';
    const p = Number(/\|\s*plane\s*=\s*(\d+)/.exec(block)?.[1] ?? 0);
    if (!re.test(loc) || p !== plane) continue;
    return { pts: [...block.matchAll(/x:(\d+),y:(\d+)/g)].map((q) => ({ x: Number(q[1]), y: Number(q[2]), plane })), members: /\|\s*members\s*=\s*yes/i.test(block) };
  }
  return null;
}

/** What the opponent always drops (the drop table's "Always" rows), members-only rows and untradeable keys left out. */
function alwaysDrops(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{DropsLine\|([^\n]*)\}\}/g)) {
    const row = m[1];
    if (!/rarity\s*=\s*Always/i.test(row) || /namenotes\s*=\s*\{\{\(m\)/i.test(row)) continue;
    const name = /(?:^|\|)\s*name\s*=\s*([^|}]+)/.exec(row)?.[1]?.trim();
    if (name) out.add(name);
  }
  return [...out];
}

const out: unknown[] = [];
const problems: string[] = [];
for (const d of defs.spots) {
  const fail = (why: string) => problems.push(`${d.foe}: ${why}`);
  if (!d.name) { fail('no name'); continue; }
  if (banks[d.bank]?.kind !== 'bank') { fail(`${d.bank} is not a bank of majorLocations.json`); continue; }
  const text = await wikitext(d.foe);
  const always = alwaysDrops(text);
  if (d.sell && !always.includes(d.sell)) { fail(`${d.sell} is not among its always-drops (${always.join(', ') || 'none'})`); continue; }
  const { location, plane: _p, label, bankWhy: _b, betweenWhy: _w, ...rest } = d;
  let spot: Record<string, unknown> = { ...rest, always };
  let place: Pt & { label: string };
  let members = false;
  let spawns: number | undefined;
  if (location) {
    const line = locLine(text, new RegExp(location), d.plane ?? 0);
    if (!line?.pts.length) { fail(`no LocLine at ${location}`); continue; }
    const mid = { x: line.pts.reduce((a, p) => a + p.x, 0) / line.pts.length, y: line.pts.reduce((a, p) => a + p.y, 0) / line.pts.length };
    const at = line.pts.reduce((a, p) => (chebyshev(p, mid) < chebyshev(a, mid) ? p : a));
    place = { ...at, label: label ?? d.goal ?? d.foe };
    members = line.members;
    spawns = line.pts.length;
  } else if (d.place) place = d.place;
  else { fail('neither location nor place'); continue; }
  if (!d.npcNames?.length || !d.goal || !d.where) { fail('a written spot needs npcNames, goal and where'); continue; }
  spot = {
    ...spot, place, members, ...(spawns ? { spawns } : {}),
    source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(d.foe.replace(/ /g, '_'))}`,
  };
  out.push(spot);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify({
  source: 'scripts/data/trainers.defs.json checked against the OSRS Wiki (LocLine spawns, drop tables) and scripts/data/build-trainers.ts',
  generatedAt: new Date().toISOString().slice(0, 10),
  trainers: out,
}, null, 2) + '\n');
console.log(`Written ${out.length} spots to ${OUT}`);
