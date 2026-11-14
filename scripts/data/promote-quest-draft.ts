// Ships a checked quest draft: its route step into src/data/authored/steps.json, its stages into questStages.json and
// its Quest Helper class into tools/qh-machines/qhm/quests.py. It refuses a draft that contradicts its sources, puts a
// line off the ground, or lacks an item id or source. Afterwards run, in this order: npm run build-items (item ids and
// icons), the Quest Helper generators (tools/qh-machines/README.md), npm run fixtures, then all gates.
//   npm run quest-promote -- DruidicRitual S7-06
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collisionSubset } from '../../src/domain/travel/worldRouting.ts';
import { checkDraft, plain, replayStages, type QhFacts, type QuestDraft } from './quest-draft.ts';

const [slug, id] = process.argv.slice(2);
if (!slug || !/^S\d+-\d\d$/.test(id ?? '')) throw new Error('usage: npm run quest-promote -- <DraftName> <S7-06>');
const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');
const draft = JSON.parse(read(`src/data/drafts/${slug}.json`)) as QuestDraft;
const qh = JSON.parse(read(`src/data/drafts/${slug}.qh.json`)) as QhFacts;
const topology = collisionSubset(JSON.parse(read('src/data/generated/worldRouting.json')));
const blocking = [
  ...checkDraft(draft, qh),
  ...replayStages(draft.stages.stages, draft.step.mapLocation, topology, false).fails,
  ...draft.unknown.filter((line) => line.startsWith('item ')),
];
if (blocking.length) throw new Error(`${draft.quest} is not ready:\n  ${blocking.join('\n  ')}`);

const steps = JSON.parse(read('src/data/authored/steps.json')) as { id: string; stage: number; title: string }[];
if (steps.some((s) => s.id === id) || read('src/domain/persistence/progress.ts').includes(`'${id}'`)) throw new Error(`${id} is taken or retired`);
if (steps.some((s) => s.title === draft.quest)) throw new Error(`${draft.quest} is already on the route`);
const requires = draft.facts.requirements.quests.map((quest) => {
  const step = steps.find((s) => s.title === quest);
  if (!step) throw new Error(`${draft.quest} needs ${quest}, which is not on the route`);
  return step.id;
});

const { step, facts, stages } = draft;
const start = step.mapLocation;
const place = /\b(?:in|at|on|near)\s+(.+?)\.?$/.exec(start?.label ?? '')?.[1];
const where = place ? place[0].toUpperCase() + place.slice(1) : undefined;
const xp = Object.entries(facts.rewards.xp).map(([skill, amount]) => `${amount.toLocaleString('en-US')} ${skill[0].toUpperCase()}${skill.slice(1)} XP`);
const dialogue = [...new Set(stages.route.flatMap((section) => section.steps).flatMap((line) =>
  [...(line.split('Dialogue: ')[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1])))];
const shipped = {
  id, stage: Number(id.slice(1, id.indexOf('-'))), type: 'quest', title: step.title, qp: step.qp, requires,
  ...(step.membersOnly ? { membersOnly: true } : {}),
  wikiUrl: step.wikiUrl, quickGuideUrl: step.quickGuideUrl,
  ...(start ? { mapUrl: `https://oldschool.runescape.wiki/w/World_map#/m=${start.x},${start.y},${start.plane}`, mapLocation: { ...start, label: where ?? step.npc?.nameEn ?? step.title } } : {}),
  ...(step.npc ? { npc: { nameEn: step.npc.nameEn, ...(where ? { location: where } : {}),
    ...(start ? { floor: start.plane ? `${start.plane}${['st', 'nd', 'rd'][start.plane - 1]} floor` : 'Ground floor' } : {}), wikiUrl: `https://oldschool.runescape.wiki/w/${step.npc.nameEn.replaceAll(' ', '_')}` } } : {}),
  itemsRequired: step.itemsRequired.map(({ nameEn, amount, howToGet, wikiItemId }) => ({ nameEn, amount, howToGet, wikiItemId })),
  reward: [`${step.qp} QP`, ...xp].join(', '),
  doneWhen: 'The quest is green.',
  inGame: {
    npcNames: step.npc ? [step.npc.nameEn] : [], dialogChoices: dialogue,
    highlightItems: step.itemsRequired.map((item) => item.nameEn),
    completionTrigger: { type: 'QUEST_COMPLETED', questName: step.title },
  },
};
// The route keeps its stage order: the new step goes after the last one of its stage or an earlier one.
const at = steps.reduce((last, s, i) => (s.stage <= shipped.stage ? i : last), -1) + 1;
steps.splice(at, 0, shipped as never);
writeFileSync(`${root}src/data/authored/steps.json`, JSON.stringify(steps, null, 2) + '\n');

// questStages.json is laid out by hand in places, so the new quest is added as text in the file's own indentation.
const stagesFile = read('src/data/authored/questStages.json');
const next = steps[at + 1]?.id;
const anchor = next && stagesFile.includes(`\n  "${next}": {`) ? `\n  "${next}": {` : '\n }\n}';
const entry = JSON.stringify({ var: stages.var, route: stages.route, stages: stages.stages.map((s) => ({ at: s.at, do: s.do.map((line) => ({ ...line, t: plain(line.t) })) })) }, null, 1)
  .split('\n').map((line, i) => (i ? `  ${line}` : line)).join('\n');
const text = anchor === '\n }\n}' ? stagesFile.replace(anchor, `,\n  "${id}": ${entry}${anchor}`) : stagesFile.replace(anchor, `\n  "${id}": ${entry},${anchor}`);
JSON.parse(text);
writeFileSync(`${root}src/data/authored/questStages.json`, text);

const questsPy = read('tools/qh-machines/qhm/quests.py');
const row = `'${id}': ('${qh.cls}', '${qh.var[0]}', ${qh.var[1]}),`;
// QUESTS holds several rows per line; the new row follows the one with the nearest lower step id.
const before = [...questsPy.matchAll(/'(S\d+-\d\d)': \('\w+', '\w+', \d+\),/g)].filter((m) => m[1] < id).at(-1);
if (!before || questsPy.includes(`'${id}':`)) throw new Error('quests.py: no QUESTS row to follow, or the id is there');
const cut = before.index + before[0].length;
writeFileSync(`${root}tools/qh-machines/qhm/quests.py`, `${questsPy.slice(0, cut)} ${row}${questsPy.slice(cut)}`);
console.log(`${draft.quest} -> ${id}: step, ${stages.stages.length} stages and the Quest Helper class written. Next: npm run build-items, the Quest Helper generators, npm run fixtures.`);
