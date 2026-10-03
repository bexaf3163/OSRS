// Собирает src/data/weights.json с OSRS Wiki: вес предметов в килограммах (Bucket infobox_item, поле weight) — для
// плана подготовки: сколько весит сумка и надетое, что лучше оставить в банке на шаге без боя. Берутся предметы
// программы: база предметов (f2p-items.json) и снаряжение (gear.json). Нужна сеть. Запуск: npm run build-weights
// (около трёх минут). Чисел от себя нет: нет веса в вики — предмета нет в файле, и вес его неизвестен.

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
// Что обычно лежит в сумке на шагах маршрута, но не всегда есть в базе предметов.
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
writeFileSync(OUT, `${JSON.stringify({ source: 'OSRS Wiki: карточки предметов (Bucket infobox_item, поле weight), килограммы', updated: new Date().toISOString().slice(0, 10), items }, null, 1)}\n`);
console.log(`Весов: ${Object.keys(items).length}, без веса в вики: ${missing}`);
