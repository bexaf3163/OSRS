// The audit of the training stages whose default changed in 2.69 ("a sensible plan is selected by default"): for every affected stage and the
// representative states, the old default, the new default and why. Written to docs/DEFAULT_PLANS.md from the same functions the app uses
// (UPDATE_FIXTURES=1 npx vitest run tests/defaultPlans.test.ts); the test fails when the document is out of date.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatePlans, planWhy, type PlanReport } from '../src/lib/combatRoute/plans';
import { selectPlan } from '../src/lib/combatRoute/selection';
import { adviseTraining, trainingMethods } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { allSteps } from '../src/data';
import { followedGoal } from '../src/lib/methodStep';
import { market } from './funding/market';
import { planInput, type Over } from './combatRoute/fixture';

const prices = market();
const report = (o: Over): PlanReport => evaluatePlans({ ...planInput({ foodPrice: prices.buy('Salmon')!.price, ...o }), prices, restriction: 'UNKNOWN' })!;
const title = (r: PlanReport, key: string) => {
  const p = r.plans.find((x) => x.key === key)!;
  return p.id === 'route' ? 'The route as written' : p.title;
};

interface Row { stage: string; state: string; old: string; now: string; why: string }
const rows: Row[] = [];

// --- Combat training stages (lib/combatRoute): before 2.69 the route as written applied until the player pressed "Use this plan".
const S403: [string, Over, { stored?: 'route' | 'defence-first:20'; busy?: boolean }][] = [
  ['Attack 30, Strength 21, Defence 1, 24 HP, Adamant scimitar, iron armour, 400 gp (low Defence, little money)', {}, {}],
  ['Attack 38, Strength 60, Defence 45, 60 HP (better levels and kit, supplies in hand)', { stats: { attack: 38, strength: 60, defence: 45, hitpoints: 60 }, xp: { attack: 33000, strength: 273742, defence: 61512, hitpoints: 400000 } }, {}],
  ['As the first, bank not read yet (unknown bank)', { bankSeen: false }, {}],
  ['As the first, 50 Big bones already banked', { items: { 'Big bones': [0, 50] } }, {}],
  ['As the first, the player chose "Defence 20 first" (explicit choice)', { adopted: 'defence-first:20' }, { stored: 'defence-first:20' }],
  ['As the first, the player chose the route as written (explicit choice)', { adopted: 'route' }, { stored: 'route' }],
  ['As the first, an older save with no choice (the old automatic default)', {}, {}],
  ['As the first, in the middle of a trip at the giants (food in the bag, fighting)', {}, { busy: true }],
];
for (const [state, over, opt] of S403) {
  const r = report(over);
  const sel = selectPlan(r, opt.stored ? { key: opt.stored, at: 1, by: 'player' } : undefined, { inProgress: !!opt.busy });
  const old = opt.stored ? title(r, opt.stored) : 'The route as written';
  const now = `${title(r, sel.key)}${sel.source === 'player' ? ' (kept: the player\'s choice)' : ''}${sel.pending ? `; from the next bank trip: ${title(r, sel.pending)}` : ''}${sel.offer ? `; offered: ${title(r, sel.offer)}` : ''}`;
  rows.push({ stage: 'Historical S4-03 collection fixture (Hill Giants)', state, old, now, why: planWhy(r, sel.pending ?? sel.key, sel.pending ? 'auto' : sel.source) || r.reason });
}

const s308 = report({ stepId: 'S3-08', stats: { attack: 22, strength: 16, defence: 1, hitpoints: 22 }, xp: { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 }, worn: ['Mithril scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'] });
{
  const sel = selectPlan(s308, undefined, { inProgress: false });
  rows.push({ stage: 'S3-08 Strength 20 and Attack 30 (Minotaurs)', state: 'Attack 22, Strength 16, Defence 1, 22 HP, Mithril scimitar, iron armour', old: 'The route as written', now: title(s308, sel.key), why: planWhy(s308, sel.key, sel.source) || s308.reason });
}

// --- Skill training (lib/trainingRouter): before 2.69 the default "Calm" style put AFK methods first; "Balanced" is the default now.
const progress = { version: 3, steps: {}, levels: {}, notes: {}, updatedAt: '' };
const stateAt = (skill: string, level: number) => buildPlayerState({ mode: 'f2p', stats: null, progress: { ...progress, levels: { [skill]: level } }, owned: null, gear: null, questsDone: null, player: null, connected: false });
const methodSteps = allSteps.filter((s) => followedGoal(s));
for (const s of methodSteps) {
  const goal = followedGoal(s)!;
  for (const level of [1, 20, 30, 40]) {
    if (level >= goal.target) continue;
    const old = adviseTraining({ skill: goal.skill, target: goal.target, state: stateAt(goal.skill, level), mode: 'f2p', style: 'chill' }).best?.method.name ?? 'none';
    const r = adviseTraining({ skill: goal.skill, target: goal.target, state: stateAt(goal.skill, level), mode: 'f2p', style: 'chill', priority: 'balanced' });
    rows.push({ stage: `${s.id} ${s.title}`, state: `${goal.skill} ${level} (F2P)`, old, now: r.best?.method.name ?? 'none', why: r.reason });
  }
}
const skills = [...new Set(trainingMethods.flatMap((m) => m.skills))].sort();
const changedSkills: Row[] = [];
for (const skill of skills) {
  for (const level of [1, 10, 20, 30, 40, 50]) {
    const old = adviseTraining({ skill, target: level + 10, state: stateAt(skill, level), mode: 'f2p', style: 'chill' }).best;
    const r = adviseTraining({ skill, target: level + 10, state: stateAt(skill, level), mode: 'f2p', style: 'chill', priority: 'balanced' });
    if (old?.method.id !== r.best?.method.id) changedSkills.push({ stage: `Skills page: ${skill}`, state: `level ${level} → ${level + 10} (F2P)`, old: old?.method.name ?? 'none', now: r.best?.method.name ?? 'none', why: r.reason });
  }
}
rows.push(...changedSkills);

const liveS403 = allSteps.find(s => s.id === 'S4-03')!;
const md = [
  '# Default-plan regression scenarios',
  '',
  'These are fixture-based comparisons, not a summary of the live route. Historical S4-03 rows deliberately use legacyCollectStep.json to retain old collection/selection regressions.',
  `Current S4-03: **${liveS403.title}**; target: ${liveS403.inGame?.npcNames?.join(', ')}. ${liveS403.doneWhen}`,
  '**Old default** compares the former ordering; **New default** is the selection for the stated fixture only. Generated by',
  '`tests/defaultPlans.test.ts` from the app\'s own functions (fixture data, not a live game).',
  '',
  'Rules: nothing chosen yet (including an older save) gets the recommendation at once; a choice the player made stays and a clearly better plan is',
  'offered; a better plan never moves the arrow in the middle of a trip, it waits for the next bank trip; a plan that becomes unsafe or impossible gives',
  'way at once. Skill methods: "Balanced" (the default) counts getting missing items, attention and material cost; an explicit "Efficient" from an',
  'older save stays as "Fastest"; "Relaxed" keeps the old calm order.',
  '',
  '| Stage | Player state | Old default | New default | Why |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.stage} | ${r.state} | ${r.old} | ${r.now} | ${r.why.replace(/\|/g, '/')} |`),
  '',
  `Steps that follow a training method: ${methodSteps.map((s) => s.id).join(', ')}. Combat training stages: S3-08, S4-03 (the only steps with an opponent and a melee XP goal).`,
  'Travel recommendations are outside this fixture coverage.',
].join('\n') + '\n';

describe('docs/DEFAULT_PLANS.md', () => {
  it('the reported character gets the plan worth most for its time by default; choices are kept; a trip is not interrupted', () => {
    const at = (s: string) => rows.find((r) => r.state.startsWith(s))!;
    // 2.75: the Hill Giants' Big bones are banked and sold on the way, which is worth more than the time faster spots save.
    expect(at('Attack 30, Strength 21').now).toBe('The route as written');
    expect(at('Attack 30, Strength 21').why).toMatch(/banking about [\d,]+ gp of Big bones/);
    expect(at('Attack 38, Strength 60').now).toBe('The route as written');
    expect(at('As the first, the player chose "Defence 20').now).toMatch(/kept: the player's choice/);
    expect(at('As the first, in the middle of a trip').now).toMatch(/^The route as written/);
  });

  it('is written from the app\'s own functions', () => {
    const FILE = new URL('../docs/DEFAULT_PLANS.md', import.meta.url);
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, md);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === md, 'docs/DEFAULT_PLANS.md is out of date: UPDATE_FIXTURES=1 npx vitest run tests/defaultPlans.test.ts').toBe(true);
  });
});
