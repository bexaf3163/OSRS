// Собирает src/data/majorLocations.json — словарь ключевых мест для «📍» в инспекторе предметов и карте.
// Нужна сеть. Запуск: npm run build-locations (около минуты).
//
// Координаты не пишутся руками: для каждого места берётся статья OSRS Wiki и её карта ({{Map}} в карточке).
// Руками здесь только список мест, их вид и синонимы — как их называют в строках магазинов и спавнов.
// Stronghold of Security и Varrock Sewers не вошли: у их статей карта — картинка, а не {{Map}}.
// Места ловли и руды берутся не из статьи (там карта всей области), а из строк {{ObjectLocLine}}
// на странице самого места ловли или руды — это точки, где они стоят в игре.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { articleMapPoint, fetchWikitext, locLinePoint, type WikiPoint } from '../src/services/wikiApi.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/majorLocations.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';

type Kind = 'city' | 'bank' | 'shop' | 'npc' | 'guild' | 'landmark' | 'dungeon' | 'transport' | 'fishing' | 'mine';

/** [название, вид, синонимы, статья вики (если отличается от названия)]. */
const PLACES: [string, Kind, string[], string?][] = [
  // Города и области
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
  // Гильдии
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
  // Подземелья
  ['Dwarven Mine', 'dungeon', ['Dwarven Mines']],
  ['Edgeville Dungeon', 'dungeon', []],
  ['Asgarnian Ice Dungeon', 'dungeon', []],
  // Банки
  ['Varrock West Bank', 'bank', []],
  ['Varrock East Bank', 'bank', []],
  ['Falador East Bank', 'bank', []],
  ['Falador West Bank', 'bank', []],
  ['Draynor Bank', 'bank', ['Draynor Village bank'], 'Draynor bank'],
  ['Al Kharid Bank', 'bank', [], 'Al Kharid bank'],
  ['Edgeville Bank', 'bank', [], 'Edgeville bank'],
  // Магазины
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
  // NPC маршрута и продавцы
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
  // Транспорт
  ['Barfy Bill', 'transport', ['Lumbridge canoe station']],
  ['Tarquin', 'transport', ["Champions' Guild canoe station"]],
  ['Sigurd', 'transport', ['Barbarian Village canoe station']],
  // Шахты со своей статьёй и картой
  ['South-east Varrock mine', 'mine', ['Varrock east mine', 'Varrock East Mine']],
  ['South-west Varrock mine', 'mine', ['Varrock west mine', 'Varrock West Mine']],
  ['Al Kharid mine', 'mine', ['Al Kharid Mine']],
  ['Rimmington mine', 'mine', ['Rimmington Mine']],
  ['Barbarian Village mine', 'mine', []],
];

/** [название, вид, синонимы, страница места ловли или руды, место в её {{ObjectLocLine}}]. */
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
    failed.push(`${name}${article ? ' (нет {{Map}})' : ' (нет статьи)'}`);
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
  if (!article || !point) failed.push(`${name}${article ? ` (нет «${location}» в ObjectLocLine)` : ' (нет статьи)'}`);
  else out[name] = { x: point.x, y: point.y, plane: point.plane, label: name, kind, ...(aliases.length ? { aliases } : {}), page: article.title };
}

// Прежние записи не пропадают из-за сбоя сети — остаются, пока их статья снова не ответит.
let previous: Record<string, Entry> = {};
try {
  previous = (JSON.parse(readFileSync(OUT, 'utf8')) as { locations: Record<string, Entry> }).locations;
} catch {
  // Первый запуск.
}
for (const name of failed.map((f) => f.replace(/ \(.*\)$/, ''))) if (previous[name]) out[name] = previous[name];

const date = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, JSON.stringify({ source: 'OSRS Wiki, шаблон {{Map}} в статье', updated: date, locations: out }, null, 2) + '\n');
console.log(`Мест: ${Object.keys(out).length} из ${PLACES.length + SPOTS.length}`);
if (failed.length) console.log(`Без координат: ${failed.join('; ')}`);
