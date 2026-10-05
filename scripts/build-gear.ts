// Builds src/data/gear.json from the OSRS Wiki: the free-version melee weapons and armor, amulets and what
// is handed out on Tutorial Island. And src/data/monsters.json — the defence of the opponents from the route steps (foes),
// which the weapons are compared against. It needs a network. Run: npm run build-gear (about a minute).
//
// The data is from the wiki only: ID, bonuses and speed (Bucket infobox_bonuses), shops and prices (storeline),
// the requirements from the item article text, and if it is silent — from the set article ("Adamant equipment") or the overview
// "Free-to-play PvP equipment" (scripts/gear-requirements.ts), the monsters — Bucket infobox_monster. Only the
// list of items is from us.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBonuses, fetchItemInfobox, fetchMonsters, fetchStores, fetchWikitext, type ItemBonuses } from '../src/services/wikiApi.ts';
import type { Foe, FoeData, GearData, GearPiece, GearRequirements, GearSlot, Step } from '../src/types/index.ts';
import { listedWithoutRequirements, requirementsFromText, setRule } from './gear-requirements.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/gear.json`;
const OUT_FOES = `${root}src/data/monsters.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';

const METALS = ['bronze', 'iron', 'steel', 'black', 'mithril', 'adamant', 'rune'] as const;
type Metal = typeof METALS[number];
/** The metal requirement per the wiki ("Players require 5 Attack to wield steel weapons"): a cross-check of what the article says. */
const METAL_LEVEL: Record<Metal, number> = { bronze: 1, iron: 1, steel: 5, black: 10, mithril: 20, adamant: 30, rune: 40 };

/** The item kind: the suffix in the name, the slot and the name itself. */
const KINDS: { kind: string; en: string; slot: GearSlot }[] = [
  { kind: 'dagger', en: 'dagger', slot: 'weapon' },
  { kind: 'sword', en: 'sword', slot: 'weapon' },
  { kind: 'scimitar', en: 'scimitar', slot: 'weapon' },
  { kind: 'longsword', en: 'longsword', slot: 'weapon' },
  { kind: 'mace', en: 'mace', slot: 'weapon' },
  { kind: 'warhammer', en: 'warhammer', slot: 'weapon' },
  { kind: 'battleaxe', en: 'battleaxe', slot: 'weapon' },
  { kind: '2h sword', en: '2h sword', slot: 'weapon' },
  { kind: 'axe', en: 'axe', slot: 'weapon' },
  { kind: 'pickaxe', en: 'pickaxe', slot: 'weapon' },
  { kind: 'full helm', en: 'full helm', slot: 'head' },
  { kind: 'med helm', en: 'med helm', slot: 'head' },
  { kind: 'platebody', en: 'platebody', slot: 'body' },
  { kind: 'chainbody', en: 'chainbody', slot: 'body' },
  { kind: 'platelegs', en: 'platelegs', slot: 'legs' },
  { kind: 'plateskirt', en: 'plateskirt', slot: 'legs' },
  { kind: 'kiteshield', en: 'kiteshield', slot: 'shield' },
  { kind: 'sq shield', en: 'sq shield', slot: 'shield' },
];

/** Without a metal: amulets and things from Tutorial Island and the start of the path. */
const EXTRA: { name: string; kind: string; set?: string }[] = [
  { name: 'Amulet of accuracy', kind: 'amulet' },
  { name: 'Amulet of defence', kind: 'amulet' },
  { name: 'Amulet of strength', kind: 'amulet' },
  { name: 'Amulet of power', kind: 'amulet' },
  { name: 'Wooden shield', kind: 'shield' },
  { name: 'Leather body', kind: 'leather', set: 'Leather armour' },
  { name: 'Leather chaps', kind: 'leather', set: 'Leather armour' },
  { name: 'Coif', kind: 'leather' },
  { name: 'Hardleather body', kind: 'leather' },
];

const SLOT: Record<string, GearSlot> = { weapon: 'weapon', '2h': 'weapon', head: 'head', body: 'body', legs: 'legs', shield: 'shield', neck: 'neck' };

// The wiki asks not to hurry: no more than one request per 350 ms, on a 429 — wait and repeat.
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

// v2: the requirements of all combat skills and the quests (reqFrom) — the old cache does not know them.
const CACHE = `${root}node_modules/.cache/osrs-put-gear-v2.json`;
const cache: Record<string, GearPiece> = (() => {
  if (process.argv.includes('--fresh') || !existsSync(CACHE)) return {};
  try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return {}; }
})();
const saveCache = () => { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); };

const OVERVIEW = 'Free-to-play PvP equipment';
const pages = new Map<string, string | null>();
/** The article of a set or an overview — one load for all the items. */
async function pageText(name: string): Promise<string | null> {
  if (!pages.has(name)) pages.set(name, (await fetchWikitext(fetchFn, name))?.text ?? null);
  return pages.get(name)!;
}

const wanted: { name: string; kind: string; metal?: Metal; slot?: GearSlot; set?: string }[] = [
  ...METALS.flatMap((metal) => KINDS.map((k) => ({
    name: `${metal[0].toUpperCase()}${metal.slice(1)} ${k.en}`,
    kind: k.kind, metal, slot: k.slot, set: `${metal[0].toUpperCase()}${metal.slice(1)} equipment`,
  }))),
  ...EXTRA,
];

const problems: string[] = [];
const items: GearPiece[] = [];
const fresh = wanted.filter((w) => !cache[w.name]);
console.log(`Items: ${wanted.length}, from the cache ${wanted.length - fresh.length}`);

// The bonuses — in a batch by articles; the item card, shops and text — one by one.
const boxes = new Map<string, Awaited<ReturnType<typeof fetchItemInfobox>>>();
for (const w of fresh) boxes.set(w.name, await fetchItemInfobox(fetchFn, w.name));
const bonuses: Map<string, ItemBonuses> = fresh.length
  ? await fetchBonuses(fetchFn, [...boxes.values()].filter(Boolean).map((b) => b!.pageName))
  : new Map();

for (const w of wanted) {
  if (cache[w.name]) { items.push(cache[w.name]); continue; }
  const box = boxes.get(w.name);
  if (!box) { problems.push(`${w.name}: no item card`); continue; }
  const b = bonuses.get(box.pageName);
  if (!b) { problems.push(`${w.name}: no bonuses`); continue; }
  const slot = SLOT[b.slot];
  if (!slot || (w.slot && w.slot !== slot)) { problems.push(`${w.name}: slot "${b.slot}"`); continue; }
  // The requirements: the item article → the set article → the free equipment overview. None anywhere — "not verified".
  const page = await fetchWikitext(fetchFn, box.pageName);
  const own = page ? requirementsFromText(page.text) : null;
  let req: GearRequirements | null = own === 'none' ? {} : own;
  let reqFrom = req ? box.pageName : undefined;
  if (!req && w.set) {
    const set = await pageText(w.set);
    const r = set ? setRule(set, slot === 'weapon' ? 'weapons' : 'armour', w.kind) : null;
    if (r) { req = r === 'none' ? {} : r; reqFrom = w.set; }
  }
  if (!req) {
    const overview = await pageText(OVERVIEW);
    if (overview && listedWithoutRequirements(overview, box.name)) { req = {}; reqFrom = OVERVIEW; }
  }
  if (!req) problems.push(`${w.name}: the requirements are found neither in the article nor in the set article — it will not go into the advice`);
  // A cross-check with the metal rule ("Players require 5 Attack to wield steel weapons"): a discrepancy goes for review.
  const top = Math.max(1, ...Object.entries(req ?? {}).filter(([k]) => k !== 'quests').map(([, v]) => v as number));
  if (req && w.metal && top !== METAL_LEVEL[w.metal]) problems.push(`${w.name}: the article says ${JSON.stringify(req)}, by the metal ${METAL_LEVEL[w.metal]}`);
  const stores = (await fetchStores(fetchFn, box.name).catch(() => [])).filter((s) => !s.members);
  const item: GearPiece = {
    id: box.id,
    name: box.name,
    slot,
    kind: w.kind,
    ...(w.metal ? { metal: w.metal } : {}),
    ...(b.slot === '2h' ? { twoHanded: true } : {}),
    ...(req && Object.keys(req).length ? { req } : {}),
    ...(req ? { reqFrom } : { reqUnverified: true }),
    members: box.members,
    tradeable: box.tradeable,
    attack: b.attack,
    defence: b.defence,
    strength: b.strength,
    ...(b.prayer ? { prayer: b.prayer } : {}),
    ...(b.speed !== undefined && slot === 'weapon' ? { speed: b.speed } : {}),
    ...(stores.length ? { shops: stores.map((s) => ({ shop: s.shopName.replace(/\.$/, ''), location: s.location, price: s.price, ...(s.owner ? { owner: s.owner } : {}) })) } : {}),
    iconUrl: box.iconUrl,
  };
  items.push(item);
  cache[w.name] = item;
  saveCache();
}

// The step opponents: an article may have several versions — we take the free-world version and the
// lowest-level one (Ghast from Nature Spirit — 30, Flesh Crawler — 28): the player meets it first.
const steps = JSON.parse(readFileSync(`${root}src/data/steps.json`, 'utf8')) as Step[];
const foeNames = [...new Set(steps.flatMap((s) => s.foes ?? []))];
const monsters = await fetchMonsters(fetchFn, foeNames);
const foes: Foe[] = [];
for (const name of foeNames) {
  const versions = monsters.get(name);
  if (!versions?.length) { problems.push(`${name}: no monster card`); continue; }
  const v = [...versions].sort((a, b) => Number(a.members) - Number(b.members) || a.combat - b.combat)[0];
  foes.push({
    name, ...(v.version ? { version: v.version } : {}),
    combat: v.combat, hitpoints: v.hitpoints, defenceLevel: v.defenceLevel, defence: v.defence, members: v.members,
  });
}

if (problems.length) console.log(`\nFor review:\n  ${problems.join('\n  ')}`);
const hard = problems.filter((p) => /no item card|no bonuses|slot/.test(p));
if (hard.length) {
  console.error('\ngear.json was not written: there is no data for the items above.');
  process.exit(1);
}

const data: GearData = {
  source: 'OSRS Wiki: item and bonus infoboxes (Bucket infobox_item, infobox_bonuses), shops (storeline, infobox_shop), requirements from the articles',
  updated: new Date().toISOString().slice(0, 10),
  items,
};
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`\nWritten ${items.length} items to ${OUT}; members: ${items.filter((i) => i.members).map((i) => i.name).join(', ') || 'none'}`);
const foeData: FoeData = {
  source: 'OSRS Wiki: monster infoboxes (Bucket infobox_monster): the opponents from the route steps (the foes field in steps.json)',
  updated: data.updated,
  foes,
};
writeFileSync(OUT_FOES, JSON.stringify(foeData, null, 2) + '\n');
console.log(`Written ${foes.length} opponents to ${OUT_FOES}: ${foes.map((f) => `${f.name} (${f.combat})`).join(', ')}`);
