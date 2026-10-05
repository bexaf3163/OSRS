// Builds src/data/majorLocations.json — a dictionary of key places for the "📍" in the item inspector and the map.
// It needs a network. Run: npm run build-locations (about a minute).
//
// The coordinates are not written by hand: for each place an OSRS Wiki article and its map ({{Map}} in the card) are taken.
// By hand here are only the list of places, their kind and synonyms — how they are called in the shop and spawn lines.
// Stronghold of Security and Varrock Sewers are left out: their articles have a picture as the map, not {{Map}}.
// The fishing and ore places are taken not from the article (there the map shows the whole area) but from the {{ObjectLocLine}} lines
// on the page of the fishing or ore place itself — these are the points where they stand in the game.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { articleMapPoint, fetchWikitext, locLinePoint, type WikiPoint } from '../src/services/wikiApi.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/majorLocations.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';

type Kind = 'city' | 'bank' | 'shop' | 'npc' | 'guild' | 'landmark' | 'dungeon' | 'transport' | 'fishing' | 'mine';

/** [name, kind, synonyms, the wiki article (if different from the name)]. */
const PLACES: [string, Kind, string[], string?][] = [
  // Towns and areas
  ['Lumbridge', 'city', []],
  ['Lumbridge Castle', 'landmark', ['Lumbridge castle']],
  ['Lumbridge Swamp', 'landmark', ['Lumbridge swamp']],
  ['Varrock', 'city', []],
  ['Varrock Square', 'landmark', ['Varrock Center', 'Varrock centre', 'Varrock town square']],
  ['Grand Exchange', 'landmark', ['GE', 'Grand exchange']],
  ['Falador', 'city', []],
  ['Draynor Village', 'city', ['Draynor']],
  ['Draynor Manor', 'landmark', []],
  ['Port Sarim', 'city', []],
  ['Rimmington', 'city', []],
  ['Al Kharid', 'city', ['Al-Kharid']],
  ['Edgeville', 'city', []],
  ['Barbarian Village', 'city', []],
  ['Musa Point', 'city', ['Musa Point (Karamja)', 'Karamja']],
  ['Brimhaven', 'city', []],
  ['Catherby', 'city', []],
  ["Seers' Village", 'city', ['Seers Village']],
  ['Camelot', 'city', ['Camelot Castle']],
  ['Taverley', 'city', []],
  ['Burthorpe', 'city', []],
  ['East Ardougne', 'city', ['Ardougne']],
  ['West Ardougne', 'city', []],
  ['Yanille', 'city', []],
  ['Canifis', 'city', []],
  ['Rellekka', 'city', []],
  ['Entrana', 'city', []],
  ['Tree Gnome Stronghold', 'city', ['Gnome Stronghold']],
  ['Tree Gnome Village', 'city', []],
  ['Shilo Village', 'city', []],
  ['Pollnivneach', 'city', []],
  ['Nardah', 'city', []],
  ['Shantay Pass', 'landmark', []],
  ['Ferox Enclave', 'city', []],
  ['Corsair Cove', 'city', []],
  ['Wizards\' Tower', 'landmark', ['Wizards Tower', "Wizard's Tower"]],
  ['Ice Mountain', 'landmark', []],
  ['Goblin Village', 'city', []],
  ['Edgeville Monastery', 'landmark', ['Monastery']],
  ['Mudskipper Point', 'landmark', []],
  ['Crandor', 'landmark', []],
  ['Draynor jail', 'landmark', ['Draynor Village jail', 'Draynor Jail']],
  ['Port Sarim jail', 'landmark', ['Port Sarim Jail']],
  ['Lighthouse', 'landmark', []],
  // Guilds
  ["Champions' Guild", 'guild', ['Champions Guild']],
  ["Cooks' Guild", 'guild', ['Cooking Guild', "Cook's Guild"]],
  ['Crafting Guild', 'guild', []],
  ['Mining Guild', 'guild', []],
  ['Fishing Guild', 'guild', []],
  ['Ranging Guild', 'guild', []],
  ["Warriors' Guild", 'guild', ['Warriors Guild']],
  ["Wizards' Guild", 'guild', ['Wizards Guild']],
  ['Woodcutting Guild', 'guild', []],
  ['Farming Guild', 'guild', []],
  // Dungeons
  ['Dwarven Mine', 'dungeon', ['Dwarven Mines']],
  ['Edgeville Dungeon', 'dungeon', []],
  ['Asgarnian Ice Dungeon', 'dungeon', []],
  // Banks
  ['Varrock West Bank', 'bank', []],
  ['Varrock East Bank', 'bank', []],
  ['Falador East Bank', 'bank', []],
  ['Falador West Bank', 'bank', []],
  ['Draynor Bank', 'bank', ['Draynor Village bank'], 'Draynor bank'],
  ['Al Kharid Bank', 'bank', [], 'Al Kharid bank'],
  ['Edgeville Bank', 'bank', [], 'Edgeville bank'],
  // Shops
  ["Bob's Brilliant Axes", 'shop', ["Bob's Brilliant Axes."]],
  ['Lumbridge General Store', 'shop', []],
  ["Gerrant's Fishy Business", 'shop', ["Gerrant's Fishy Business."]],
  ["Zeke's Superior Scimitars", 'shop', ["Zeke's Superior Scimitars."]],
  ["Nurmof's Pickaxe Shop", 'shop', ["Nurmof's Pickaxe Shop."]],
  ['Varrock General Store', 'shop', []],
  ["Horvik's Armour Shop", 'shop', ["Horvik's Armour Shop."]],
  ["Aubury's Rune Shop", 'shop', ["Aubury's Rune Shop."]],
  ["Betty's Magic Emporium", 'shop', ["Betty's Magic Emporium."]],
  ["Diango's Toy Store", 'shop', []],
  ["Wydin's Food Store", 'shop', []],
  ["Brian's Archery Supplies", 'shop', ["Brian's Archery Supplies."]],
  ["Lowe's Archery Emporium", 'shop', ["Lowe's Archery Emporium."]],
  ["Thessalia's Fine Clothes", 'shop', []],
  ["Herquin's Gems", 'shop', []],
  ["Wayne's Chains", 'shop', ["Wayne's Chains - Chainmail Specialist"]],
  ["Cassie's Shield Shop", 'shop', []],
  ["Peksa's Helmet Shop", 'shop', ['Helmet Shop']],
  ["Dommik's Crafting Store", 'shop', []],
  ["Louie's Armoured Legs Bazaar", 'shop', []],
  ["Ranael's Super Skirt Store", 'shop', []],
  ['Al Kharid General Store', 'shop', []],
  ['Varrock Swordshop', 'shop', ['Varrock Sword Shop']],
  ["Zaff's Superior Staffs!", 'shop', ["Zaff's Superior Staffs"]],
  ["Grum's Gold Exchange", 'shop', []],
  ['Blue Moon Inn', 'shop', []],
  ['Rising Sun Inn', 'shop', []],
  ['Jolly Boar Inn', 'shop', []],
  // Route NPCs and sellers
  ['Fishing tutor', 'npc', ['Fishing Tutor']],
  ['Father Aereck', 'npc', []],
  ['Father Urhney', 'npc', []],
  ['Fred the Farmer', 'npc', []],
  ['Bob', 'npc', ['Bob (Lumbridge)']],
  ['Zeke', 'npc', []],
  ['Nurmof', 'npc', []],
  ['Gerrant', 'npc', []],
  ['Aubury', 'npc', []],
  ['Hans', 'npc', []],
  ['Duke Horacio', 'npc', []],
  ['Sedridor', 'npc', ['Archmage Sedridor']],
  ['Ned', 'npc', []],
  ['Count Check', 'npc', []],
  ['Veos', 'npc', []],
  ['Diango', 'npc', []],
  ['Horvik', 'npc', []],
  ['Thessalia', 'npc', []],
  // Transport
  ['Barfy Bill', 'transport', ['Lumbridge canoe station']],
  ['Tarquin', 'transport', ["Champions' Guild canoe station"]],
  ['Sigurd', 'transport', ['Barbarian Village canoe station']],
  // Mines with their own article and map
  ['South-east Varrock mine', 'mine', ['Varrock east mine', 'Varrock East Mine']],
  ['South-west Varrock mine', 'mine', ['Varrock west mine', 'Varrock West Mine']],
  ['Al Kharid mine', 'mine', ['Al Kharid Mine']],
  ['Rimmington mine', 'mine', ['Rimmington Mine']],
  ['Barbarian Village mine', 'mine', []],
];

/** [name, kind, synonyms, the fishing or ore place page, the place in its {{ObjectLocLine}}]. */
const SPOTS: [string, Kind, string[], string, string][] = [
  ['Lumbridge Swamp fishing spots', 'fishing', ['Lumbridge Swamp by Fishing tutor', 'Lumbridge Swamp fishing'], 'Fishing spot (small net, bait)', 'Lumbridge Swamp'],
  ['Draynor Village fishing spots', 'fishing', ['Draynor fishing', 'Draynor Village fishing'], 'Fishing spot (small net, bait)', 'Draynor Village'],
  ['Al Kharid fishing spots', 'fishing', ['Al Kharid fishing'], 'Fishing spot (small net, bait)', 'Al Kharid'],
  ['Barbarian Village fishing spots', 'fishing', ['Barbarian Village fly fishing', 'Barbarian Village fishing'], 'Rod Fishing spot (lure, bait)', 'Barbarian Village'],
  ['River Lum fishing spots', 'fishing', ['Lumbridge in the river Lum', 'River Lum fishing'], 'Rod Fishing spot (lure, bait)', 'Lumbridge in the river Lum'],
  ['Musa Point fishing spots', 'fishing', ['Musa Point fishing', 'Karamja fishing'], 'Fishing spot (cage, harpoon)', 'Musa Point'],
  ['Catherby fishing spots', 'fishing', ['Catherby fishing'], 'Fishing spot (big net, harpoon)', 'Catherby'],
  ['East Lumbridge Swamp mine', 'mine', ['Lumbridge Swamp mine', 'Lumbridge swamp mine'], 'Copper rocks', 'East Lumbridge Swamp mine'],
];

interface Entry extends WikiPoint {
  label: string;
  kind: Kind;
  aliases?: string[];
  page: string;
}

const fetchFn = (url: string) => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const out: Record<string, Entry> = {};
const failed: string[] = [];
for (const [name, kind, aliases, page] of PLACES) {
  const article = await fetchWikitext(fetchFn, page ?? name).catch(() => null);
  const point = article ? articleMapPoint(article.text) : null;
  if (!article || !point) {
    failed.push(`${name}${article ? ' (no {{Map}})' : ' (no article)'}`);
  } else {
    out[name] = { x: point.x, y: point.y, plane: point.plane, label: name, kind, ...(aliases.length ? { aliases } : {}), page: article.title };
  }
  await sleep(250);
}

const pages = new Map<string, { title: string; text: string } | null>();
for (const [name, kind, aliases, page, location] of SPOTS) {
  if (!pages.has(page)) {
    pages.set(page, await fetchWikitext(fetchFn, page).catch(() => null));
    await sleep(250);
  }
  const article = pages.get(page);
  const point = article ? locLinePoint(article.text, location) : null;
  if (!article || !point) failed.push(`${name}${article ? ` (no "${location}" in ObjectLocLine)` : ' (no article)'}`);
  else out[name] = { x: point.x, y: point.y, plane: point.plane, label: name, kind, ...(aliases.length ? { aliases } : {}), page: article.title };
}

// The earlier entries do not vanish because of a network failure — they stay until their article answers again.
let previous: Record<string, Entry> = {};
try {
  previous = (JSON.parse(readFileSync(OUT, 'utf8')) as { locations: Record<string, Entry> }).locations;
} catch {
  // The first run.
}
for (const name of failed.map((f) => f.replace(/ \(.*\)$/, ''))) if (previous[name]) out[name] = previous[name];

const date = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, JSON.stringify({ source: 'OSRS Wiki, the {{Map}} template in the article', updated: date, locations: out }, null, 2) + '\n');
console.log(`Places: ${Object.keys(out).length} of ${PLACES.length + SPOTS.length}`);
if (failed.length) console.log(`Without coordinates: ${failed.join('; ')}`);
