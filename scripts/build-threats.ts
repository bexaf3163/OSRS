// Собирает src/data/threats.json с OSRS Wiki: максимальные удары и скорость противников шагов (Bucket infobox_monster) и
// сколько здоровья восстанавливает еда бесплатной версии (первая фраза «restores N Hitpoints» в статье). Нужна сеть.
// Запуск: npm run build-threats (около минуты). Чисел от себя нет: только то, что написано в вики.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/threats.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';

let last = 0;
async function get(params: Record<string, string>): Promise<Record<string, unknown>> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 400 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { headers: { 'User-Agent': UA } });
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

/** Противники: ключ в шагах (foes/threats), статья вики и версия (если у статьи их несколько). */
const THREATS: { key: string; page: string; version?: string; note?: string }[] = [
  { key: 'Count Draynor', page: 'Count Draynor' },
  { key: 'Al Kharid warrior', page: 'Al Kharid warrior' },
  { key: 'Flesh Crawler', page: 'Flesh Crawler', version: 'Level 28' },
  { key: 'Ithoi the Navigator', page: 'Ithoi the Navigator' },
  { key: 'Brutus', page: 'Brutus' },
  { key: 'Moss giant', page: 'Moss giant', version: 'Level 42' },
  { key: 'Ghast', page: 'Ghast', version: 'Level 30' },
  { key: 'Melzar the Mad', page: 'Melzar the Mad' },
  { key: 'Lesser demon', page: 'Lesser demon', version: 'Level 82' },
  { key: 'Elvarg', page: 'Elvarg' },
  { key: 'Ogress warrior', page: 'Ogress warrior', version: '1' },
  { key: 'Ogress shaman', page: 'Ogress shaman' },
];

/** Еда бесплатной версии, которую съедают за один укус. */
const FOODS = ['Shrimps', 'Anchovies', 'Sardine', 'Herring', 'Mackerel', 'Trout', 'Cod', 'Pike', 'Salmon', 'Tuna', 'Lobster', 'Bass', 'Swordfish', 'Cooked chicken', 'Cooked meat', 'Bread'];

const quote = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
const threats: Record<string, { page: string; version?: string; hits: { n: number; label: string }[]; speedTicks: number; hitpoints: number; combat: number }> = {};
for (const t of THREATS) {
  const res = await get({ action: 'bucket', query: `bucket('infobox_monster').select('page_name','version_anchor','max_hit','attack_speed','hitpoints','combat_level','is_members_only').where('page_name',${quote(t.page)}).limit(40).run()` });
  const rows = (res.bucket as Record<string, unknown>[]) ?? [];
  const row = rows.find((r) => !t.version || r.version_anchor === t.version) ?? rows[0];
  if (!row) { console.log(`  ✗ ${t.key}: нет карточки`); continue; }
  const raw = (Array.isArray(row.max_hit) ? row.max_hit : [row.max_hit]).map(String);
  const hits = raw.map((s) => ({ n: parseInt(s, 10), label: s.replace(/^\s*\d+\s*/, '').replace(/^\((.*)\)$/, '$1').trim() })).filter((h) => Number.isFinite(h.n));
  if (!hits.length) { console.log(`  ✗ ${t.key}: нет максимального удара (${raw.join(', ')})`); continue; }
  threats[t.key] = { page: t.page, ...(t.version ? { version: t.version } : {}), hits, speedTicks: Number(row.attack_speed) || 4, hitpoints: Number(row.hitpoints) || 0, combat: Number(row.combat_level) || 0 };
}

const foods: { name: string; heals: number }[] = [];
for (const name of FOODS) {
  const res = await get({ action: 'parse', page: name, prop: 'wikitext', redirects: '1' });
  const text = (res.parse as { wikitext?: string } | undefined)?.wikitext ?? '';
  const m = /restores?\s+(\d+)\s*\[\[Hitpoints/i.exec(text);
  if (m) foods.push({ name, heals: parseInt(m[1], 10) });
  else console.log(`  ✗ еда ${name}: фраза «restores N Hitpoints» не найдена`);
}

writeFileSync(OUT, `${JSON.stringify({
  source: 'OSRS Wiki: карточки монстров (Bucket infobox_monster) и статьи еды',
  generatedAt: new Date().toISOString().slice(0, 10),
  threats,
  foods,
}, null, 1)}\n`);
console.log(`Записано: противников ${Object.keys(threats).length}/${THREATS.length}, еды ${foods.length}/${FOODS.length}`);
