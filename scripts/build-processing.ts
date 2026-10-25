// Builds src/data/processing.json from scripts/processing.defs.json: what the processing engine (src/lib/processingRates.ts) needs, read from the OSRS
// Wiki and checked, so a new recipe, furnace, anvil or fire is an entry in the definitions and a run of this script, not a change of code:
//   - each recipe: the product page's free {{Recipe}} for the skill (level, XP, ticks at the Make-X pace, tools, materials and their amounts, output);
//   - its success chance: the page's {{Skilling success chart}} line for a fire or range (cooking), or the recipe's "N% chance" note (an iron bar);
//   - whether each material stacks (one bag slot for all of it): its {{Infobox Item}};
//   - each furnace and anvil: its row of the article's location table (the map point, free or members, and the wiki's distance from the bank);
//   - each fire: its {{ObjectLocLine}} spawn nearest a named place, and the bank players use from it.
// Run: npm run build-processing. Needs a network.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chebyshev, locLines, mapPoint, middleOf, num, successCharts, templates, wikitables, wikitext, type Pt } from './wiki.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/processing.json`;

type Kind = 'furnace' | 'anvil' | 'fire';
interface StationDef { kind: Kind; page: string; row?: string; location?: string; near?: string; bank?: string }
interface RecipeDef { id: string; page: string; skill: string; facility: Kind | null }
interface Defs { stations: StationDef[]; recipes: RecipeDef[]; methods: Record<string, string[]> }

const defs = JSON.parse(readFileSync(`${root}scripts/processing.defs.json`, 'utf8')) as Defs;
const places = (JSON.parse(readFileSync(`${root}src/data/majorLocations.json`, 'utf8')) as { locations: Record<string, Pt & { label: string; kind: string }> }).locations;
const methods = (JSON.parse(readFileSync(`${root}src/data/trainingMethods.json`, 'utf8')) as { methods: { id: string; skill: string; members: boolean }[] }).methods;

const problems: string[] = [];
const fail = (what: string, why: string) => problems.push(`${what}: ${why}`);
const plain = (s: string) => s.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').trim();

// Stations.
const stations = [];
const pages = new Map<string, string>();
const page = async (p: string) => { if (!pages.has(p)) pages.set(p, await wikitext(p)); return pages.get(p)!; };
for (const s of defs.stations) {
  const what = `${s.kind} @ ${s.row ?? s.location}`;
  const text = await page(s.page);
  if (s.row) {
    // The article's location table: the row whose first cell is exactly the location, with a {{Map}} point and a distance from the bank in tiles.
    const row = wikitables(text).flatMap((t) => t.rows).find((r) => r[0] === s.row);
    if (!row) { fail(what, `no row "${s.row}" in the tables of ${s.page}`); continue; }
    const at = mapPoint(row.join(' '));
    const tiles = num(/^\s*(\d+)/.exec(row[1] ?? '')?.[1]);
    const members = /\{\{Members\|\s*yes/i.test(row.join(' '));
    if (!at) { fail(what, 'the row has no map point'); continue; }
    if (!(tiles > 0)) { fail(what, `the row has no distance from the bank ("${row[1]}")`); continue; }
    const label = new RegExp(s.kind, 'i').test(plain(s.row)) ? plain(s.row) : `${plain(s.row)} ${s.kind}`;
    stations.push({ kind: s.kind, label, place: { ...at, label }, bankTiles: tiles, members });
    continue;
  }
  // A spawn group of the object near a named place (the fire west of the Barbarian Village fishing spots), banked at a named bank.
  const near = s.near ? places[s.near] : undefined;
  if (!near) { fail(what, `${s.near} is not in majorLocations.json`); continue; }
  if (!s.bank || places[s.bank]?.kind !== 'bank') { fail(what, `${s.bank} is not a bank of majorLocations.json`); continue; }
  const groups = locLines(text, 'ObjectLocLine').filter((l) => l.location === s.location && l.pts.length);
  const best = groups.map((g) => ({ g, mid: middleOf(g.pts) })).sort((a, b) => chebyshev(a.mid, near) - chebyshev(b.mid, near))[0];
  if (!best || chebyshev(best.mid, near) > 30) { fail(what, `no ObjectLocLine "${s.location}" on ${s.page} within 30 tiles of ${s.near}`); continue; }
  const label = `${plain(s.location ?? '')} ${s.kind}`;
  stations.push({ kind: s.kind, label, place: { ...best.mid, label }, bank: s.bank, members: best.g.members });
}

// Recipes.
const stackCache = new Map<string, boolean>();
async function stacks(item: string): Promise<boolean> {
  if (!stackCache.has(item)) {
    const box = templates(await wikitext(item), 'Infobox Item')[0] ?? {};
    const v = box.stackable ?? box.stackable1 ?? '';
    if (!/^(yes|no)$/i.test(v.trim())) fail(item, `its Infobox Item does not say stackable yes or no ("${v}")`);
    stackCache.set(item, /^yes$/i.test(v.trim()));
  }
  return stackCache.get(item)!;
}
/** The ticks of one action at the Make-X pace: the note's "increases to N" or "N ticks for the rest" when the first action is quicker. */
function steadyTicks(r: Record<string, string>): number {
  const note = r.ticksnote ?? '';
  const later = /increases to (\d+)/i.exec(note) ?? /(\d+) ticks for the rest/i.exec(note);
  return later ? Number(later[1]) : num(r.ticks);
}
const FACILITY: Record<Kind, RegExp> = { furnace: /furnace/i, anvil: /anvil/i, fire: /range|fire/i };

const recipes = [];
for (const d of defs.recipes) {
  const text = await wikitext(d.page);
  const r = templates(text, 'Recipe').find((x) => (x.skill1 ?? '').toLowerCase() === d.skill && !/^yes$/i.test(x.members ?? ''));
  if (!r) { fail(d.id, `no free {{Recipe}} for ${d.skill} on ${d.page}`); continue; }
  if (d.facility ? !FACILITY[d.facility].test(r.facilities ?? '') : (r.facilities ?? '').trim()) {
    fail(d.id, `the recipe's facilities are "${r.facilities ?? ''}", not ${d.facility ?? 'none'}`); continue;
  }
  const inputs = [];
  for (let i = 1; r[`mat${i}`]; i++) {
    const name = plain(r[`mat${i}`]);
    inputs.push({ name, qty: num(r[`mat${i}quantity`]) || 1, stacks: await stacks(name) });
  }
  const tools = (r.tools ?? '').split(/,|<br\s*\/?>/).map(plain).filter(Boolean);
  const ticks = steadyTicks(r);
  const level = num(r.skill1lvl);
  const xp = num(r.skill1exp);
  if (!(ticks > 0) || !(level > 0) || !(xp > 0) || !inputs.length || !r.output1) { fail(d.id, `incomplete recipe ${JSON.stringify(r)}`); continue; }
  // Success: a cooking chart's fire-or-range line (low/high of the skilling success formula, burning stops where it reaches 1), or a flat "N% chance".
  const chart = successCharts(text).flatMap((c) => c.lines).find((l) => /fire or range/i.test(l.label));
  const pct = /(\d+)% chance/.exec(r.output1quantitynote ?? '');
  if (d.skill === 'cooking' && !chart) { fail(d.id, 'no fire-or-range line in its skilling success chart'); continue; }
  recipes.push({
    id: d.id, skill: d.skill, level, xp, ticks, facility: d.facility, tools, inputs,
    output: { name: plain(r.output1), qty: num(r.output1quantity) || 1 },
    ...(chart ? { success: { low: chart.low, high: chart.high } } : pct ? { chance: Number(pct[1]) / 100 } : {}),
    source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(d.page.replace(/ /g, '_'))}`,
  });
}

// Methods: each lists recipes of its own skill; every recipe with a facility has a station of that kind.
for (const [id, list] of Object.entries(defs.methods)) {
  const m = methods.find((x) => x.id === id);
  if (!m) { fail(id, 'not in trainingMethods.json'); continue; }
  for (const rid of list) {
    const r = recipes.find((x) => x.id === rid);
    if (!r) { fail(id, `${rid} is not a built recipe`); continue; }
    if (r.skill !== m.skill) fail(id, `${rid} trains ${r.skill}, the method ${m.skill}`);
    if (r.facility && !stations.some((s) => s.kind === r.facility)) fail(id, `${rid} needs a ${r.facility} and there is none`);
  }
}

if (problems.length) {
  console.error(`Not written: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify({
  about: 'Built by scripts/build-processing.ts from scripts/processing.defs.json and the OSRS Wiki; edit the definitions and rebuild.',
  stations, recipes, methods: defs.methods,
}, null, 2)}\n`);
console.log(`Written ${recipes.length} recipes, ${stations.length} stations, ${Object.keys(defs.methods).length} methods to ${OUT}`);
