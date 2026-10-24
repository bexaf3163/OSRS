// The combat audit: every stage of the route where the player fights or can be attacked, found from the route data itself (the steps' opponents,
// threats, combat training paces and safespots, and the quest stage lines that say kill, fight or attack), and the curated record of what was
// checked for each (src/data/combatAudit.json). tests/combatAudit.test.ts holds the two together: a fight added to the route without an entry, or an
// entry whose stage is gone, fails the tests, and docs/COMBAT_AUDIT.md is written from both.

import type { Step } from '../types';
import { COMBAT_FOES } from './combatEstimate';
import { stepFightFoes } from './fightEstimate';

export type StageKind = 'training' | 'quest-fight' | 'incidental' | 'avoid' | 'not-combat';
export type Decision = 'retain' | 'revise' | 'branch' | 'defer';
export type Method = 'melee' | 'safespot' | 'other' | 'run' | 'none';

export interface AuditEnemy {
  name: string;
  level?: number;
  maxHit?: number;
  /** In combatFoes.json: the app estimates the fight with the player's kit. */
  table?: boolean;
}

export interface AuditEntry {
  stepId: string;
  kind: StageKind;
  /** The quest or the route cannot go on without it. */
  mandatory: boolean;
  objective: string;
  enemies: AuditEnemy[];
  method: Method;
  /** The quest stage lines found by the detector ("3.2" = section 3, line 2), so a new fight line asks for a look. */
  lines: string[];
  assumptions: string[];
  problems: string[];
  alternatives: string[];
  decision: Decision;
  /** What the audit changed in the route or the app (with the version). */
  changed?: string[];
  evidence: string[];
  /** Danger zones of dangerZones.json that warn in the game. */
  zones?: string[];
}

export interface AuditLedger {
  revision: string;
  note: string;
  stages: AuditEntry[];
}

export interface DetectedStage {
  stepId: string;
  /** Why the detector picked it: "foes: Hill Giant", "pacing: attack", "lines". */
  signals: string[];
  lines: string[];
}

type QuestStages = Record<string, { route?: { title?: string; steps?: string[] }[] }>;

const FIGHT = /\b(kill|kills|killed|defeat|fight|fights|slay|attack|attacks)\b/i;
const COMBAT_SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'magic', 'hitpoints', 'slayer']);

/** The stage lines of a quest that talk about a fight, as "section.line". */
export function fightLines(quest: QuestStages[string] | undefined): string[] {
  const out: string[] = [];
  (quest?.route ?? []).forEach((sec, i) => (sec.steps ?? []).forEach((line, j) => { if (FIGHT.test(line)) out.push(`${i}.${j}`); }));
  return out;
}

/** Every combat stage of the route, in route order. */
export function detectCombatStages(steps: readonly Step[], quests: QuestStages): DetectedStage[] {
  const out: DetectedStage[] = [];
  for (const s of steps) {
    const signals: string[] = [];
    if (s.foes?.length) signals.push(`foes: ${s.foes.join(', ')}`);
    if (s.threats?.length) signals.push(`threats: ${s.threats.join(', ')}`);
    if (s.pacing && COMBAT_SKILLS.has(s.pacing.skill)) signals.push(`pacing: ${s.pacing.skill}`);
    if (s.safespot) signals.push('safespot');
    if (s.followsMethod === 'ranged') signals.push('training: ranged');
    const lines = fightLines(quests[s.id]);
    if (lines.length) signals.push('quest lines');
    if (signals.length) out.push({ stepId: s.id, signals, lines });
  }
  return out;
}

/** What the app prepares for the stage today, worked out from the route, not written by hand: the estimate, the food, the zones. */
export function preparedFor(step: Step, entry: AuditEntry): { estimate: string[]; food: string | null; zones: string[] } {
  const estimate = step.pacing ? (step.foes ?? []).filter((n) => COMBAT_FOES.some((f) => f.name === n)) : stepFightFoes(step).map((f) => f.name);
  const food = (step.itemsRequired ?? []).find((i) => typeof i.heals === 'number');
  return { estimate, food: food ? `${food.nameEn} ${food.amount}` : null, zones: entry.zones ?? [] };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const DECISION_WORD: Record<Decision, string> = { retain: 'Retain', revise: 'Revised', branch: 'Branch', defer: 'Deferred' };

/** docs/COMBAT_AUDIT.md: the table of stages, then each stage in full. */
export function auditMarkdown(ledger: AuditLedger, steps: readonly Step[]): string {
  const by = new Map(steps.map((s) => [s.id, s]));
  const L: string[] = [];
  L.push('# Combat audit');
  L.push('');
  L.push(`Written by \`tests/combatAudit.test.ts\` from \`src/data/combatAudit.json\` (revision ${ledger.revision}) and the route data. Do not edit by hand: change the ledger or the route and run \`UPDATE_FIXTURES=1 npx vitest run tests/combatAudit.test.ts\`.`);
  L.push('');
  L.push(ledger.note);
  L.push('');
  const count = (d: Decision) => ledger.stages.filter((e) => e.decision === d).length;
  L.push(`${ledger.stages.length} stages: ${count('retain')} retained, ${count('revise')} revised, ${count('branch')} with a branch, ${count('defer')} deferred.`);
  L.push('');
  L.push('| Step | Kind | Mandatory | Opponents | Method | Estimate | Food in the item list | Decision |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const e of ledger.stages) {
    const s = by.get(e.stepId);
    const p = s ? preparedFor(s, e) : { estimate: [], food: null, zones: [] };
    const foes = e.enemies.map((x) => `${x.name}${x.level ? ` (${x.level})` : ''}`).join(', ') || '-';
    L.push(`| ${e.stepId} ${cell(s?.title ?? '?')} | ${e.kind} | ${e.mandatory ? 'yes' : 'no'} | ${cell(foes)} | ${e.method} | ${p.estimate.join(', ') || '-'} | ${p.food ?? '-'} | ${DECISION_WORD[e.decision]} |`);
  }
  L.push('');
  for (const e of ledger.stages) {
    const s = by.get(e.stepId);
    L.push(`## ${e.stepId} ${s?.title ?? ''}`.trimEnd());
    L.push('');
    L.push(`**${DECISION_WORD[e.decision]}.** ${e.objective}`);
    L.push('');
    const list = (title: string, xs: readonly string[] | undefined) => {
      if (!xs?.length) return;
      L.push(`${title}:`);
      L.push('');
      for (const x of xs) L.push(`- ${x}`);
      L.push('');
    };
    if (e.lines.length) L.push(`Quest stage lines: ${e.lines.join(', ')}.`), L.push('');
    list('Assumptions', e.assumptions);
    list('Problems', e.problems);
    list('Alternatives', e.alternatives);
    list('Changed', e.changed);
    list('Evidence', e.evidence);
    if (e.zones?.length) L.push(`In-game danger zones: ${e.zones.join(', ')}.`), L.push('');
  }
  return L.join('\n');
}
