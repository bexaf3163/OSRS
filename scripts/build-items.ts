// Собирает src/data/f2p-items.json с OSRS Wiki и проставляет wikiItemId и iconUrl предметам в steps.json.
// Нужна сеть. Запуск: npm run build-items (примерно 2–4 минуты, вики просит не спешить).
//
// Данные — только с вики: описание, цены у торговцев, алхимия, магазины, дроп, спавны.
// От себя здесь лишь выбор предметов и русские названия (перевод).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Step, StepItemRequirement, WikiItemDetail } from '../src/types/index.ts';
import { fetchItemDetail, type MappingEntry } from '../src/services/wikiApi.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const STEPS = `${root}src/data/steps.json`;
const OUT = `${root}src/data/f2p-items.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';

/** Ключевые предметы F2P вне маршрута: руды, слитки, инструменты, рыба, руны, снаряжение. */
const KEY_ITEMS: Record<string, string> = {
  'Copper ore': 'Медная руда', 'Tin ore': 'Оловянная руда', 'Iron ore': 'Железная руда', 'Silver ore': 'Серебряная руда',
  'Coal': 'Уголь', 'Gold ore': 'Золотая руда', 'Mithril ore': 'Мифриловая руда', 'Adamantite ore': 'Адамантовая руда',
  'Runite ore': 'Рунитовая руда', 'Rune essence': 'Руническая сущность', 'Clay': 'Глина',
  'Bronze bar': 'Бронзовый слиток', 'Iron bar': 'Железный слиток', 'Silver bar': 'Серебряный слиток', 'Steel bar': 'Стальной слиток',
  'Gold bar': 'Золотой слиток', 'Mithril bar': 'Мифриловый слиток', 'Adamantite bar': 'Адамантовый слиток', 'Runite bar': 'Рунитовый слиток',
  'Logs': 'Брёвна', 'Oak logs': 'Дубовые брёвна', 'Willow logs': 'Ивовые брёвна', 'Maple logs': 'Кленовые брёвна', 'Yew logs': 'Тисовые брёвна',
  'Bronze axe': 'Бронзовый топор', 'Iron axe': 'Железный топор', 'Steel axe': 'Стальной топор', 'Mithril axe': 'Мифриловый топор',
  'Adamant axe': 'Адамантовый топор', 'Rune axe': 'Рунический топор',
  'Bronze pickaxe': 'Бронзовая кирка', 'Iron pickaxe': 'Железная кирка', 'Steel pickaxe': 'Стальная кирка',
  'Mithril pickaxe': 'Мифриловая кирка', 'Adamant pickaxe': 'Адамантовая кирка', 'Rune pickaxe': 'Руническая кирка',
  'Small fishing net': 'Маленькая сеть', 'Fishing rod': 'Удочка', 'Fly fishing rod': 'Удочка нахлыстом', 'Harpoon': 'Гарпун',
  'Lobster pot': 'Ловушка для омаров', 'Fishing bait': 'Наживка', 'Feather': 'Перо',
  'Tinderbox': 'Огниво', 'Hammer': 'Молот', 'Chisel': 'Долото', 'Needle': 'Игла', 'Thread': 'Нитки', 'Knife': 'Нож',
  'Shears': 'Ножницы', 'Spade': 'Лопата', 'Bucket': 'Ведро', 'Pot': 'Горшок', 'Jug': 'Кувшин', 'Ring mould': 'Форма для колец',
  'Raw shrimps': 'Сырые креветки', 'Shrimps': 'Креветки', 'Raw anchovies': 'Сырые анчоусы', 'Anchovies': 'Анчоусы',
  'Raw trout': 'Сырая форель', 'Trout': 'Форель', 'Raw salmon': 'Сырой лосось', 'Salmon': 'Лосось',
  'Raw tuna': 'Сырой тунец', 'Tuna': 'Тунец', 'Raw lobster': 'Сырой омар', 'Lobster': 'Омар',
  'Raw swordfish': 'Сырая рыба-меч', 'Swordfish': 'Рыба-меч',
  'Air rune': 'Руна воздуха', 'Water rune': 'Руна воды', 'Earth rune': 'Руна земли', 'Fire rune': 'Руна огня',
  'Mind rune': 'Руна разума', 'Body rune': 'Руна тела', 'Chaos rune': 'Руна хаоса', 'Death rune': 'Руна смерти',
  'Law rune': 'Руна закона', 'Nature rune': 'Руна природы', 'Cosmic rune': 'Космическая руна',
  'Bones': 'Кости', 'Big bones': 'Большие кости', 'Cowhide': 'Коровья шкура', 'Leather': 'Кожа', 'Hard leather': 'Жёсткая кожа',
  'Uncut sapphire': 'Неогранённый сапфир', 'Uncut emerald': 'Неогранённый изумруд', 'Uncut ruby': 'Неогранённый рубин', 'Uncut diamond': 'Неогранённый алмаз',
  'Amulet of accuracy': 'Амулет точности', 'Amulet of strength': 'Амулет силы', 'Amulet of power': 'Амулет мощи',
  'Strength potion(4)': 'Зелье силы', 'Attack potion(4)': 'Зелье атаки', 'Energy potion(4)': 'Зелье энергии',
  'Bronze scimitar': 'Бронзовый ятаган', 'Iron scimitar': 'Железный ятаган', 'Steel scimitar': 'Стальной ятаган',
  'Mithril scimitar': 'Мифриловый ятаган', 'Adamant scimitar': 'Адамантовый ятаган', 'Rune scimitar': 'Рунический ятаган',
  'Rune sword': 'Рунический меч', 'Rune battleaxe': 'Руническая секира', 'Rune 2h sword': 'Рунический двуручный меч',
  'Iron platebody': 'Железный нагрудник', 'Steel platebody': 'Стальной нагрудник', 'Mithril platebody': 'Мифриловый нагрудник',
  'Adamant platebody': 'Адамантовый нагрудник', 'Rune platebody': 'Рунический нагрудник',
  'Rune full helm': 'Рунический полный шлем', 'Rune med helm': 'Рунический средний шлем', 'Rune platelegs': 'Рунические поножи',
  'Rune kiteshield': 'Рунический кайтовый щит', 'Anti-dragon shield': 'Щит от драконьего огня',
  'Green d\'hide body': 'Куртка из зелёной драконьей кожи', 'Green d\'hide vambraces': 'Наручи из зелёной драконьей кожи',
  'Leather body': 'Кожаная куртка', 'Leather chaps': 'Кожаные штаны', 'Coif': 'Капюшон',
  'Shortbow': 'Короткий лук', 'Oak shortbow': 'Дубовый короткий лук', 'Willow shortbow': 'Ивовый короткий лук',
  'Maple shortbow': 'Кленовый короткий лук', 'Yew shortbow': 'Тисовый короткий лук',
  'Bronze arrow': 'Бронзовая стрела', 'Iron arrow': 'Железная стрела', 'Steel arrow': 'Стальная стрела', 'Mithril arrow': 'Мифриловая стрела',
  'Adamant arrow': 'Адамантовая стрела', 'Rune arrow': 'Руническая стрела',
  'Staff of air': 'Посох воздуха', 'Staff of fire': 'Посох огня', 'Wizard hat': 'Шляпа волшебника', 'Blue wizard robe': 'Синяя мантия волшебника',
  'Steel nails': 'Стальные гвозди', 'Plank': 'Доска', 'Coins': 'Монеты', 'Old school bond': 'Облигация Old School Bond',
};

// Вики ограничивает частоту запросов: не чаще одного в 350 мс, при 429 — ждём и повторяем.
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

// Кэш уже собранных предметов: повторный запуск докачивает только недостающее. --fresh — собрать заново.
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

const wanted = new Map<string, string>(Object.entries(KEY_ITEMS));
for (const it of stepItems) if (!wanted.has(it.nameEn)) wanted.set(it.nameEn, it.nameRu);

const mappingRes = await fetchFn('https://prices.runescape.wiki/api/v1/osrs/mapping');
if (!mappingRes.ok) throw new Error(`API цен ответил ${mappingRes.status}`);
const mappingById = new Map((await mappingRes.json() as MappingEntry[]).map((m) => [m.id, m]));
const mapping = (id: number) => mappingById.get(id);

console.log(`Предметов к сборке: ${wanted.size}`);
const results = new Map<string, WikiItemDetail>();
const missing: string[] = [];
const names = [...wanted.keys()];
let done = 0;

for (const name of names) {
  const cached = cache[name];
  if (cached) {
    results.set(name, { ...cached, nameRu: wanted.get(name)! });
  } else {
    try {
      const d = await fetchItemDetail(fetchFn, name, wanted.get(name), mapping);
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
  console.error(`\nНе найдены на вики: ${missing.join(', ')}`);
  process.exit(1);
}

const items = [...results.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
writeFileSync(OUT, JSON.stringify(items, null, 2) + '\n');

// ID и иконки — в предметы шагов.
// По имени из запроса: у вики регистр иногда другой («Old school bond»).
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

console.log(`\nЗаписано: ${items.length} предметов в f2p-items.json; ID и иконки проставлены в ${stepItems.length} предметах шагов.`);
console.log(`Членских (members) среди них: ${items.filter((i) => i.members).length}.`);
