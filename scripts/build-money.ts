// Builds src/data/moneyMaking.json from the OSRS Wiki: the free-version money-making methods (the "Money making guide/
// Free-to-play" list and the Mmgtable card of each article). It needs a network. Run: npm run build-money (about a minute).
//
// Only what the wiki says is taken: the name, the revenue per hour at the current exchange prices (a snapshot at the build date),
// the intensity, the required and recommended levels, the quests and items. The revenue is not a promise: it depends on the prices at the
// moment of the snapshot, and the app shows the snapshot date. Only the markup parsing is from us.

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

// 1. The list: the name, the revenue per hour, the intensity, the article link.
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
console.log(`In the list: ${entries.length}`);

// 2. The card of each article.
const methods: MoneyMethod[] = [];
const problems: string[] = [];
for (const e of entries) {
  if (e.members) continue;
  try {
    const data = await get({ action: 'parse', page: e.page, prop: 'wikitext', redirects: '1' });
    const text = (data.parse as { wikitext: string }).wikitext;
    const f = mmgFields(text);
    if (!f.activity) { problems.push(`${e.page}: no Mmgtable`); continue; }
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
console.log(`Written ${methods.length} methods to ${OUT}`);
if (problems.length) console.log(`Problems (${problems.length}):\n${problems.join('\n')}`);
