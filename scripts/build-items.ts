// Builds src/data/f2p-items.json from the OSRS Wiki and fills in wikiItemId and iconUrl for the items in steps.json.
// It needs a network. Run: npm run build-items (about 2–4 minutes, the wiki asks not to hurry).
//
// The data is from the wiki only: the description, trader prices, alchemy, shops, drops, spawns.
// Only the choice of items is from us.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Step, StepItemRequirement, WikiItemDetail } from '../src/types/index.ts';
import { fetchItemDetail, type MappingEntry } from '../src/services/wikiApi.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const STEPS = `${root}src/data/steps.json`;
const OUT = `${root}src/data/f2p-items.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';

/** The key F2P items outside the route: ores, bars, tools, fish, runes, equipment. */
const KEY_ITEMS: string[] = [
  'Copper ore', 'Tin ore', 'Iron ore', 'Silver ore',
  'Coal', 'Gold ore', 'Mithril ore', 'Adamantite ore',
  'Runite ore', 'Rune essence', 'Clay',
  'Bronze bar', 'Iron bar', 'Silver bar', 'Steel bar',
  'Gold bar', 'Mithril bar', 'Adamantite bar', 'Runite bar',
  'Logs', 'Oak logs', 'Willow logs', 'Maple logs', 'Yew logs',
  'Bronze axe', 'Iron axe', 'Steel axe', 'Mithril axe',
  'Adamant axe', 'Rune axe',
  'Bronze pickaxe', 'Iron pickaxe', 'Steel pickaxe',
  'Mithril pickaxe', 'Adamant pickaxe', 'Rune pickaxe',
  'Small fishing net', 'Fishing rod', 'Fly fishing rod', 'Harpoon',
  'Lobster pot', 'Fishing bait', 'Feather',
  'Tinderbox', 'Hammer', 'Chisel', 'Needle', 'Thread', 'Knife',
  'Shears', 'Spade', 'Bucket', 'Pot', 'Jug', 'Ring mould',
  'Raw shrimps', 'Shrimps', 'Raw anchovies', 'Anchovies',
  'Raw trout', 'Trout', 'Raw salmon', 'Salmon',
  'Raw tuna', 'Tuna', 'Raw lobster', 'Lobster',
  'Raw swordfish', 'Swordfish',
  'Air rune', 'Water rune', 'Earth rune', 'Fire rune',
  'Mind rune', 'Body rune', 'Chaos rune', 'Death rune',
  'Law rune', 'Nature rune', 'Cosmic rune',
  'Bones', 'Big bones', 'Cowhide', 'Leather', 'Hard leather',
  'Uncut sapphire', 'Uncut emerald', 'Uncut ruby', 'Uncut diamond',
  'Amulet of accuracy', 'Amulet of strength', 'Amulet of power',
  'Strength potion(4)', 'Attack potion(4)', 'Energy potion(4)',
  'Bronze scimitar', 'Iron scimitar', 'Steel scimitar',
  'Mithril scimitar', 'Adamant scimitar', 'Rune scimitar',
  'Rune sword', 'Rune battleaxe', 'Rune 2h sword',
  'Iron platebody', 'Steel platebody', 'Mithril platebody',
  'Adamant platebody', 'Rune platebody',
  'Rune full helm', 'Rune med helm', 'Rune platelegs',
  'Rune kiteshield', 'Anti-dragon shield',
  'Green d\'hide body', 'Green d\'hide vambraces',
  'Leather body', 'Leather chaps', 'Coif',
  'Shortbow', 'Oak shortbow', 'Willow shortbow',
  'Maple shortbow', 'Yew shortbow',
  'Bronze arrow', 'Iron arrow', 'Steel arrow', 'Mithril arrow',
  'Adamant arrow', 'Rune arrow',
  'Staff of air', 'Staff of fire', 'Wizard hat', 'Blue wizard robe',
  'Steel nails', 'Plank', 'Coins', 'Old school bond',
];

// The wiki limits the request rate: no more than one per 350 ms, on a 429 — wait and repeat.
let lastRequest = 0;
const fetchFn = async (url: string) => {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + 350 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok || attempt >= 6 || (res.status !== 429 && res.status < 500)) return res;
    const retryAfter = Number(res.headers.get('retry-after')) || 5 * attempt;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
  }
};

// A cache of the items already built: a repeated run fetches only what is missing. --fresh — build anew.
const CACHE = `${root}node_modules/.cache/osrs-put-items.json`;
const cache: Record<string, WikiItemDetail> = (() => {
  if (process.argv.includes('--fresh') || !existsSync(CACHE)) return {};
  try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return {}; }
})();
const saveCache = () => {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
};

const steps = JSON.parse(readFileSync(STEPS, 'utf8')) as Step[];
const stepItems = steps.flatMap((s) => [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])]);

const wanted = new Set<string>(KEY_ITEMS);
for (const it of stepItems) wanted.add(it.nameEn);

const mappingRes = await fetchFn('https://prices.runescape.wiki/api/v1/osrs/mapping');
if (!mappingRes.ok) throw new Error(`The price API answered ${mappingRes.status}`);
const mappingById = new Map((await mappingRes.json() as MappingEntry[]).map((m) => [m.id, m]));
const mapping = (id: number) => mappingById.get(id);

console.log(`Items to build: ${wanted.size}`);
const results = new Map<string, WikiItemDetail>();
const missing: string[] = [];
const names = [...wanted];
let done = 0;

for (const name of names) {
  const cached = cache[name];
  if (cached) {
    results.set(name, cached);
  } else {
    try {
      const d = await fetchItemDetail(fetchFn, name, mapping);
      if (d) {
        results.set(name, d);
        cache[name] = d;
        saveCache();
      } else missing.push(name);
    } catch (e) {
      missing.push(`${name} (${(e as Error).message})`);
    }
  }
  done++;
  if (done % 20 === 0) console.log(`  ${done}/${wanted.size}`);
}

if (missing.length) {
  console.error(`\nNot found on the wiki: ${missing.join(', ')}`);
  process.exit(1);
}

const items = [...results.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
writeFileSync(OUT, JSON.stringify(items, null, 2) + '\n');

// The IDs and icons — into the step items.
// By the name from the request: the wiki's letter case is sometimes different ("Old school bond").
const fill = (it: StepItemRequirement) => {
  const d = results.get(it.nameEn)!;
  if (d.nameEn !== it.nameEn) it.nameEn = d.nameEn;
  it.wikiItemId = d.id;
  it.iconUrl = d.iconUrl;
};
for (const s of steps) {
  s.itemsRequired?.forEach(fill);
  s.itemsRecommended?.forEach(fill);
}
writeFileSync(STEPS, JSON.stringify(steps, null, 2) + '\n');

console.log(`\nWritten: ${items.length} items to f2p-items.json; IDs and icons set on ${stepItems.length} step items.`);
console.log(`Members items among them: ${items.filter((i) => i.members).length}.`);
