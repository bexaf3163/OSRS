// Собирает src/data/moneyMaking.json с OSRS Wiki: способы заработка бесплатной версии (список «Money making guide/
// Free-to-play» и карточка Mmgtable каждой статьи). Нужна сеть. Запуск: npm run build-money (около минуты).
//
// Берётся только то, что написано в вики: название, выручка в час по текущим ценам биржи (снимок на дату сборки),
// напряжённость, требуемые и рекомендуемые уровни, квесты и предметы. Выручка — не обещание: она зависит от цен в
// момент снимка, программа показывает дату снимка. От себя здесь лишь разбор разметки.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MoneyData, MoneyMethod } from '../src/types/index.ts';
import { mmgFields, parseCapital, parseInputs, parseSkillsHtml, plain, skillsNote, wikiPlain } from './money-parse.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/moneyMaking.json`;
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
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status} ${params.page ?? ''}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// 1. Список: название, выручка в час, напряжённость, ссылка на статью.
const list = await get({ action: 'parse', page: 'Money_making_guide/Free-to-play', prop: 'text' });
const html = (list.parse as { text: string }).text;
const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => m[1]);
const entries: { title: string; page: string; profit: number; intensity: string; members: boolean; skillsHtml: string }[] = [];
for (const r of rows) {
  const cells = [...r.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((m) => m[1]);
  if (cells.length < 6 || /Hourly profit/i.test(cells[1])) continue;
  const href = /href="\/w\/([^"#]+)"/.exec(cells[0]);
  const profit = parseInt(plain(cells[1]).replace(/[^\d]/g, ''), 10);
  if (!href || !Number.isFinite(profit)) continue;
  entries.push({
    title: plain(cells[0]), page: decodeURIComponent(href[1]).replace(/_/g, ' '), profit,
    intensity: plain(cells[4]), members: plain(cells[5]).length > 0, skillsHtml: cells[2],
  });
}
console.log(`В списке: ${entries.length}`);

// 2. Карточка каждой статьи.
const methods: MoneyMethod[] = [];
const problems: string[] = [];
for (const e of entries) {
  if (e.members) continue;
  try {
    const data = await get({ action: 'parse', page: e.page, prop: 'wikitext', redirects: '1' });
    const text = (data.parse as { wikitext: string }).wikitext;
    const f = mmgFields(text);
    if (!f.activity) { problems.push(`${e.page}: нет Mmgtable`); continue; }
    const quest = wikiPlain(f.quest ?? '');
    const item = wikiPlain(f.item ?? '');
    const other = wikiPlain(f.other ?? '');
    const capital = parseCapital(f.item ?? '');
    const inputs = parseInputs(f);
    methods.push({
      id: slug(e.title),
      title: e.title,
      url: `https://oldschool.runescape.wiki/w/${e.page.replace(/ /g, '_')}`,
      profit: e.profit,
      intensity: e.intensity,
      category: wikiPlain(f.category ?? ''),
      skills: parseSkillsHtml(e.skillsHtml),
      ...(skillsNote(e.skillsHtml) ? { skillsNote: skillsNote(e.skillsHtml) } : {}),
      ...(quest && !/^none$/i.test(quest) ? { quests: quest } : {}),
      ...(item && !/^none$/i.test(item) ? { items: item } : {}),
      ...(capital ? { capital } : {}),
      ...(inputs.length ? { inputs } : {}),
      ...(other && !/^none$/i.test(other) ? { other } : {}),
    });
  } catch (err) {
    problems.push(`${e.page}: ${(err as Error).message}`);
  }
}

methods.sort((a, b) => b.profit - a.profit);
const out: MoneyData = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'https://oldschool.runescape.wiki/w/Money_making_guide/Free-to-play',
  methods,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`Записано ${methods.length} способов в ${OUT}`);
if (problems.length) console.log(`Проблемы (${problems.length}):\n${problems.join('\n')}`);
