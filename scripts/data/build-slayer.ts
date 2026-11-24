// Builds src/data/generated/slayer.json from the OSRS Wiki: each Slayer master's task list (monster, weight and
// the levels and quests a task needs) and the Slayer training page's on-task XP an hour for melee. Tasks that
// need Slayer reward points to unlock are left out, because a master never assigns them until bought. The
// masters' own requirements are checked against the sl-* methods of trainingMethods.json. It needs a network.
// Run: npm run build-slayer
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { num, wikitables, wikitext } from './wiki.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${root}src/data/generated/slayer.json`;
// Vannaka is left out: the Wiki rates under a third of his task weight, too little for a mean.
const MASTERS = [
  { method: 'sl-chaeldar', name: 'Chaeldar', page: 'Chaeldar' },
  { method: 'sl-konar', name: 'Konar quo Maten', page: 'Konar quo Maten' },
  { method: 'sl-nieve', name: 'Nieve', page: 'Nieve/Slayer assignments' },
  { method: 'sl-duradel', name: 'Duradel', page: 'Duradel/Slayer assignments' },
];

/** What a cell shows: "[[A|B]]s" is "Bs", templates and tags dropped. */
const shown = (cell: string) => cell.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}|<[^>]*>/g, '').trim();
const key = (monster: string) => shown(monster).toLowerCase();

/** The melee rate of a "Approx. XP/h" cell: the "(Melee)" figure, else the first one whose label names no other
 *  style or tool (cannon, Magic, a bow). Null when every figure needs something melee does not. */
function meleeRate(cell: string): [number, number] | null {
  const parts = cell.split(/<br\s*\/?>/).map((p) => /([\d,]+)(?:\s*[–-]\s*([\d,]+))?\s*(?:\(([^)]*)\))?/.exec(shown(p))).filter((m) => m !== null);
  const pick = parts.find((m) => /^melee$/i.test(m[3] ?? '')) ?? parts.find((m) => !/magic|cannon|venator|bow|barrage|burst|ranged|melee/i.test(m[3] ?? ''));
  return pick ? [num(pick[1]), num(pick[2] ?? pick[1])] : null;
}

const problems: string[] = [];
const training = await wikitext('Slayer training');
const summary = wikitables(training).find((t) => t.headers.some((h) => /XP\/h/.test(h)));
if (!summary) throw new Error('Slayer training: no task summary table');
const rates: Record<string, [number, number]> = {};
for (const row of summary.rows) {
  const rate = meleeRate(row.at(-1) ?? '');
  if (rate?.[0]) rates[key(row[0])] = rate;
}

const access = wikitables(training)[0].rows;
const methods = (JSON.parse(readFileSync(`${root}src/data/authored/trainingMethods.json`, 'utf8')) as { methods: { id: string; needs?: { type: string; skill?: string; min?: number; quest?: string }[] }[] }).methods;
const masters: Record<string, { name: string; tasks: { monster: string; weight: number; skills: Record<string, number>; quests: string[]; anyQuest?: true }[] }> = {};
for (const master of MASTERS) {
  // The master's own requirements ("[[Lost City]], 70 combat or 99 Slayer") against the method's needs.
  const use = access.find((r) => shown(r[0]).startsWith(master.name))?.[2].split(' or ')[0] ?? '';
  const wants = { combat: num(/(\d+) combat/.exec(use)?.[1]) || 0, slayer: num(/\+(\d+) Slayer/.exec(use)?.[1]) || 0, quests: [...use.matchAll(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g)].map((q) => q[1]) };
  const needs = methods.find((m) => m.id === master.method)?.needs ?? [];
  const has = (skill: string) => needs.find((n) => n.type === 'skill' && n.skill === skill)?.min ?? 0;
  if (has('combat') !== wants.combat || has('slayer') !== wants.slayer || wants.quests.some((q) => !needs.some((n) => n.quest === q))) problems.push(`${master.method}: needs differ from the Wiki's "${use}"`);

  const table = wikitables(await wikitext(master.page)).find((t) => t.headers.some((h) => /weight/i.test(h)));
  if (!table) { problems.push(`${master.page}: no task table`); continue; }
  const col = (re: RegExp) => table.headers.findIndex((h) => re.test(h));
  const [mon, req] = [col(/Monster/), col(/Unlock requirement/)];
  const tasks = table.rows.flatMap((row) => {
    const text = row[req] ?? '';
    const last = row.at(-1) ?? '';
    const weight = num(/weight\|(\d+)/.exec(last)?.[1] ?? last);
    if (!weight) { problems.push(`${master.name}: no weight for ${row[mon]}`); return []; }
    if (/unlocked/i.test(text)) return [];
    const skills = Object.fromEntries([...text.matchAll(/\{\{SCP\|(\w+)\|(\d+)\}\}/g)].map((s) => [s[1].toLowerCase(), Number(s[2])]));
    const quests = [...text.matchAll(/(?:completion of|started|or|and) \[\[([^\]|#]+)/g)].map((q) => q[1]);
    return [{ monster: shown(row[mon]), weight, skills, quests, ...(/\]\] or \[\[/.test(text) ? { anyQuest: true as const } : {}) }];
  });
  masters[master.method] = { name: master.name, tasks };
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

writeFileSync(OUT, JSON.stringify({
  source: 'OSRS Wiki Slayer master assignment tables and Slayer training task summary (melee XP an hour), scripts/data/build-slayer.ts',
  generatedAt: new Date().toISOString().slice(0, 10),
  masters,
  rates,
}, null, 2) + '\n');
for (const [id, m] of Object.entries(masters)) {
  const all = m.tasks.reduce((a, t) => a + t.weight, 0), known = m.tasks.reduce((a, t) => a + (rates[key(t.monster)] ? t.weight : 0), 0);
  console.log(`${id}: ${m.tasks.length} tasks, ${Math.round((known / all) * 100)}% of the weight has a melee rate`);
}
