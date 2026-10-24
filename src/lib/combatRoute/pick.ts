// The combat plan in effect, applied to its step. The route's step is the identity: its id, its completion trigger, its title and its items stay. What the
// plan changes is the part of the step that says where to fight and what: the opponent, the place the arrow leads to, the pace line the game draws, the
// instructions the step page shows first and the notes. It is applied the same way for the preparation list, the shopping list, the food plan, the arrow
// and the plugin, because all of them read the step the store hands out (the way the training method and the food plan already do): one change here, no
// second copy anywhere.
//
// The step is never completed by a plan: the trigger is the route's own (Attack 40 and 50 Big bones). A phase ends when its own goal is met by what the
// game shows (the XP reached, the item in hand), and the next phase starts; with every phase met the last one stays until the step itself closes.
//
// Since 2.69 the plan's own instructions replace the route's on the page: one set of instructions, the route's text folded as "the route as written".

import type { Field, InGameTarget, Step, StepPacing, StepItemRequirement } from '../../types';
import { levelForXp } from '../xp';
import type { EvaluatedPlan, Goal, MeleeSkill, PlanPhase, PlanReport } from './plans';
import type { Spot } from './spots';
import { armourDefence, armourItems, armourReady } from './armour';
import { gearById } from '../../services/gearAdvisor';
import type { PlayerState } from '../playerState';
import type { PriceView } from '../funding/quotes';

export interface CombatPick {
  kit?: StepItemRequirement[];
  kitDefence?: number;
  /** The plan's key: "split", "defence-first:20". */
  key: string;
  title: string;
  /** Who chose the plan: the guide by its recommendation, or the player. */
  source: 'auto' | 'player';
  /** One sentence: why this plan (the comparison with the route's own, or "your choice"). */
  why: string;
  /** The phase in hand, 1-based. */
  phase: number;
  phases: number;
  kind: PlanPhase['kind'];
  foe: string;
  /** The XP of one kill in the style trained: 4 per hit point of the opponent. */
  xpPerKill: number;
  spot: Spot;
  goals: Goal[];
  item?: { name: string; count: number };
  /** The phase as one line: "Cow: Attack to 40 (746 kills)". */
  text: string;
  /** The instruction of every phase from the one in hand on, in order. */
  steps: string[];
}

export interface Progress {
  state?: PlayerState;
  prices?: PriceView;
  xp: Partial<Record<MeleeSkill, number>> | null;
  /** How many of an item the player holds (bag and bank); null - not known. */
  held: (name: string) => number | null;
}

/** Whether a phase has what it set out to get, by what the game shows. Unknown is not done. */
export function phaseDone(p: PlanPhase, st: Progress): boolean {
  if (p.kind === 'armour') return armourReady(p.armour ?? [], p.foe.attackStyle, st.state);
  const haveItem = p.item ? st.held(p.item.name) : null;
  if (p.item && (haveItem === null || haveItem < p.item.count)) return false;
  if (p.kind === 'item') {
    return p.item !== undefined;
  }
  if (!p.goals.length || !st.xp) return false;
  return p.goals.every((g) => typeof st.xp![g.skill] === 'number' && (st.xp![g.skill] as number) >= g.exp);
}

/** The phase to be in now: the first not yet done; the last when all are. */
export function currentPhase(plan: EvaluatedPlan, st: Progress): number {
  const at = plan.phases.findIndex((p) => !phaseDone(p, st));
  return at < 0 ? plan.phases.length - 1 : at;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STYLE_WORD: Record<MeleeSkill, string> = { attack: 'Accurate', strength: 'Aggressive', defence: 'Defensive' };
const PLURAL: Record<string, string> = { Cow: 'cows', 'Giant frog': 'Giant frogs', Minotaur: 'Minotaurs', 'Hill Giant': 'Hill Giants' };
const plural = (foe: string) => PLURAL[foe] ?? `${foe}s`;
const goalText = (goals: readonly Goal[]) => goals.map((g) => `${cap(g.skill)} ${levelForXp(g.exp)}`).join(' and ');

/** What to do in one phase, in one sentence the page and the game can show. */
export function phaseInstruction(p: PlanPhase): string {
  if (p.kind === 'armour') return `At ${armourDefence(p.armour ?? [])} Defence, equip ${p.armour?.map(id => gearById.get(id)?.name).filter(Boolean).join(', ')} or usable equivalent/better armour. Withdraw what you own; buy only needed upgrades, keeping coins for food.`;
  const where = p.spot.place.label;
  const style = p.goals[0] ? ` on ${STYLE_WORD[p.goals[0].skill]}` : '';
  if (p.kind === 'item' && p.item) return `Fight the ${plural(p.foe.name)}${style} until ${p.item.count} ${p.item.name} are in the bank (about ${p.kills} kills): ${where}.`;
  const armour = !p.armour && p.kind === 'defence' && p.goals.some(g => g.skill === 'defence' && levelForXp(g.exp) === 10)
    ? ' At Defence 10, bank and equip your armour. If you need upgrades, use Gear to buy affordable steel armour before continuing; keep enough coins for food. The shopping detour is extra.' : '';
  return `Fight the ${plural(p.foe.name)}${style} until ${goalText(p.goals)}${p.item ? ` and ${p.item.count} ${p.item.name} are in the bank` : ''} (about ${p.kills} kills): ${where}.${armour}`;
}

/**
 * The pick for the plan in effect, or null when the route's own plan applies: none is selected, it is the route's own, or the plan is gone (its
 * conditions changed: the bones are already in hand) or not safe.
 */
export function resolvePick(report: PlanReport | null, key: string | null | undefined, st: Progress, source: 'auto' | 'player' = 'player', why = ''): CombatPick | null {
  if (!report || !key) return null;
  const plan = report.plans.find((p) => p.key === key);
  if (!plan || !plan.eligible || (plan.id === 'route' && !plan.phases.some(p => p.kind === 'armour'))) return null;
  const i = currentPhase(plan, st);
  const ph = plan.phases[i];
  const steps = plan.phases.slice(i).map((p, n) => {
    const line = phaseInstruction(p);
    return n === 0 ? line : `Then: ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  });
  return {
    key: plan.key, title: plan.title, source, why, phase: i + 1, phases: plan.phases.length, kind: ph.kind, foe: ph.foe.name, xpPerKill: 4 * ph.foe.hitpoints, spot: ph.spot, goals: ph.goals,
    ...(ph.item ? { item: ph.item } : {}), text: ph.text, steps,
    ...(ph.kind === 'armour' && ph.armour && st.state ? { kit: armourItems(ph.armour, ph.foe.attackStyle, st.state, st.prices), kitDefence: armourDefence(ph.armour) } : {}),
  };
}

export function samePicks(a: Record<string, CombatPick>, b: Record<string, CombatPick>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length
    && ka.every((k) => b[k] && a[k].key === b[k].key && a[k].phase === b[k].phase && a[k].foe === b[k].foe && a[k].text === b[k].text
      && a[k].source === b[k].source && a[k].why === b[k].why && a[k].steps.join('|') === b[k].steps.join('|') && JSON.stringify(a[k].kit) === JSON.stringify(b[k].kit));
}

/** The combat model follows the phase's XP/style; an item phase with explicit training has a projection too. The guide's current action remains its item goal. */
function pacingOf(step: Step, pick: CombatPick): StepPacing | undefined {
  if (!pick.goals.length || !step.pacing) return undefined;
  const [first, ...rest] = pick.goals;
  // The route's own opponent keeps the route's words; another one is named by its own.
  const same = pick.foe === step.foes?.[0];
  const base: StepPacing = {
    ...step.pacing, skill: first.skill, targetLevel: levelForXp(first.exp), targetExp: first.exp,
    actionName: same ? step.pacing.actionName : `${pick.foe.toLowerCase()}|${pick.foe.toLowerCase()}s`, expPerAction: same ? step.pacing.expPerAction : pick.xpPerKill,
  };
  delete base.also;
  delete base.goals;
  if (rest.length) {
    base.also = rest.map((g) => g.skill);
    base.goals = Object.fromEntries(rest.map((g) => [g.skill, { level: levelForXp(g.exp), exp: g.exp }]));
  }
  return base;
}

/** The fields that stay in view under a plan: the warnings. The route's other notes describe its own way and go to the folded "route as written". */
const KEEP_FIELDS = new Set(['Dangerous', 'Attention', 'Combat', 'Armour']);

/** The one line the game's plate shows for the phase: the opponent and what the phase is for. */
function plateGoal(pick: CombatPick): string {
  if (pick.kind === 'armour') return pick.text;
  const what = pick.kind === 'item' && pick.item ? `${pick.item.count} ${pick.item.name}` : `${goalText(pick.goals)}${pick.item ? ` and ${pick.item.count} ${pick.item.name}` : ''}`;
  return `${cap(plural(pick.foe))}: ${what}`;
}

/** The step as the plan in effect has it for the phase in hand. No pick - the same object. */
export function withCombatPlan(step: Step, pick: CombatPick | undefined): Step {
  if (!pick) return step;
  const g = step.inGame ?? {};
  const inGame: InGameTarget = { ...g, npcNames: pick.spot.npcNames, goal: plateGoal(pick) };
  if (pick.spot.waypoints?.length) inGame.pathWaypoints = pick.spot.waypoints;
  else delete inGame.pathWaypoints;
  delete inGame.worldPoint;
  const pacing = pacingOf(step, pick);
  const skill = step.pacing?.skill;
  const trainingSkill = pick.kind === 'item' && !pacing && (skill === 'attack' || skill === 'strength' || skill === 'defence') ? skill : undefined;
  const note: Field = {
    label: pick.source === 'player' ? 'Your plan' : 'Plan',
    text: `${pick.title}${pick.phases > 1 ? ` (part ${pick.phase} of ${pick.phases})` : ''}: ${pick.text}.${pick.why ? ` ${pick.why}` : ''}`,
  };
  const rest: Step = { ...step };
  delete rest.pacing;
  delete rest.how;
  const asWritten: NonNullable<Step['routeAsWritten']> = {
    ...(step.where ? { where: step.where } : {}), ...(step.how ? { how: step.how } : {}),
    ...(step.quickSteps?.length ? { quickSteps: step.quickSteps } : {}), ...(step.fields?.length ? { fields: step.fields } : {}),
  };
  return {
    ...rest, combatPlan: {
      key: pick.key, phase: pick.phase, source: pick.source,
      ...(trainingSkill ? { trainingSkill } : {}),
      ...(pick.kind === 'armour' ? { now: pick.text } : pick.kind === 'item' && pick.item ? { now: `Collect ${pick.item.count} ${pick.item.name} from ${cap(plural(pick.foe))}${pick.goals[0] ? ` on ${STYLE_WORD[pick.goals[0].skill]}` : ''}` } : {}),
      ...(pick.steps[1] ? { next: cap(pick.steps[1].replace(/^Then: /, '')) } : {}),
    }, foes: pick.kind === 'armour' ? [] : [pick.foe], mapLocation: { ...pick.spot.place }, inGame,
    ...(pick.kind === 'armour' && pick.kit ? { itemsRequired: pick.kit, itemsRecommended: [], requirements: [...(step.requirements ?? []), { type: 'skill' as const, skill: 'defence', min: pick.kitDefence ?? 10 }] } : {}),
    // The reason is said once, in the step status line (CombatRouteLine); the route's own how-to is folded with the rest of its text.
    where: pick.spot.where || step.where, quickSteps: pick.steps,
    ...(pacing ? { pacing } : {}),
    fields: [note, ...(step.fields ?? []).filter((f) => KEEP_FIELDS.has(f.label))],
    routeAsWritten: asWritten,
  };
}
