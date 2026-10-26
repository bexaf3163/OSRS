// The skills coverage ledger (2.70): every skill the app supports, what it covers for a free and a members account, the route's requirements, the gaps
// and the overlaps, what was fixed and how it is verified. Written to docs/SKILLS_COVERAGE.md from the data the app uses
// (UPDATE_FIXTURES=1 npx vitest run tests/skillsCoverage.test.ts); the test fails when the document is out of date or a check breaks.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { skillGuides } from '../src/data/skillGuideRegistry';
import { goals } from '../src/data';
import { bracketsOf, buildPath, SKILL_NAMES, type SkillGuideFile, type SkillName } from '../src/lib/skillGuide';
import { methodsFor, trainingMethods, type TrainingMethod } from '../src/lib/trainingRouter';
import { PROCESSING } from '../src/lib/processingRates';
import { SKILLING } from '../src/lib/skillingRates';

const F2P_STAGES = 6;
const routeMax = (skill: string, last: number) => {
  const row = goals.rows.find((r) => r.id === skill);
  return row ? Math.max(0, ...row.values.slice(0, last).filter((v) => v.min > 1).map((v) => v.min)) : 0;
};

/** The levels a list of methods leaves uncovered between 1 and the cap: "15-20". */
function methodGaps(skill: string, members: boolean, cap: number): string[] {
  const list = methodsFor(skill).filter((m) => m.kind === 'method' && (members || !m.members));
  const gaps: string[] = [];
  let start: number | null = null;
  for (let lv = 1; lv < cap; lv++) {
    const covered = list.some((m) => m.from <= lv && (m.to === null || lv < m.to));
    if (!covered && start === null) start = lv;
    if (covered && start !== null) { gaps.push(`${start}-${lv - 1}`); start = null; }
  }
  if (start !== null) gaps.push(`${start}-${cap - 1}`);
  return gaps;
}

/** Where a path stops short of where it should reach, or has a hole. */
function pathProblems(g: SkillGuideFile, mode: 'fast' | 'afk', freeOnly: boolean): string[] {
  const path = buildPath(g, mode, () => false, g.start, freeOnly);
  const want = freeOnly ? g.f2pCap : 99;
  const out: string[] = [];
  const end = path.length ? path[path.length - 1].targetLevel : g.start;
  if (want > g.start && end < want) out.push(`${mode}${freeOnly ? ' free' : ''} ends at ${end}`);
  path.forEach((s, i) => { if (i && s.levelRange[0] !== path[i - 1].targetLevel) out.push(`${mode} hole before ${s.id}`); });
  for (const b of bracketsOf(path)) for (const s of b.steps) if (s.levelRange[0] < b.from || s.targetLevel > b.to) out.push(`${mode} label ${b.from}-${b.to} narrower than ${s.id}`);
  if (freeOnly) for (const s of path) if (s.members) out.push(`${mode} free path has members step ${s.id}`);
  return out;
}

interface Row {
  skill: SkillName;
  modes: string;
  guide: string;
  methods: string;
  route: string;
  gaps: string;
  status: string;
}

const rows: Row[] = SKILL_NAMES.map((skill) => {
  const g = skillGuides[skill];
  const free = g.steps.filter((s) => !s.members).length;
  const membersOnly = g.f2pCap === 0;
  const m = methodsFor(skill).filter((x) => x.kind === 'method');
  const mFree = m.filter((x) => !x.members).length;
  const problems = [
    ...(membersOnly ? [] : [...pathProblems(g, 'fast', true), ...pathProblems(g, 'afk', true)]),
    ...pathProblems(g, 'fast', false), ...pathProblems(g, 'afk', false),
  ];
  const gapsFree = membersOnly || !m.length ? [] : methodGaps(skill, false, g.f2pCap);
  const rFree = routeMax(skill, F2P_STAGES);
  const rAll = routeMax(skill, goals.stages.length);
  return {
    skill,
    modes: membersOnly ? 'members only' : `free to ${g.f2pCap}, members to 99`,
    guide: `${g.steps.length} steps (${free} free), levels ${g.start}-99`,
    methods: m.length ? `${m.length} (${mFree} free)` : 'none: the card shows the training plan row',
    route: rAll ? `free route ${rFree || '-'}, whole route ${rAll}` : 'not asked',
    gaps: [...problems, ...gapsFree.map((x) => `no catalogue method for free levels ${x}`)].join('; ') || 'none',
    status: 'automated data checks; not verified in the game',
  };
});

/** Registry support is distinct from a guide's bracket coverage, and still requires real readable player state. */
const modelOwner = (m: TrainingMethod): string | null => PROCESSING.methods[m.id] ? 'processing'
  : SKILLING.methods[m.id] ? 'gathering'
  : m.npcNames?.length && m.skills.some(s => ['attack', 'strength', 'defence', 'ranged', 'magic'].includes(s)) ? 'combat' : null;
const modelRows = SKILL_NAMES.map(skill => {
  const methods = methodsFor(skill).filter(m => m.kind === 'method');
  const modelled = methods.filter(m => modelOwner(m));
  return `| ${skill} | ${modelled.length ? `${modelled.length}: ${[...new Set(modelled.map(modelOwner))].join(', ')}` : 'none'} | ${methods.length - modelled.length} |`;
});
const md = [
  '# Skills coverage ledger',
  '',
  'Every skill the app supports. **Guide**: the leveling roadmap (`src/data/skills/<skill>.json`, built by `tools/skill-guides` from the OSRS Wiki). **Methods**:',
  'the training method catalogue (`src/data/trainingMethods.json`) behind "What to train with" and the route steps that follow a method. **Route**: the',
  'highest level the route asks for (free stages 1-6, then the whole route). **Gaps**: levels a path or the catalogue does not cover, and labels narrower',
  'than their steps. Generated by `tests/skillsCoverage.test.ts`.',
  '',
  'Fixed in 2.70: roadmap groups were labelled by fixed brackets ("Levels 30-40" over a step "Lvl 30 → 60"): labels now cover their steps. The three mixed',
  'filters ("Fastest / Quest-Driven", "AFK / Budget", "F2P Only") are two separate controls: priority (Fastest / Low effort) and, for a free account, a',
  'members preview. "Use the best axe you can wield" now says the axe works from the bag at the Woodcutting level (wielding needs Attack).',
  'Rates and consumable costs are personalised where the shared combat, gathering or processing registry supports the method. Other catalogue rates',
  'remain Wiki guides, not measured predictions. Missing prices stay unknown. Passive bone collection has no fixed bank-burying rate. Members methods',
  'beyond the verified registries and real-session calibration remain open; this catalogue coverage is not proof of in-game performance.',
  '',
  '| Skill | Account | Guide | Methods | Route asks | Gaps and problems | Verification |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.skill} | ${r.modes} | ${r.guide} | ${r.methods} | ${r.route} | ${r.gaps} | ${r.status} |`),
  '',
  `Catalogue: ${trainingMethods.length} entries. Skills with no catalogue method fall back to the training plan row of the skill page; they are said so, not shown as a full plan.`,
  '',
  '## Personalized engine support',
  '',
  'Counts below mean a method has a shared model dispatch, not that every item, spell, opponent, unlock or level is modelled. A model can return no prediction when data is unread or unsupported. Guide-only rates remain labelled Wiki estimates; no synthetic player stats fill the gaps. Agility, Thieving and Farming still have guide-only catalogue rates. Construction, Hunter, Slayer and Hitpoints use their guide row. Adding complete models for those is remaining work.',
  '',
  '| Skill | Model-backed catalogue methods | Guide-only catalogue methods |',
  '|---|---|---|',
  ...modelRows,
].join('\n') + '\n';

describe('skills coverage', () => {
  it('every guide path reaches its cap without holes, free paths hold no members step, and no group label is narrower than its steps', () => {
    const bad = rows.filter((r) => r.gaps !== 'none' && !/^no catalogue method/.test(r.gaps.split('; ')[0]));
    expect(bad.map((r) => `${r.skill}: ${r.gaps}`)).toEqual([]);
  });

  it('every route requirement of a free stage is within what a free account can reach', () => {
    for (const skill of SKILL_NAMES) {
      const g = skillGuides[skill];
      const need = routeMax(skill, F2P_STAGES);
      if (need > 1) expect(need, skill).toBeLessThanOrEqual(g.f2pCap || 99);
    }
  });

  it('is written from the data the app uses', () => {
    const FILE = new URL('../docs/SKILLS_COVERAGE.md', import.meta.url);
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, md);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === md, 'docs/SKILLS_COVERAGE.md is out of date: UPDATE_FIXTURES=1 npx vitest run tests/skillsCoverage.test.ts').toBe(true);
  });
});
