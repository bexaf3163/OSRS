// Builds src/data/weights.json from the OSRS Wiki: the item weight in kilograms (Bucket infobox_item, the weight field) — for
// the preparation plan: how much the bag and the worn items weigh, what is better left in the bank on a step without combat. The items taken are the app's:
// the item database (f2p-items.json) and the gear (gear.json). It needs a network. Run: npm run build-weights
// (about three minutes). No numbers of our own: no weight in the wiki — the item is not in the file, and its weight is unknown.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/weights.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';

let last = 0;
async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 350 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA } });
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

const read = <T>(rel: string): T => JSON.parse(readFileSync(`${root}${rel}`, 'utf8')) as T;
const names = new Set<string>();
for (const g of read<{ items: { name: string }[] }>('src/data/gear.json').items) names.add(g.name);
for (const i of read<{ nameEn: string }[]>('src/data/f2p-items.json')) names.add(i.nameEn);
// What usually lies in the bag on the route steps but is not always in the item database.
for (const n of ['Coins', 'Lobster', 'Swordfish', 'Trout', 'Salmon', 'Tuna', 'Shrimps', 'Bread', 'Cooked chicken', 'Cooked meat', 'Stamina potion (4)', 'Energy potion (4)', 'Super energy (4)', 'Law rune', 'Air rune', 'Fire rune', 'Water rune', 'Earth rune', 'Mind rune', 'Body rune', 'Chaos rune', 'Bronze arrow', 'Iron arrow', 'Steel arrow', 'Shortbow', 'Oak shortbow', 'Staff', 'Staff of fire', 'Rope', 'Spade', 'Hammer', 'Tinderbox', 'Knife', 'Bucket', 'Pot', 'Shears']) names.add(n);

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const items: Record<string, number> = {};
let missing = 0;
for (const name of [...names].sort()) {
  const res = await get({ action: 'bucket', query: `bucket('infobox_item').select('item_name','weight').where('item_name',${quote(name)}).limit(10).run()` });
  const rows = (res.bucket as Record<string, unknown>[]) ?? [];
  const kg = rows.map((r) => Number(Array.isArray(r.weight) ? r.weight[0] : r.weight)).find((n) => Number.isFinite(n));
  if (kg === undefined) { missing++; continue; }
  items[name] = Math.round(kg * 1000) / 1000;
}
writeFileSync(OUT, `${JSON.stringify({ source: 'OSRS Wiki: item infoboxes (Bucket infobox_item, the weight field), kilograms', updated: new Date().toISOString().slice(0, 10), items }, null, 1)}\n`);
console.log(`Weights: ${Object.keys(items).length}, without a weight in the wiki: ${missing}`);
