// Readiness for a step: whether there are enough levels, quests, items and coins, and what to do if not.
// One calculation on top of what the app already knows: levels from the game (or the profile), quest marks on the route,
// the bag and bank from RuneLite, the manual "already have" from the bulk purchase. It invents nothing: what the app does not
// know is "⚪ not checked", not "none" (UNKNOWN is not MISSING). Every problem comes with an action: a link to the skill plan
// or the quest step, "🧭 to the bank" for an item, the bulk list for buying.

import type { GameMode, PlayerStats, Progress, Step } from '../types';
import { levelById } from '../data';
import locationsJson from '../data/majorLocations.json';
import { isClosed, blockersOf } from './next-step';
import { nameKey, preflightItems, type OwnedState } from './checklist';
import type { GearState, NavTargetPayload } from '../services/runeliteBridge';
import { plural } from './shopping';
import { buildPlayerState, coinsOf, heldOf, questOf, type PlayerState } from './playerState';
import { evaluate } from './requirements';

export type ReadinessStatus =
  | 'READY'
  /** Everything is there, but something has to be taken from the bank or picked up during the quest. */
  | 'MINOR_PREP'
  | 'MISSING_ITEM'
  | 'MISSING_STATS'
  | 'MISSING_QUEST'
  | 'MISSING_MONEY'
  /** The step is closed: the steps before it are not done, or it is members-only. */
  | 'BLOCKED'
  /** No problems found, but part of the requirements cannot be checked (no connection to the game, levels not entered). */
  | 'UNKNOWN';

/** OK means met; BANK means have it but in the bank; PARTIAL means have part; MISSING means none; UNKNOWN means unknown. */
export type RequirementState = 'OK' | 'BANK' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';

export type ReadinessAction =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'nav'; label: string; target: NavTargetPayload };

export interface RequirementStatus {
  kind: 'step' | 'qp' | 'mode' | 'skill' | 'quest' | 'item' | 'coins';
  label: string;
  state: RequirementState;
  /** false means it does not hinder starting: needed during the quest (Agility 25 in The Grand Tree). */
  hard: boolean;
  detail?: string;
  /** Where it is known from: the game, the profile (entered manually), the "already have" mark, the step marks. */
  source?: 'game' | 'profile' | 'manual' | 'route';
  action?: ReadinessAction;
  /** For a level row: the skill and the needed level (for "what to train with"). */
  stat?: { skill: string; min: number };
  /** For an item row: the English name, by which it is searched in the bank, at the exchange and in a shop. */
  item?: string;
}

export interface StepReadiness {
  stepId: string;
  status: ReadinessStatus;
  requirements: RequirementStatus[];
  /** What is wrong, in order of importance; empty if all is well. */
  problems: RequirementStatus[];
  /** What could not be checked. */
  unknown: RequirementStatus[];
  /**
   * A training step whose goal is already reached (levels not below the step's goal): there is no need to train again.
   * Only when all the levels are known and the goal has no item conditions.
   */
  goalMet?: { skill: string; level: number; have: number; source: 'game' | 'profile' }[];
}

export interface ReadinessInput {
  step: Step;
  /** All the route's steps (for quests: the step where the quest is counted). */
  steps: Step[];
  progress: Progress;
  qp: number;
  mode: GameMode;
  stats: PlayerStats | null;
  owned: OwnedState | null;
  gear: GearState | null;
}

const COINS_ID = 995;

interface Place { x: number; y: number; plane: number; label: string; kind: string }
const places = Object.values((locationsJson as { locations: Record<string, Place> }).locations);
const banks = places.filter((p) => p.kind === 'bank');

/** The bank nearest to the step's place: go there for things, not across half the map. */
export function nearestBank(step: Step): Place | null {
  const at = step.mapLocation;
  if (!at || !banks.length) return null;
  return banks.reduce((a, b) => (dist(b, at) < dist(a, at) ? b : a));
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The step where a quest is counted (the auto-tick QUEST_COMPLETED by the quest name). */
export function questStepOf(steps: Step[], quest: string): Step | undefined {
  return steps.find((s) => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === quest);
}

/** A skill's level from the single state: from the game, otherwise the one entered in the profile, otherwise unknown. */
function levelFrom(state: PlayerState, skill: string): { level: number; source: 'game' | 'profile' } | null {
  const l = state.levels[skill];
  return l?.known ? { level: l.value, source: l.source === 'game' ? 'game' : 'profile' } : null;
}

/** As in the game's skills tab: Mining, Agility. */
const skillName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const skillPage = (id: string) => levelById.get(id)?.skill;
const gp = (n: number) => Math.round(n).toLocaleString('en-US');

/** Everything the readiness calculation needs: the route, the marks and the single player state (playerState.ts). */
export interface ReadinessContext {
  steps: Step[];
  progress: Progress;
  qp: number;
  mode: GameMode;
  state: PlayerState;
  /** A setback on a step shown in the game (a death, a teleport): the preparation plan goes into recovery mode. */
  recovery?: { stepId: string; recovery: import('./recovery').Recovery } | null;
}

/** Context from "raw" data (tests and places where there is no single state yet). */
export function contextOf(i: ReadinessInput): ReadinessContext {
  return {
    steps: i.steps, progress: i.progress, qp: i.qp, mode: i.mode,
    state: buildPlayerState({ mode: i.mode, stats: i.stats, progress: i.progress, owned: i.owned, gear: i.gear, questsDone: null }),
  };
}

export function stepReadiness(input: ReadinessInput): StepReadiness {
  return readinessOf(input.step, contextOf(input));
}

/**
 * A step's readiness. The outcomes ("have / in the bank / part / none / unknown") are given by the single requirements check
 * (requirements.ts) over the single player state; here there is only the order, the labels and the actions.
 */
export function readinessOf(step: Step, ctx: ReadinessContext): StepReadiness {
  const { steps, progress: p, qp, mode, state } = ctx;
  const reqs: RequirementStatus[] = [];

  // The game mode and the steps before it.
  if (step.membersOnly && mode === 'f2p') {
    reqs.push({ kind: 'mode', label: 'Members only', state: 'MISSING', hard: true, detail: 'A Members step: it is not needed in F2P mode.', source: 'route' });
  }
  const b = blockersOf(step, p, qp);
  for (const id of b?.steps ?? []) {
    const s = steps.find((x) => x.id === id);
    reqs.push({
      kind: 'step', label: `First ${id}${s ? ` "${s.title}"` : ''}`, state: 'MISSING', hard: true, source: 'route',
      action: { kind: 'link', label: `To step ${id}`, href: `#/step/${id}` },
    });
  }
  if (b?.qp) {
    reqs.push({
      kind: 'qp', label: `${b.qp.need} quest ${plural(b.qp.need, 'point', 'points')}`, state: 'MISSING', hard: true, detail: `now ${b.qp.have}, ${b.qp.need - b.qp.have} short`, source: 'route',
      action: { kind: 'link', label: 'Quests', href: '#/quests' },
    });
  }

  // Levels and quests from the quest article.
  for (const r of step.requirements ?? []) {
    if (r.type === 'skill') {
      const res = evaluate({ type: 'skill', skill: r.skill, min: r.min }, state);
      const have = levelFrom(state, r.skill);
      const label = `${skillName(r.skill)} ${r.min}`;
      const page = skillPage(r.skill);
      const action: ReadinessAction | undefined = page ? { kind: 'link', label: `⚡ Catch up ${skillName(r.skill)}`, href: `#/skills/${page}` } : undefined;
      const hard = r.when !== 'during';
      const note = r.when === 'during' ? ' Needed during the quest: you can start without it.' : '';
      const boost = r.boostable ? ' It can be raised temporarily (boost).' : '';
      if (res.state === 'UNKNOWN') {
        reqs.push({ kind: 'skill', label, state: 'UNKNOWN', hard, stat: { skill: r.skill, min: r.min }, detail: `level unknown: log in to the game with RuneLite or enter it on the skill page.${note}` });
      } else if (res.state === 'OK') {
        reqs.push({ kind: 'skill', label, state: 'OK', hard, stat: { skill: r.skill, min: r.min }, detail: `${res.have} ≥ ${r.min}`, ...(have ? { source: have.source } : {}) });
      } else {
        reqs.push({
          kind: 'skill', label, state: 'MISSING', hard, stat: { skill: r.skill, min: r.min }, ...(have ? { source: have.source } : {}),
          detail: `now ${res.have}, ${res.missing} short.${note}${boost}`,
          ...(action ? { action } : {}),
        });
      }
    } else {
      const qs = questStepOf(steps, r.quest);
      const game = questOf(state, r.quest);
      if (qs && isClosed(p, qs.id)) {
        reqs.push({ kind: 'quest', label: r.quest, state: 'OK', hard: true, detail: `step ${qs.id} is marked`, source: 'route' });
      } else if (game === 'DONE') {
        // The game knows better than the marks: the quest is counted even if the step on the route is not closed yet.
        reqs.push({ kind: 'quest', label: r.quest, state: 'OK', hard: true, detail: 'counted in the game', source: 'game' });
      } else if (qs) {
        reqs.push({
          kind: 'quest', label: r.quest, state: 'MISSING', hard: true, detail: `step ${qs.id} is not marked yet`, source: 'route',
          action: { kind: 'link', label: `🧭 To the quest: ${qs.id}`, href: `#/step/${qs.id}` },
        });
      } else if (game === 'NOT_DONE') {
        reqs.push({ kind: 'quest', label: r.quest, state: 'MISSING', hard: true, detail: 'the quest is not on the route and is not counted in the game', source: 'game' });
      } else {
        reqs.push({ kind: 'quest', label: r.quest, state: 'UNKNOWN', hard: true, detail: 'the quest is not on the route: the app cannot mark it done' });
      }
    }
  }

  // Items taken along (not obtained during the step) and coins.
  const bank = nearestBank(step);
  for (const it of preflightItems(step)) {
    const isCoins = it.id === COINS_ID || nameKey(it.nameEn) === 'coins';
    if (isCoins) {
      const res = evaluate({ type: 'money', amount: it.count }, state);
      const c = coinsOf(state);
      const label = `${gp(it.count)} gp`;
      if (res.state === 'UNKNOWN' && c.bag === null) {
        reqs.push({ kind: 'coins', label, state: 'UNKNOWN', hard: true, detail: 'how many coins you have is visible only from the game with RuneLite' });
      } else if (res.state === 'OK') {
        reqs.push({ kind: 'coins', label, state: 'OK', hard: true, detail: `${gp(c.bag!)} in the bag`, source: 'game' });
      } else if (res.state === 'BANK') {
        reqs.push({ kind: 'coins', label, state: 'BANK', hard: true, detail: `${gp(c.bag!)} in the bag, the rest is in the bank: take it`, source: 'game', ...(bank ? { action: bankNav(bank, step, 'Coins') } : {}) });
      } else if (res.state === 'UNKNOWN') {
        reqs.push({ kind: 'coins', label, state: 'UNKNOWN', hard: true, detail: `${gp(c.bag!)} in the bag; the bank was not opened in this session` });
      } else {
        // Where to earn: the nearest earning step on the route (cowhides, iron ore), no further than this step.
        const at = steps.findIndex((x) => x.id === step.id);
        const earn = steps.slice(0, at >= 0 ? at + 1 : steps.length).filter((x) => x.moneyGoal).pop() ?? steps.find((x) => x.moneyGoal);
        reqs.push({
          kind: 'coins', label, state: 'MISSING', hard: true, detail: `${gp(c.total ?? c.bag ?? 0)} in all, ${gp(res.missing ?? it.count)} short`, source: 'game',
          ...(earn ? { action: { kind: 'link' as const, label: `💰 Earn: ${earn.id}`, href: `#/step/${earn.id}` } } : {}),
        });
      }
      continue;
    }
    const key = it.id !== undefined ? `id:${it.id}` : `name:${nameKey(it.nameEn)}`;
    const res = evaluate({ type: 'item', name: it.nameEn, count: it.count, manualKey: key, ...(it.id !== undefined ? { id: it.id } : {}) }, state);
    const h = heldOf(state, it.nameEn, key);
    const label = `${it.nameEn}${it.count > 1 ? ` ×${it.count}${it.exact ? '' : '+'}` : ''}`;
    const shop: ReadinessAction = { kind: 'link', label: '🛒 To shopping', href: '#/shopping' };
    const manual = h.source === 'manual';
    const source: RequirementStatus['source'] = manual ? 'manual' : 'game';
    if (res.state === 'OK') {
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: 'OK', hard: true, source,
        detail: manual ? `marked "already have: ${state.manual[key]}"` : 'in the bag',
      });
    } else if (res.state === 'BANK') {
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: 'BANK', hard: true, source: 'game',
        detail: `${(h.bag ?? 0) + h.noted} in the bag, ${h.bank ?? 0} in the bank: take it from the bank`,
        ...(bank ? { action: bankNav(bank, step, it.nameEn) } : {}),
      });
    } else if (res.state === 'UNKNOWN') {
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: 'UNKNOWN', hard: true,
        detail: h.bag !== null ? `${h.bag + h.noted} in the bag; the bank was not opened in this session` : 'not checked: it needs a RuneLite connection or an "already have" mark in shopping',
      });
    } else {
      const have = res.have ?? 0;
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: res.state, hard: true, source,
        detail: manual ? `marked ${state.manual[key]}, ${res.missing} short` : have ? `have ${have}, ${res.missing} short` : 'in neither the bag nor the bank',
        action: shop,
      });
    }
  }

  const rank: Record<RequirementState, number> = { MISSING: 0, PARTIAL: 1, BANK: 2, UNKNOWN: 3, OK: 4 };
  const kindRank: Record<RequirementStatus['kind'], number> = { mode: 0, step: 1, qp: 2, quest: 3, skill: 4, item: 5, coins: 6 };
  const sorted = [...reqs].sort((a, b2) => rank[a.state] - rank[b2.state] || Number(b2.hard) - Number(a.hard) || kindRank[a.kind] - kindRank[b2.kind]);
  const problems = sorted.filter((r) => r.state === 'MISSING' || r.state === 'PARTIAL' || r.state === 'BANK');
  const unknown = sorted.filter((r) => r.state === 'UNKNOWN');
  const trig = step.inGame?.completionTrigger;
  let goalMet: StepReadiness['goalMet'];
  if (trig?.type === 'SKILL_LEVEL' && trig.levels?.length && !trig.items?.length) {
    const have = trig.levels.map((l) => ({ ...l, lv: levelFrom(state, l.skill) }));
    if (have.every((h) => h.lv && h.lv.level >= h.level)) {
      goalMet = have.map((h) => ({ skill: skillName(h.skill), level: h.level, have: h.lv!.level, source: h.lv!.source }));
    }
  }
  return { stepId: step.id, status: statusOf(reqs), requirements: sorted, problems, unknown, ...(goalMet ? { goalMet } : {}) };
}

export interface ChainLink {
  step: Step;
  /** What hinders this very link, besides the steps before it: levels, items, coins. */
  why: RequirementStatus[];
}

/** The step number from a link action "#/step/S2-03"; null means the link is not to a step. */
const stepOfHref = (a?: ReadinessAction): string | null => (a?.kind === 'link' ? /^#\/step\/(S\d-\d{2})$/.exec(a.href)?.[1] ?? null : null);

/**
 * "Fix everything": a chain of steps to readiness. We go along what hinders (steps and quests not done), no deeper than
 * maxDepth links, and collect in order of doing: the deepest link first, the step itself last. The loop is not endless:
 * every step is taken once. Empty means nothing precedes the step. `readiness` is the common calculation with memory (the engine),
 * so that the chain's links are not recounted.
 */
export function fixChainOf(
  step: Step,
  ctx: ReadinessContext,
  maxDepth = 3,
  readiness: (s: Step) => StepReadiness = (s) => readinessOf(s, ctx),
): ChainLink[] {
  const seen = new Set<string>([step.id]);
  const out: ChainLink[] = [];
  const visit = (cur: Step, depth: number) => {
    const r = readiness(cur);
    const before = r.problems.map((p) => stepOfHref(p.action)).filter((id): id is string => id !== null && id !== step.id);
    if (depth < maxDepth) {
      for (const id of before) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = ctx.steps.find((x) => x.id === id);
        if (s && !isClosed(ctx.progress, id)) visit(s, depth + 1);
      }
    }
    if (cur.id !== step.id) {
      out.push({ step: cur, why: r.problems.filter((p) => p.kind !== 'step' && p.kind !== 'quest' && p.kind !== 'qp' && p.kind !== 'mode') });
    }
  };
  visit(step, 0);
  return out;
}

export function fixChain(input: ReadinessInput, maxDepth = 3): ChainLink[] {
  return fixChainOf(input.step, contextOf(input), maxDepth);
}

function bankNav(bank: Place, step: Step, itemName: string): ReadinessAction {
  // The target clears itself when the item is in the bag: the arrow returns to the step.
  return { kind: 'nav', label: `🧭 To the bank: ${bank.label}`, target: { label: `${bank.label}: take ${itemName}`, x: bank.x, y: bank.y, plane: bank.plane, itemName, stepId: step.id } };
}

/** The main reason by seniority: closed, quest, levels, items, coins, small things, unknown. */
function statusOf(reqs: RequirementStatus[]): ReadinessStatus {
  const missing = (r: RequirementStatus) => r.state === 'MISSING' || r.state === 'PARTIAL';
  const hardMissing = reqs.filter((r) => r.hard && missing(r));
  if (hardMissing.some((r) => r.kind === 'mode' || r.kind === 'step')) return 'BLOCKED';
  if (hardMissing.some((r) => r.kind === 'quest' || r.kind === 'qp')) return 'MISSING_QUEST';
  if (hardMissing.some((r) => r.kind === 'skill')) return 'MISSING_STATS';
  if (hardMissing.some((r) => r.kind === 'item')) return 'MISSING_ITEM';
  if (hardMissing.some((r) => r.kind === 'coins')) return 'MISSING_MONEY';
  if (reqs.some((r) => r.state === 'BANK' || (!r.hard && missing(r)))) return 'MINOR_PREP';
  if (reqs.some((r) => r.state === 'UNKNOWN')) return 'UNKNOWN';
  return 'READY';
}

export const STATUS_TEXT: Record<ReadinessStatus, { icon: string; text: string }> = {
  READY: { icon: '🟢', text: 'Ready for the step' },
  MINOR_PREP: { icon: '🟡', text: 'Almost ready: a small thing before leaving' },
  MISSING_ITEM: { icon: '🟠', text: 'Items are missing' },
  MISSING_MONEY: { icon: '🟠', text: 'Coins are missing' },
  MISSING_STATS: { icon: '🟠', text: 'A short preparation is needed: levels' },
  MISSING_QUEST: { icon: '🔴', text: 'The quest first' },
  BLOCKED: { icon: '🔴', text: 'The step is closed for now' },
  UNKNOWN: { icon: '⚪', text: 'No problems seen, but not everything was checked' },
};
