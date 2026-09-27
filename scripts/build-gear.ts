// Собирает src/data/gear.json с OSRS Wiki: оружие и броня ближнего боя бесплатной версии, амулеты и то,
// что выдают на обучающем острове. И src/data/monsters.json — защиту противников из шагов маршрута (foes),
// с которыми сравнивается оружие. Нужна сеть. Запуск: npm run build-gear (около минуты).
//
// Данные — только с вики: ID, бонусы и скорость (Bucket infobox_bonuses), магазины и цены (storeline),
// требования — из текста статьи предмета, а если она молчит — из статьи набора («Adamant equipment») или обзора
// «Free-to-play PvP equipment» (scripts/gear-requirements.ts), монстры — Bucket infobox_monster. От себя здесь лишь
// список предметов и русские названия.

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
/** Требование металла по вики («Players require 5 Attack to wield steel weapons»): сверка того, что в статье. */
const METAL_LEVEL: Record<Metal, number> = { bronze: 1, iron: 1, steel: 5, black: 10, mithril: 20, adamant: 30, rune: 40 };
const METAL_RU: Record<Metal, [string, string, string]> = {
  // мужской, женский, множественный
  bronze: ['Бронзовый', 'Бронзовая', 'Бронзовые'], iron: ['Железный', 'Железная', 'Железные'],
  steel: ['Стальной', 'Стальная', 'Стальные'], black: ['Чёрный', 'Чёрная', 'Чёрные'],
  mithril: ['Мифриловый', 'Мифриловая', 'Мифриловые'], adamant: ['Адамантовый', 'Адамантовая', 'Адамантовые'],
  rune: ['Рунический', 'Руническая', 'Рунические'],
};

/** Вид предмета: суффикс в названии, слот, род русского названия и само название. */
const KINDS: { kind: string; en: string; slot: GearSlot; g: 0 | 1 | 2; ru: string }[] = [
  { kind: 'dagger', en: 'dagger', slot: 'weapon', g: 0, ru: 'кинжал' },
  { kind: 'sword', en: 'sword', slot: 'weapon', g: 0, ru: 'меч' },
  { kind: 'scimitar', en: 'scimitar', slot: 'weapon', g: 0, ru: 'ятаган' },
  { kind: 'longsword', en: 'longsword', slot: 'weapon', g: 0, ru: 'длинный меч' },
  { kind: 'mace', en: 'mace', slot: 'weapon', g: 1, ru: 'булава' },
  { kind: 'warhammer', en: 'warhammer', slot: 'weapon', g: 0, ru: 'боевой молот' },
  { kind: 'battleaxe', en: 'battleaxe', slot: 'weapon', g: 1, ru: 'секира' },
  { kind: '2h sword', en: '2h sword', slot: 'weapon', g: 0, ru: 'двуручный меч' },
  { kind: 'axe', en: 'axe', slot: 'weapon', g: 0, ru: 'топор' },
  { kind: 'pickaxe', en: 'pickaxe', slot: 'weapon', g: 1, ru: 'кирка' },
  { kind: 'full helm', en: 'full helm', slot: 'head', g: 0, ru: 'полный шлем' },
  { kind: 'med helm', en: 'med helm', slot: 'head', g: 0, ru: 'средний шлем' },
  { kind: 'platebody', en: 'platebody', slot: 'body', g: 0, ru: 'нагрудник' },
  { kind: 'chainbody', en: 'chainbody', slot: 'body', g: 1, ru: 'кольчуга' },
  { kind: 'platelegs', en: 'platelegs', slot: 'legs', g: 2, ru: 'поножи' },
  { kind: 'plateskirt', en: 'plateskirt', slot: 'legs', g: 1, ru: 'латная юбка' },
  { kind: 'kiteshield', en: 'kiteshield', slot: 'shield', g: 0, ru: 'кайтовый щит' },
  { kind: 'sq shield', en: 'sq shield', slot: 'shield', g: 0, ru: 'квадратный щит' },
];

/** Без металла: амулеты и вещи с обучающего острова и из начала пути. */
const EXTRA: { name: string; ru: string; kind: string; set?: string }[] = [
  { name: 'Amulet of accuracy', ru: 'Амулет точности', kind: 'amulet' },
  { name: 'Amulet of defence', ru: 'Амулет защиты', kind: 'amulet' },
  { name: 'Amulet of strength', ru: 'Амулет силы', kind: 'amulet' },
  { name: 'Amulet of power', ru: 'Амулет мощи', kind: 'amulet' },
  { name: 'Wooden shield', ru: 'Деревянный щит', kind: 'shield' },
  { name: 'Leather body', ru: 'Кожаная куртка', kind: 'leather', set: 'Leather armour' },
  { name: 'Leather chaps', ru: 'Кожаные штаны', kind: 'leather', set: 'Leather armour' },
  { name: 'Coif', ru: 'Капюшон', kind: 'leather' },
  { name: 'Hardleather body', ru: 'Куртка из жёсткой кожи', kind: 'leather' },
];

const SLOT: Record<string, GearSlot> = { weapon: 'weapon', '2h': 'weapon', head: 'head', body: 'body', legs: 'legs', shield: 'shield', neck: 'neck' };

// Вики просит не спешить: не чаще одного запроса в 350 мс, при 429 — ждём и повторяем.
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

// v2: требования всех боевых навыков и квесты (reqFrom) — старый кэш их не знает.
const CACHE = `${root}node_modules/.cache/osrs-put-gear-v2.json`;
const cache: Record<string, GearPiece> = (() => {
  if (process.argv.includes('--fresh') || !existsSync(CACHE)) return {};
  try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return {}; }
})();
const saveCache = () => { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); };

const OVERVIEW = 'Free-to-play PvP equipment';
const pages = new Map<string, string | null>();
/** Статья набора или обзора — одна загрузка на все предметы. */
async function pageText(name: string): Promise<string | null> {
  if (!pages.has(name)) pages.set(name, (await fetchWikitext(fetchFn, name))?.text ?? null);
  return pages.get(name)!;
}

const wanted: { name: string; ru: string; kind: string; metal?: Metal; slot?: GearSlot; set?: string }[] = [
  ...METALS.flatMap((metal) => KINDS.map((k) => ({
    name: `${metal[0].toUpperCase()}${metal.slice(1)} ${k.en}`,
    ru: `${METAL_RU[metal][k.g]} ${k.ru}`,
    kind: k.kind, metal, slot: k.slot, set: `${metal[0].toUpperCase()}${metal.slice(1)} equipment`,
  }))),
  ...EXTRA,
];

const problems: string[] = [];
const items: GearPiece[] = [];
const fresh = wanted.filter((w) => !cache[w.name]);
console.log(`Предметов: ${wanted.length}, из кэша ${wanted.length - fresh.length}`);

// Бонусы — пачкой по статьям; карточка предмета, магазины и текст — по одному.
const boxes = new Map<string, Awaited<ReturnType<typeof fetchItemInfobox>>>();
for (const w of fresh) boxes.set(w.name, await fetchItemInfobox(fetchFn, w.name));
const bonuses: Map<string, ItemBonuses> = fresh.length
  ? await fetchBonuses(fetchFn, [...boxes.values()].filter(Boolean).map((b) => b!.pageName))
  : new Map();

for (const w of wanted) {
  if (cache[w.name]) { items.push(cache[w.name]); continue; }
  const box = boxes.get(w.name);
  if (!box) { problems.push(`${w.name}: нет карточки предмета`); continue; }
  const b = bonuses.get(box.pageName);
  if (!b) { problems.push(`${w.name}: нет бонусов`); continue; }
  const slot = SLOT[b.slot];
  if (!slot || (w.slot && w.slot !== slot)) { problems.push(`${w.name}: слот «${b.slot}»`); continue; }
  // Требования: статья предмета → статья набора → обзор бесплатного снаряжения. Нигде нет — «не проверено».
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
  if (!req) problems.push(`${w.name}: требования не найдены ни в статье, ни в статье набора — в советы не пойдёт`);
  // Сверка с правилом металла («Players require 5 Attack to wield steel weapons»): расхождение — на проверку.
  const top = Math.max(1, ...Object.entries(req ?? {}).filter(([k]) => k !== 'quests').map(([, v]) => v as number));
  if (req && w.metal && top !== METAL_LEVEL[w.metal]) problems.push(`${w.name}: в статье ${JSON.stringify(req)}, по металлу ${METAL_LEVEL[w.metal]}`);
  const stores = (await fetchStores(fetchFn, box.name).catch(() => [])).filter((s) => !s.members);
  const item: GearPiece = {
    id: box.id,
    name: box.name,
    nameRu: w.ru,
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

// Противники шагов: у статьи бывает несколько версий — берём версию бесплатного мира и самую
// низкоуровневую (Ghast из Nature Spirit — 30, Flesh Crawler — 28): с ней игрок встречается первым.
const steps = JSON.parse(readFileSync(`${root}src/data/steps.json`, 'utf8')) as Step[];
const foeNames = [...new Set(steps.flatMap((s) => s.foes ?? []))];
const monsters = await fetchMonsters(fetchFn, foeNames);
const foes: Foe[] = [];
for (const name of foeNames) {
  const versions = monsters.get(name);
  if (!versions?.length) { problems.push(`${name}: нет карточки монстра`); continue; }
  const v = [...versions].sort((a, b) => Number(a.members) - Number(b.members) || a.combat - b.combat)[0];
  foes.push({
    name, ...(v.version ? { version: v.version } : {}),
    combat: v.combat, hitpoints: v.hitpoints, defenceLevel: v.defenceLevel, defence: v.defence, members: v.members,
  });
}

if (problems.length) console.log(`\nНа проверку:\n  ${problems.join('\n  ')}`);
const hard = problems.filter((p) => /нет карточки|нет бонусов|слот/.test(p));
if (hard.length) {
  console.error('\ngear.json не записан: нет данных по предметам выше.');
  process.exit(1);
}

const data: GearData = {
  source: 'OSRS Wiki: карточки предметов и бонусов (Bucket infobox_item, infobox_bonuses), магазины (storeline, infobox_shop), требования — из статей',
  updated: new Date().toISOString().slice(0, 10),
  items,
};
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`\nЗаписано ${items.length} предметов в ${OUT}; members: ${items.filter((i) => i.members).map((i) => i.name).join(', ') || 'нет'}`);
const foeData: FoeData = {
  source: 'OSRS Wiki: карточки монстров (Bucket infobox_monster) — противники из шагов маршрута (поле foes в steps.json)',
  updated: data.updated,
  foes,
};
writeFileSync(OUT_FOES, JSON.stringify(foeData, null, 2) + '\n');
console.log(`Записано ${foes.length} противников в ${OUT_FOES}: ${foes.map((f) => `${f.name} (${f.combat})`).join(', ')}`);
