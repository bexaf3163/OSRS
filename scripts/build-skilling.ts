// Builds src/data/skilling.json from scripts/skilling.defs.json: what the gathering engine (src/lib/skillingRates.ts) needs, read from the OSRS Wiki and
// checked, so a new tree, rock, fishing spot or members area is an entry in the definitions and a run of this script, not a change of code:
//   - each resource's {{Skilling success chart}} (low/high per axe for trees, one line for a rock, the cascade of a fishing spot, best fish first);
//   - each product's level, XP and respawn from its {{Woodcutting info}}, {{Mining info}} or {{Fishing info}};
//   - each tree's despawn timer from the Woodcutting article's tree table ("One Log" or ticks);
//   - each pickaxe's ticks between rolls and each tool's levels to use and to wield from the Pickaxe and Axe articles;
//   - each action length checked against "Game tick/Action lengths";
//   - each spot: one free spawn group of the object's {{ObjectLocLine}}s (the tile nearest its middle, and how many there are) and its bank.
// Run: npm run build-skilling. Needs a network.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chebyshev, locLines, middleOf, num, pointsOf, successCharts, templates, wikitext, type Pt } from './wiki.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/skilling.json`;

interface ToolDef { skill: string; page: string; tiers: string[] }
interface ResourceDef { id: string; skill: string; object: string; chart: string; products: string[]; tool: string; bait?: string; ticks?: string }
interface SpotDef { resource: string; location?: string; near?: string; members?: boolean; bank?: string; why?: string; /** The way in of a spot under the ground: a dungeon of majorLocations.json. */ entrance?: string }
interface Defs {
  reach: number;
  hostiles: { range: number; pages: string[] };
  actionLengths: { page: string } & Record<string, { ticks: number; evidence: string } | string>;
  tools: Record<string, ToolDef>;
  resources: ResourceDef[];
  spots: SpotDef[];
  methods: Record<string, string[]>;
}

const defs = JSON.parse(readFileSync(`${root}scripts/skilling.defs.json`, 'utf8')) as Defs;
const places = (JSON.parse(readFileSync(`${root}src/data/majorLocations.json`, 'utf8')) as { locations: Record<string, Pt & { label: string; kind: string }> }).locations;
const methods = (JSON.parse(readFileSync(`${root}src/data/trainingMethods.json`, 'utf8')) as { methods: { id: string; skill: string; members: boolean }[] }).methods;

const problems: string[] = [];
const fail = (what: string, why: string) => problems.push(`${what}: ${why}`);

// Action lengths: every resource's ticks must be the ones the wiki states on the line that names it.
const lengths = await wikitext(defs.actionLengths.page);
const ticksOf: Record<string, number> = {};
for (const [k, v] of Object.entries(defs.actionLengths)) {
  if (typeof v === 'string') continue;
  const line = lengths.split('\n').find((l) => l.includes(v.evidence));
  if (!line) fail(`ticks ${k}`, `no line with "${v.evidence}" on ${defs.actionLengths.page}`);
  else if (!new RegExp(`\\b${v.ticks} ticks`).test(line)) fail(`ticks ${k}`, `the line says "${line.slice(0, 160)}", not ${v.ticks} ticks`);
  ticksOf[k] = v.ticks;
}

// Tools: each tier's row of its article's table: the level to use it, the level to wield it, and (pickaxes) the ticks between rolls.
const tools: Record<string, { skill: string; tiers: { item: string; level: number; wield: number; ticks?: number }[] }> = {};
for (const [id, t] of Object.entries(defs.tools)) {
  const text = await wikitext(t.page);
  const tiers = [];
  for (const item of t.tiers) {
    const at = text.indexOf(`|{{plinkt|${item}}}`);
    if (at < 0) { fail(item, `no row in ${t.page}`); continue; }
    const row = text.slice(at, text.indexOf('\n|-', at) > 0 ? text.indexOf('\n|-', at) : at + 600);
    const cells = row.split('\n').map((c) => c.replace(/^\|/, '').replace(/\{\{efn[\s\S]*?\}\}/g, '').trim());
    // The number cells in order: the level to use, the level to wield, and for a pickaxe the ticks last (prices and weights are not bare numbers).
    const nums = cells.slice(1).filter((c) => /^[\d.]+$/.test(c)).map(Number);
    const [level, wield] = nums;
    const ticks = id === 'pickaxe' ? nums.at(-1) : undefined;
    if (!(level >= 1) || !(wield >= 1) || (ticks !== undefined && !(ticks >= 2))) { fail(item, `row not understood: ${JSON.stringify(cells)}`); continue; }
    tiers.push({ item, level, wield, ...(ticks !== undefined ? { ticks } : {}) });
  }
  tools[id] = { skill: t.skill, tiers };
}

// The despawn timers of the Woodcutting article's tree table: "One Log" or "45 [[ticks]]".
const wcText = await wikitext('Woodcutting');
function lifetimeOf(tree: string): number | 'one' | null {
  const at = wcText.indexOf(`|[[${tree}]]`);
  if (at < 0) return null;
  const row = wcText.slice(at, wcText.indexOf('\n|-', at));
  if (/One Log/i.test(row)) return 'one';
  const m = /\|(\d+) \[\[ticks\]\]/.exec(row);
  return m ? Number(m[1]) : null;
}

const INFO: Record<string, string> = { woodcutting: 'Woodcutting info', mining: 'Mining info', fishing: 'Fishing info' };
/** "5.4 seconds", "35.4 - 58.8 seconds" → [5.4, 5.4], [35.4, 58.8]. */
function seconds(s: string | undefined): [number, number] | null {
  const m = /([\d.]+)(?:\s*[-–]\s*([\d.]+))?\s*seconds?/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
}
const plain = (s: string) => s.toLowerCase().replace(/^raw /, '');

const resources = [];
for (const r of defs.resources) {
  if (!tools[r.tool] && r.skill !== 'fishing') { fail(r.id, `unknown tool ${r.tool}`); continue; }
  const charts = successCharts(await wikitext(r.chart));
  if (!charts.length) { fail(r.id, `no skilling success chart on ${r.chart}`); continue; }
  const chart = charts[0];
  const products = [];
  for (const name of r.products) {
    const info = templates(await wikitext(name), INFO[r.skill])[0];
    if (!info) { fail(r.id, `${name} has no {{${INFO[r.skill]}}}`); continue; }
    const level = num(info.level ?? info.skill1lvl1 ?? info.skill1lvl);
    const xp = num(info.xp ?? info.skill1exp ?? info.skill1exp1);
    if (!(level >= 1) || !(xp > 0)) { fail(r.id, `${name}: level ${level}, xp ${xp} not understood`); continue; }
    // A fishing cascade names its lines by the fish ("Herring", "Raw salmon"); a rock or a tree has one line, or one per axe.
    const line = r.tool === 'axe' ? null : chart.lines.find((l) => plain(l.label) === plain(name)) ?? (chart.lines.length === 1 ? chart.lines[0] : null);
    if (r.tool !== 'axe' && !line) { fail(r.id, `${name} has no line in the chart "${chart.label}"`); continue; }
    products.push({ name, level, xp, ...(line ? { low: line.low, high: line.high } : {}), ...(seconds(info.time) ? { respawn: seconds(info.time) } : {}) });
  }
  // Trees: the chart has one line per axe, by the axe's metal.
  const byTool = r.tool === 'axe'
    ? Object.fromEntries(tools.axe.tiers.map((t) => [t.item, chart.lines.find((l) => l.label === t.item.replace(/ axe$/, ''))]).filter(([, l]) => l).map(([k, l]) => [k, { low: (l as { low: number }).low, high: (l as { high: number }).high }]))
    : undefined;
  if (byTool && !Object.keys(byTool).length) { fail(r.id, 'no axe lines in its chart'); continue; }
  const lifetime = r.skill === 'woodcutting' ? lifetimeOf(r.object) : undefined;
  if (r.skill === 'woodcutting' && lifetime === null) { fail(r.id, `no row for ${r.object} in the Woodcutting tree table`); continue; }
  const ticks = r.ticks ? ticksOf[r.ticks] : undefined;
  if (r.ticks && !ticks) { fail(r.id, `no action length ${r.ticks}`); continue; }
  resources.push({
    id: r.id, skill: r.skill, object: r.object, tool: r.tool, ...(r.bait ? { bait: r.bait } : {}), ...(ticks ? { ticks } : {}),
    cascade: chart.cascade, products, ...(byTool ? { byTool } : {}), ...(lifetime !== undefined ? { lifetime } : {}),
    source: `https://oldschool.runescape.wiki/w/${encodeURIComponent(r.chart.replace(/ /g, '_'))}`,
  });
}

// Spots: verified spawn groups, or explicitly approximate drop-only locations; membership is retained in both forms.
/** The map's dungeon space lies this many tiles north of the surface above it (the same rule as bankTrip.ts). */
const UNDERGROUND = 6400;
const spawnCache = new Map<string, ReturnType<typeof locLines>>();
const spots = [];
for (const s of defs.spots) {
  const r = defs.resources.find((x) => x.id === s.resource);
  const what = `${s.resource} @ ${s.location ?? s.near}`;
  if (!r) { fail(what, 'unknown resource'); continue; }
  if (s.bank && places[s.bank]?.kind !== 'bank') { fail(what, `${s.bank} is not a bank of majorLocations.json`); continue; }
  if (s.near) {
    const p = places[s.near];
    if (!p) { fail(what, `${s.near} is not in majorLocations.json`); continue; }
    if (s.bank) { fail(what, 'a spot without wiki spawns cannot measure a bank trip: drop only'); continue; }
    spots.push({ resource: s.resource, label: p.label, place: { x: p.x, y: p.y, plane: p.plane, label: p.label }, members: s.members ?? false, ...(s.why ? { why: s.why } : {}) });
    continue;
  }
  if (!spawnCache.has(r.object)) spawnCache.set(r.object, locLines(await wikitext(r.object), 'ObjectLocLine'));
  const line = spawnCache.get(r.object)!.find((l) => l.location === s.location && l.pts.length);
  if (!line) { fail(what, `no ObjectLocLine with location "${s.location}" on ${r.object}`); continue; }
  const label = `${line.location.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')}`;
  const mid = middleOf(line.pts);
  // Under the ground (the map's dungeon space, 6400 tiles north of the surface above it): the walk needs the way in, and it must be above the spawns.
  let waypoints: Pt[] | undefined;
  if (s.entrance) {
    const e = places[s.entrance];
    if (!e || e.kind !== 'dungeon') { fail(what, `${s.entrance} is not a dungeon of majorLocations.json`); continue; }
    if (Math.abs(mid.y - e.y - UNDERGROUND) > 200) { fail(what, `the spawns (${mid.x},${mid.y}) are not under ${s.entrance} (${e.x},${e.y})`); continue; }
    waypoints = [{ x: e.x, y: e.y, plane: e.plane, label: e.label }, { ...mid, label }];
  } else if (mid.y >= UNDERGROUND) { fail(what, 'the spawns are under the ground: name the way in (entrance)'); continue; }
  spots.push({
    resource: s.resource, label, place: { ...mid, label }, count: line.pts.length, members: line.members,
    ...(waypoints ? { waypoints } : {}), ...(s.bank ? { bank: s.bank } : {}), ...(s.why ? { why: s.why } : {}),
  });
}

// Hostiles: the aggressive NPCs that stand at a spot, with their levels, from each page's own spawn lines (a fact of that NPC at that place only).
const hostileLines: { npc: string; levels: number[]; pts: Pt[] }[] = [];
for (const page of defs.hostiles.pages) {
  const text = await wikitext(page);
  const box = templates(text, 'Infobox Monster')[0] ?? {};
  if (!Object.entries(box).some(([k, v]) => /^aggressive\d*$/.test(k) && /^yes/i.test(v))) { fail(page, 'its Infobox Monster does not say aggressive'); continue; }
  for (const t of templates(text, 'LocLine')) {
    if (/^yes$/i.test(t.members ?? '')) continue;
    const levels = (t.levels ?? '').split(',').map((x) => num(x)).filter((x) => x > 0);
    const pts = pointsOf(t, Number(t.plane ?? 0) || 0);
    if (levels.length && pts.length) hostileLines.push({ npc: page, levels, pts });
  }
}
for (const s of spots) {
  const near = hostileLines.filter((h) => h.pts.some((p) => p.plane === s.place.plane && chebyshev(p, s.place) <= defs.hostiles.range));
  if (near.length) (s as { hostiles?: unknown }).hostiles = near.map((h) => ({ npc: h.npc, levels: h.levels, count: h.pts.length }));
}

// Every free gathering method of the catalogue has its resources here, and every listed method exists with the resource's skill.
for (const [id, list] of Object.entries(defs.methods)) {
  const m = methods.find((x) => x.id === id);
  if (!m) { fail(id, 'not a method of trainingMethods.json'); continue; }
  for (const rid of list) {
    const r = defs.resources.find((x) => x.id === rid);
    if (!r) fail(id, `unknown resource ${rid}`);
    else if (r.skill !== m.skill) fail(id, `${rid} trains ${r.skill}, the method ${m.skill}`);
    if (!spots.some((s) => s.resource === rid)) fail(id, `${rid} has no spot`);
  }
}
for (const m of methods) {
  if (!m.members && INFO[m.skill] && !defs.methods[m.id]) fail(m.id, 'a free gathering method without resources in skilling.defs.json');
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify({
  source: 'scripts/skilling.defs.json checked against the OSRS Wiki (skilling success charts, info templates, tool tables, action lengths, ObjectLocLine spawns) by scripts/build-skilling.ts',
  generatedAt: new Date().toISOString().slice(0, 10),
  tools, resources, spots, methods: defs.methods,
}, null, 2) + '\n');
console.log(`Written ${resources.length} resources, ${spots.length} spots, ${Object.keys(defs.methods).length} methods to ${OUT}`);
