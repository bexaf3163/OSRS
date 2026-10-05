// Checks that all the wiki links from steps.json, f2p-items.json and reference.json lead to existing articles and files.
// It needs a network. Run: npm run check-links

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Step, WikiItemDetail } from '../src/types/index.ts';
import { MAP_VERSION, tileUrl } from '../src/lib/map.ts';
import type { NpcSpot } from '../src/lib/stepPlaces.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const steps = JSON.parse(readFileSync(`${root}src/data/steps.json`, 'utf8')) as Step[];
const items = JSON.parse(readFileSync(`${root}src/data/f2p-items.json`, 'utf8')) as WikiItemDetail[];
const reference = readFileSync(`${root}src/data/reference.json`, 'utf8');
const npcs = (JSON.parse(readFileSync(`${root}src/data/npcLocations.json`, 'utf8')) as { npcs: Record<string, NpcSpot[]> }).npcs;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';

/** A link → the wiki page title ("File:…" for images). */
function titleOf(url: string): string | null {
  const page = url.match(/\/w\/([^#?]+)/);
  if (page) return decodeURIComponent(page[1]).replace(/_/g, ' ');
  const file = url.match(/\/images\/([^?#]+)/);
  if (file) return `File:${decodeURIComponent(file[1]).replace(/_/g, ' ')}`;
  return null;
}

const refs = new Map<string, Set<string>>();
const add = (where: string, url?: string) => {
  if (!url) return;
  const t = titleOf(url);
  if (!t) return;
  if (!refs.has(t)) refs.set(t, new Set());
  refs.get(t)!.add(where);
};

for (const s of steps) {
  add(s.id, s.wikiUrl);
  add(s.id, s.quickGuideUrl);
  add(s.id, s.imageUrl);
  add(`${s.id} NPC`, s.npc?.wikiUrl);
  if (s.mapUrl && !/World_map#\/m=\d+,\d+,\d$/.test(s.mapUrl)) console.log(`  ✗ ${s.id}: a strange map link ${s.mapUrl}`);
}
for (const i of items) {
  add(`item ${i.nameEn}`, i.wikiUrl);
  add(`icon ${i.nameEn}`, i.iconUrl);
}
// Where the steps' NPCs stand: the wiki article whose map the point was taken from.
for (const [name, rows] of Object.entries(npcs)) for (const r of rows) add(`NPC ${name}`, `https://oldschool.runescape.wiki/w/${encodeURIComponent(r.page.replace(/ /g, '_'))}`);
// The guide: the links in the text — to skills (and members), quests, the training guides the plan was checked against.
for (const [, url] of reference.matchAll(/\]\((https:\/\/oldschool\.runescape\.wiki\/[^)\s]+)\)/g)) add('reference', url);

const titles = [...refs.keys()];
const missing: string[] = [];
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  const url = `${API}?${new URLSearchParams({ action: 'query', titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = (await res.json()) as { query: { pages: { title: string; missing?: boolean }[]; normalized?: { from: string; to: string }[] } };
  for (const p of data.query.pages) if (p.missing) missing.push(p.title);
  await new Promise((r) => setTimeout(r, 400));
}

// The map tiles: the preview and the world map take them from maps.runescape.wiki by the render version from src/lib/map.ts.
const mapProblems: string[] = [];
const planes = new Set([...steps.flatMap((s) => [s.mapLocation, ...(s.resourceSpots ?? [])]).filter(Boolean).map((p) => p!.plane),
  ...Object.values(npcs).flat().map((r) => r.plane)]);
for (const plane of planes) {
  // The Lumbridge tile at scale 2 — it exists on every floor.
  const res = await fetch(tileUrl(2, plane, 50, 50), { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) mapProblems.push(`the tile of floor ${plane}: HTTP ${res.status}`);
}
// The wiki itself draws the map previews from the tiles of its current version — we check against it.
const page = await (await fetch('https://oldschool.runescape.wiki/w/Lumbridge', { headers: { 'User-Agent': UA } })).text();
const current = page.match(/maps\.runescape\.wiki\/osrs\/versions\/([\w-]+)\/tiles/)?.[1];
console.log(`Map tiles: version ${MAP_VERSION}, on the wiki now ${current ?? 'not found'}, floors on the route ${planes.size}`);
if (mapProblems.length) for (const m of mapProblems) console.log(`  ✗ ${m}`);
else console.log('  ✓ the tiles are served');
if (current && current !== MAP_VERSION) console.log(`  ! the wiki moved to ${current} — update MAP_VERSION in src/lib/map.ts (the old tiles still work)`);

console.log(`Wiki links checked: ${titles.length}`);
if (missing.length || mapProblems.length) {
  for (const t of missing) {
    const from = [...(refs.get(t) ?? refs.get(t.replace(/^File:/, 'File:')) ?? [])].join(', ');
    console.log(`  ✗ not on the wiki: ${t}${from ? ` — ${from}` : ''}`);
  }
  process.exit(1);
}
console.log('  ✓ all the articles and files exist');
