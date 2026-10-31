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
import { chebyshev, locLines, mapPoint, middleOf, num, recipeTicks, successCharts, templates, wikitables, wikitext, type Pt } from './wiki.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/processing.json`;

type Kind = 'furnace' | 'anvil' | 'fire' | 'altar';
interface StationDef { objectName?: string; kind: Kind; page: string; row?: string; location?: string; near?: string; bank?: string }
interface TickEvidence { page: string; evidence: string; ticks: number }
interface RecipeDef { id: string; page: string; skill: string; facility: Kind | null; members?: boolean; /** Lit with a tinderbox (Firemaking): read from the log's {{Firemaking info}}. */ light?: boolean;
  consume?: { level: number; xp: number; xpEvidence: string; action: TickEvidence };
  spell?: { page: string; materialPage: string; successEvidence: string; batchSize: number };
  wholeBatch?: boolean;
  /** Batch size is an app preparation choice. Work/wait ticks must match the Wiki recipe's timing note and total. */
  batch?: { size: number; workTicks: number; waitTicks: number; workEvidence: string; waitEvidence: string }; successLabel?: string;
}
/** Lighting logs: the action length (checked against its evidence line) and the lighting success chart, one for every log. */
interface LightDef { ticks: { page: string; evidence: string; ticks: number }; chart: { page: string; label: string; line: string } }
interface Defs { consumableUses?: { name: string; page: string; uses: number; evidence: string }[]; stations: StationDef[]; recipes: RecipeDef[]; methods: Record<string, string[]>; light?: LightDef }

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
  const sceneNames = [...new Set(templates(text, 'Infobox Scenery').flatMap(box => Object.entries(box)
    .filter(([key]) => /^name\d*$/.test(key)).map(([, value]) => plain(value)).filter(Boolean)))];
  const scene = s.objectName ?? (sceneNames.length === 1 ? sceneNames[0] : undefined);
  if (!scene || !sceneNames.includes(scene)) { fail(what, 'select a verified scene object name from the station page'); continue; }
  const objectNames = [scene];
  if (s.kind === 'altar') {
    const box = templates(text, 'Infobox Scenery')[0] ?? {};
    const at = mapPoint(box.map ?? '');
    const outside = templates(text, 'Map').find((m) => /mysterious ruins/i.test(m.caption ?? ''));
    const entry = outside ? mapPoint(`{{Map|x=${outside.x}|y=${outside.y}}}`) : null;
    const portals = templates(await page('Portal (Runecrafting)'), 'Infobox Scenery')[0] ?? {};
    const version = Object.entries(portals).find(([k, v]) => /^version\d+$/.test(k) && `${v} Altar` === s.page)?.[0].slice(7);
    const portal = version ? mapPoint(portals[`map${version}`] ?? '') : null;
    if (!at || !entry || !portal || chebyshev(at, portal) > 100 || !s.bank || places[s.bank]?.kind !== 'bank' || chebyshev(entry, places[s.bank]) > 500) {
      fail(s.page, 'altar/ruins/exit-portal maps or bank are missing/inconsistent'); continue;
    }
    stations.push({ kind: s.kind, objectNames, label: s.page, place: { ...at, label: s.page }, entry: { ...entry, label: `${s.page}: mysterious ruins` }, portal,
      bank: s.bank, members: /^yes$/i.test(box.members ?? '') });
    continue;
  }
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
    stations.push({ kind: s.kind, objectNames, label, place: { ...at, label }, bankTiles: tiles, members });
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
  stations.push({ kind: s.kind, objectNames, label, place: { ...best.mid, label }, bank: s.bank, members: best.g.members });
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
const FACILITY: Record<Kind, RegExp> = { furnace: /furnace/i, anvil: /anvil/i, fire: /range|fire/i, altar: /altar/i };

// Lighting logs: one action length and one success chart for every log (Firemaking), checked on the wiki once.
let light: { ticks: number; low: number; high: number } | null = null;
if (defs.light) {
  const L = defs.light;
  const line = (await wikitext(L.ticks.page)).split('\n').find((l) => l.includes(L.ticks.evidence));
  const chart = successCharts(await wikitext(L.chart.page)).find((c) => c.label === L.chart.label)?.lines.find((l) => l.label === L.chart.line);
  if (!line || !new RegExp(`\\b${L.ticks.ticks} ticks`).test(line)) fail('light', `no "${L.ticks.evidence}" line saying ${L.ticks.ticks} ticks on ${L.ticks.page}`);
  else if (!chart) fail('light', `no "${L.chart.line}" line in the "${L.chart.label}" chart on ${L.chart.page}`);
  else light = { ticks: L.ticks.ticks, low: chart.low, high: chart.high };
}

const recipes = [];
for (const d of defs.recipes) {
  const text = await wikitext(d.page);
  if (d.spell) {
    const s = d.spell;
    const box = templates(text, 'Infobox Spell')[0] ?? {};
    const mat = templates(await wikitext(s.materialPage), 'Recipe').find((r) => !/^yes$/i.test(r.members ?? ''));
    const runes = templates(box.cost ?? '', 'RuneReq')[0] ?? {};
    const ticks = /^(\d+) ticks$/.exec(box.speed ?? '');
    if (!mat || !text.includes(s.successEvidence) || !ticks || !(num(box.level) > 0) || !(num(box.exp) > 0)
      || !Object.keys(runes).length || !(s.batchSize > 0) || !Number.isInteger(s.batchSize) || !mat.output1
      || !mat.skill1 || !(num(mat.skill1lvl) > 0)) { fail(d.id, 'spell/material evidence incomplete'); continue; }
    const staffData = (JSON.parse(readFileSync(`${root}src/data/spells.json`, 'utf8')) as { staffs: Record<string, { name: string }> }).staffs;
    const inputs = [];
    for (let i = 1; mat[`mat${i}`]; i++) {
      const name = plain(mat[`mat${i}`]);
      inputs.push({ name, qty: num(mat[`mat${i}quantity`]) || 1, stacks: await stacks(name) });
    }
    for (const [element, qty] of Object.entries(runes)) {
      if (!(num(qty) > 0)) { fail(d.id, `invalid ${element} rune quantity`); continue; }
      const name = `${element} rune`;
      inputs.push({ name, qty: num(qty), stacks: await stacks(name), ...(staffData[element.toLowerCase()] ? { staff: staffData[element.toLowerCase()].name } : {}) });
    }
    recipes.push({ id: d.id, skill: d.skill, level: num(box.level), xp: num(box.exp), ticks: Number(ticks[1]), facility: null, tools: [], inputs,
      output: { name: plain(mat.output1), qty: num(mat.output1quantity) || 1 }, batchSize: s.batchSize,
      requires: [{ skill: (mat.skill1 ?? '').toLowerCase(), level: num(mat.skill1lvl) }], members: /^yes$/i.test(box.members ?? ''),
      source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(s.page.replace(/ /g, '_'))}` });
    continue;
  }
  if (d.consume) {
    const c = d.consume;
    const action = (await wikitext(c.action.page)).split('\n').find((l) => l.includes(c.action.evidence));
    const item = templates(text, 'Infobox Item')[0];
    const xpMatch = /give (\d+(?:\.\d+)?) \[\[Prayer\]\] experience when buried/.exec(c.xpEvidence);
    if (!item || !text.includes(c.xpEvidence) || !xpMatch || Number(xpMatch[1]) !== c.xp || d.skill !== 'prayer'
      || !action || !action.includes(`${c.action.ticks} ticks per bone`) || !(c.level > 0) || !(c.xp > 0) || !(c.action.ticks > 0)) {
      fail(d.id, 'consumption XP/action evidence does not match the source'); continue;
    }
    recipes.push({ id: d.id, skill: d.skill, level: c.level, xp: c.xp, ticks: c.action.ticks, facility: null, tools: [],
      inputs: [{ name: plain(d.page), qty: 1, stacks: await stacks(d.page) }], output: null, members: /^yes$/i.test(item.members ?? ''),
      source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(d.page.replace(/ /g, '_'))}` });
    continue;
  }
  if (d.light) {
    // The log's {{Firemaking info}}: the tinderbox version's level and XP. A failed light keeps the log (retry): it costs time, not the log.
    const fi = templates(text, 'Firemaking info')[0] ?? {};
    const k = Object.entries(fi).find(([key, v]) => /^version\d+$/.test(key) && /^tinderbox$/i.test(v.trim()))?.[0].slice(7);
    const level = num(fi[`skill1lvl${k}`]);
    const xp = num(fi[`skill1exp${k}`]);
    if (!light || !k || !(level > 0) || !(xp > 0)) { fail(d.id, `no tinderbox level and XP in the {{Firemaking info}} of ${d.page}`); continue; }
    const log = plain(d.page);
    recipes.push({
      id: d.id, skill: d.skill, level, xp, ticks: light.ticks, facility: null, tools: ['Tinderbox'], inputs: [{ name: log, qty: 1, stacks: await stacks(log) }],
      output: null, success: { low: light.low, high: light.high }, retry: true,
      source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(d.page.replace(/ /g, '_'))}`,
    });
    continue;
  }
  const r = templates(text, 'Recipe').find((x) => (x.skill1 ?? '').toLowerCase() === d.skill && /^yes$/i.test(x.members ?? '') === Boolean(d.members));
  if (!r) { fail(d.id, `no ${d.members ? 'members' : 'free'} {{Recipe}} for ${d.skill} on ${d.page}`); continue; }
  if (d.facility ? !FACILITY[d.facility].test(r.facilities ?? '') : (r.facilities ?? '').trim()) {
    fail(d.id, `the recipe's facilities are "${r.facilities ?? ''}", not ${d.facility ?? 'none'}`); continue;
  }
  const inputs = [];
  for (let i = 1; r[`mat${i}`]; i++) {
    const name = plain(r[`mat${i}`]);
    inputs.push({ name, qty: num(r[`mat${i}quantity`]) || 1, stacks: await stacks(name) });
  }
  const tools = (r.tools ?? '').split(/,|<br\s*\/?>/).map(plain).filter(Boolean);
  const carried = d.wholeBatch ? tools.find((n) => / talisman$/i.test(n)) : undefined;
  const equipped = d.wholeBatch ? tools.find((n) => / tiara$/i.test(n)) : undefined;
  const every = d.wholeBatch ? /every (\d+)(?:st|nd|rd|th) level/i.exec(r.notes ?? '') : null;
  if (d.wholeBatch) {
    const guide = plain(await page('Free-to-play Runecraft training')).toLowerCase();
    if (d.skill !== 'runecraft' || !carried || !equipped || !every || inputs.length !== 1 || inputs[0].name !== 'Rune essence'
      || !guide.includes('pure essence or rune essence')) { fail(d.id, 'whole-inventory crafting/access/essence evidence incomplete'); continue; }
  }
  const ticks = d.batch?.workTicks ?? recipeTicks(r);
  if (d.batch && (!(d.batch.size > 0) || !Number.isInteger(d.batch.size) || !(d.batch.workTicks > 0) || !(d.batch.waitTicks >= 0)
    || num(r.ticks) !== d.batch.workTicks + d.batch.waitTicks || !(r.ticksnote ?? '').includes(d.batch.workEvidence)
    || !(r.ticksnote ?? '').includes(d.batch.waitEvidence))) { fail(d.id, 'batch work/wait evidence does not match the recipe'); continue; }
  const level = num(r.skill1lvl);
  const xp = num(r.skill1exp);
  if (!(ticks > 0) || !(level > 0) || !(xp > 0) || !inputs.length || !r.output1) { fail(d.id, `incomplete recipe ${JSON.stringify(r)}`); continue; }
  // Success: a cooking chart's fire-or-range line (low/high of the skilling success formula, burning stops where it reaches 1), or a flat "N% chance".
  const chart = successCharts(text).flatMap((c) => c.lines).find((l) => d.successLabel ? l.label === d.successLabel : /fire or range/i.test(l.label));
  const pct = /(\d+)% chance/.exec(r.output1quantitynote ?? '');
  if (d.skill === 'cooking' && !chart) { fail(d.id, 'no fire-or-range line in its skilling success chart'); continue; }
  recipes.push({
    id: d.id, skill: d.skill, level, xp, ticks, facility: d.facility, tools: d.wholeBatch ? [] : tools,
    ...(d.members ? { members: true } : {}),
    inputs: d.wholeBatch ? inputs.map((i) => ({ ...i, anyOf: ['Pure essence'] })) : inputs,
    output: { name: plain(r.output1), qty: num(r.output1quantity) || 1 },
    ...(d.wholeBatch ? { wholeBatch: true, multiplierEvery: Number(every![1]), access: { carried, equipped }, station: plain(r.facilities) } : {}),
    ...(d.batch ? { batchSize: d.batch.size, batchWaitTicks: d.batch.waitTicks } : {}),
    ...(chart ? { success: { low: chart.low, high: chart.high } } : pct ? { chance: Number(pct[1]) / 100 } : {}),
    source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(d.page.replace(/ /g, '_'))}`,
  });
}

// A charged ingredient is shared by every recipe that uses it; facts need explicit source evidence.
const usesByName = new Map<string, number>();
for (const fact of defs.consumableUses ?? []) {
  if (!Number.isSafeInteger(fact.uses) || fact.uses <= 1 || !fact.evidence || Number(/\b(\d+) uses\b/.exec(fact.evidence)?.[1]) !== fact.uses || !plain(await page(fact.page)).includes(fact.evidence) || usesByName.has(fact.name)) {
    fail(fact.name, 'invalid or unverified consumable uses'); continue;
  }
  usesByName.set(fact.name, fact.uses);
}
const builtRecipes = recipes.map(r => ({ ...r, inputs: r.inputs.map(i => {
  const uses = usesByName.get(i.name);
  if (!uses) return i;
  if (!i.stacks) fail(i.name, 'multi-use materials must be stackable');
  // The bridge cannot read the first spool's remaining uses; allow its worst-case partial use once.
  return { ...i, qty: i.qty / uses, initialReserve: (uses - 1) / uses };
}) }));

// Methods: each lists recipes of its own skill; every recipe with a facility has a station of that kind.
for (const [id, list] of Object.entries(defs.methods)) {
  const m = methods.find((x) => x.id === id);
  if (!m) { fail(id, 'not in trainingMethods.json'); continue; }
  for (const rid of list) {
    const r = recipes.find((x) => x.id === rid);
    if (!r) { fail(id, `${rid} is not a built recipe`); continue; }
    if (r.skill !== m.skill) fail(id, `${rid} trains ${r.skill}, the method ${m.skill}`);
    if (r.facility && !stations.some((s) => s.kind === r.facility)) fail(id, `${rid} needs a ${r.facility} and there is none`);
    if ('station' in r && !stations.some((s) => s.label === r.station)) fail(id, `${rid} has no matching station`);
  }
}

if (problems.length) {
  console.error(`Not written: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify({
  about: 'Built by scripts/build-processing.ts from scripts/processing.defs.json and the OSRS Wiki; edit the definitions and rebuild.',
  stations, recipes: builtRecipes, methods: defs.methods,
}, null, 2)}\n`);
console.log(`Written ${recipes.length} recipes, ${stations.length} stations, ${Object.keys(defs.methods).length} methods to ${OUT}`);
