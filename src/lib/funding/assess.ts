// The funding assessment of one step: is there a real shortage of coins, and if so, what is the best way out. One answer for the whole app and the game.
//
// The order of the ways out is the order of what they cost the player:
//   1. nothing is short                                         -> no advice at all (the interface shows nothing);
//   2. a cheaper valid supply covers it (another accepted food)  -> no time lost, nothing sold;
//   3. spare items in the bag cover it                          -> sell what the cleanup rules mark as surplus;
//   4. gather the missing material yourself                      -> saves coins, earns none;
//   5. earn the rest                                             -> the best-ranked method from the catalogue for the amount still short.
// The target is the near-term one: the minimum the next trip cannot start without. The wider figures (recommended, whole objective, optional) are in the
// need, for the details; they are not what the player is asked to raise first.
//
// Unknown stays unknown: coins that cannot be read, a bank that was not opened and prices that are missing end in a state that says so, not in a guess.

import type { Step } from '../../types';
import { buildBudget, gapFor, type Budget, type SurplusRec } from './budget';
import { cheaperSupply, type CheaperOption } from './cheaper';
import { evaluate, type EvalContext, type MethodEvaluation, type Range3 } from './evaluate';
import { METHODS } from './methods';
import type { FundingNeed } from './need';
import type { Confidence, PriceView } from './quotes';
import { rankMethods, type Ranking } from './rank';
import type { FundingSnapshot } from './snapshot';
import type { FundingMethod } from './types';

export type OptionKind = 'CHEAPER_SUPPLY' | 'SELL_SURPLUS' | 'SELF_GATHER' | 'EARN';

export interface FundingOption {
  kind: OptionKind;
  /** Stable per choice, so a running plan can be recognised and kept: "earn:hill-giants". */
  id: string;
  title: string;
  detail: string;
  /** Coins of the shortage this closes (for gathering: the coins it saves). */
  closes: number;
  confidence: Confidence;
  minutes: Range3 | null;
  evaluation?: MethodEvaluation;
  cheaper?: CheaperOption;
}

export type FundingState = 'COVERED' | 'SHORT' | 'UNKNOWN';

export interface FundingAssessment {
  stepId: string;
  state: FundingState;
  /** The coins the next trip needs in all (supplies and fees). */
  required: number;
  gap: number | null;
  need: FundingNeed;
  budget: Budget;
  recommendation: FundingOption | null;
  /** At most two more, best first. */
  alternatives: FundingOption[];
  /** Methods that need full attention, offered only when asked for. */
  needsAttention: MethodEvaluation[];
  /** Why other methods were not offered, for the details drawer. */
  notOffered: { method: string; why: string }[];
  headline: string;
}

export interface AssessInput {
  step: Step;
  need: FundingNeed;
  snap: FundingSnapshot;
  prices: PriceView;
  /** Spare items in the bag as the cleanup advice sees them. */
  recs: readonly SurplusRec[];
  bankValue: number | null;
  /** Everything the evaluator needs except the money and the target. */
  base: Omit<EvalContext, 'cash' | 'mode' | 'target' | 'needItems'>;
  methods?: readonly FundingMethod[];
  activeId?: string | null;
  allowHighEffort?: boolean;
}

const gp = (n: number) => Math.round(n).toLocaleString('en-US');

/** "25-50 min": the fast and the slow case, to the nearest five minutes once past ten. */
export function minutesText(r: Range3): string {
  const round = (m: number) => (m < 10 ? Math.max(1, Math.round(m)) : Math.round(m / 5) * 5);
  const lo = round(r.fast);
  const hi = round(r.slow);
  return lo === hi ? `about ${lo} min` : `${lo}-${hi} min`;
}

function earnOption(e: MethodEvaluation, gap: number): FundingOption {
  const m = e.method;
  const conf = e.confidence === 'HIGH' ? '' : e.confidence === 'MEDIUM' ? ', fairly sure' : ', not sure';
  return {
    kind: 'EARN', id: `earn:${m.id}`, title: m.title,
    detail: e.minutes ? `${minutesText(e.minutes)} for ${gp(gap)} gp${conf}` : `for ${gp(gap)} gp`,
    closes: gap, confidence: e.confidence, minutes: e.minutes, evaluation: e,
  };
}

export function assess(i: AssessInput): FundingAssessment {
  const { need, snap, prices } = i;
  const budget = buildBudget({ snap, need, recs: i.recs, prices, bankValue: i.bankValue });
  const required = need.minimum.cost + need.fees.now;
  const gap = gapFor(required, budget.liquid);
  const base: FundingAssessment = {
    stepId: need.stepId, state: 'COVERED', required, gap, need, budget, recommendation: null, alternatives: [], needsAttention: [], notOffered: [], headline: '',
  };

  if (need.minimum.cost === 0 && need.fees.now === 0 && need.minimum.lines.length === 0) {
    // Nothing is known to be missing. If the reason is that nothing could be checked, say that: unknown is not covered.
    return need.unknown > 0
      ? { ...base, state: 'UNKNOWN', headline: snap.connected ? 'Open your bank to check your supplies.' : 'Connect RuneLite to check your supplies.' }
      : { ...base, headline: 'Nothing to pay for.' };
  }
  // A missing price makes the total a lower bound: a covered answer cannot be given on it.
  const unpriced = need.minimum.unpriced;
  if (unpriced > 0 && (gap === 0 || gap === null)) {
    return { ...base, state: 'UNKNOWN', headline: prices.status === 'live' ? 'Some prices are not known, so the cost cannot be added up.' : 'Exchange prices are not available right now.' };
  }
  if (gap === null) {
    const connected = snap.connected;
    return {
      ...base, state: 'UNKNOWN',
      headline: !connected ? 'Connect RuneLite to check your coins.' : budget.liquid.amount === null ? 'Your coins are not known yet.' : 'Open your bank to see all your coins.',
    };
  }
  if (gap === 0) return { ...base, headline: `You can pay for the next trip (${gp(required)} gp).` };

  const options: FundingOption[] = [];
  const notOffered: FundingAssessment['notOffered'] = [];

  // 2. A cheaper valid supply.
  const cheaper = cheaperSupply(i.step, need.minimum.lines, prices);
  if (cheaper) {
    options.push({
      kind: 'CHEAPER_SUPPLY', id: `cheaper:${cheaper.to}`, title: `Take ${cheaper.to} instead of ${cheaper.from}`,
      detail: `${cheaper.pieces} ${cheaper.to} give the same health for ${gp(cheaper.cost)} gp instead of ${gp(cheaper.was)}`,
      closes: Math.min(gap, cheaper.saves), confidence: 'HIGH', minutes: null, cheaper,
    });
  }

  // 3. Spare items.
  const surplus = budget.surplus;
  if (surplus.net > 0) {
    const top = surplus.lines.slice(0, 3).map((l) => `${l.name} x${l.qty}`).join(', ');
    options.push({
      kind: 'SELL_SURPLUS', id: 'sell-surplus', title: 'Sell your spare items',
      detail: `${top}: about ${gp(surplus.net)} gp after tax${surplus.lines.some((l) => l.status === 'unconfirmed') ? ' (if your account may sell them yet)' : ''}`,
      closes: Math.min(gap, surplus.net), confidence: surplus.lines.some((l) => l.status === 'unconfirmed') ? 'MEDIUM' : 'HIGH', minutes: null,
    });
  }

  // 4 and 5. Gather or earn, judged against what is still short after the spare items.
  const earnTarget = Math.max(1, gap - surplus.net);
  const methods = i.methods ?? METHODS;
  const spendable = budget.spendable;
  const earnEvals = methods.map((m) => evaluate(m, { ...i.base, cash: spendable, mode: 'earn', target: earnTarget }));
  const ranking: Ranking = rankMethods(earnEvals, { activeId: i.activeId ? i.activeId.replace(/^earn:/, '') : null, allowHighEffort: i.allowHighEffort });
  for (const e of earnEvals) {
    // Eligible methods that cannot reach the target are listed from the ranking below, once.
    if (e.eligible) continue;
    const why = e.blockers[0]?.text ?? e.minutesReason;
    if (why) notOffered.push({ method: e.method.title, why });
  }
  for (const c of ranking.cannotReach) notOffered.push({ method: c.evaluation.method.title, why: c.reason });

  // Gathering the missing materials yourself.
  const missing = new Map<string, number>();
  for (const l of [...need.minimum.lines, ...need.recommended.lines]) missing.set(l.name, Math.max(missing.get(l.name) ?? 0, l.qty));
  let gather: MethodEvaluation | null = null;
  if (missing.size > 0 && spendable !== null) {
    const supply = methods
      .filter((m) => m.outputs.some((o) => missing.has(o.item.name)))
      .map((m) => evaluate(m, { ...i.base, cash: spendable, mode: 'supply', target: 0, needItems: missing }))
      .filter((e) => e.eligible && e.minutes && e.saves !== null && e.saves > 0)
      .sort((a, b) => a.minutes!.slow - b.minutes!.slow || (a.method.id < b.method.id ? -1 : 1));
    gather = supply[0] ?? null;
  }
  if (gather && gather.minutes && gather.saves !== null) {
    const wanted = [...missing.entries()].filter(([n]) => gather!.method.outputs.some((o) => o.item.name === n)).map(([n, q]) => `${q} ${n}`).join(', ');
    options.push({
      kind: 'SELF_GATHER', id: `gather:${gather.method.id}`, title: `Gather ${wanted} yourself`,
      detail: `${minutesText(gather.minutes)}; saves about ${gp(gather.saves)} gp, earns none`,
      closes: Math.min(gap, gather.saves), confidence: gather.confidence, minutes: gather.minutes, evaluation: gather,
    });
  }
  if (ranking.best) options.push(earnOption(ranking.best, earnTarget));

  // The recommendation: the first way that closes the whole shortage without taking time, then the faster of gathering and earning.
  const closing = (o: FundingOption) => o.closes >= gap;
  let recommendation: FundingOption | null = options.find((o) => o.kind === 'CHEAPER_SUPPLY' && closing(o))
    ?? options.find((o) => o.kind === 'SELL_SURPLUS' && closing(o))
    ?? null;
  if (!recommendation) {
    const g = options.find((o) => o.kind === 'SELF_GATHER' && closing(o));
    const earn = options.find((o) => o.kind === 'EARN');
    if (g && earn) recommendation = (g.minutes!.slow <= earn.minutes!.slow ? g : earn);
    else recommendation = g ?? earn ?? null;
  }
  const alternatives = options
    .filter((o) => o !== recommendation && (o.kind !== 'EARN' || o.id !== recommendation?.id))
    .slice(0, 2);
  // A runner-up earning method stands in for a missing second option.
  if (alternatives.length < 2 && recommendation?.kind === 'EARN') {
    for (const e of ranking.list.slice(1)) {
      if (alternatives.length >= 2) break;
      alternatives.push(earnOption(e, earnTarget));
    }
  }

  const atLeast = unpriced > 0 ? 'at least ' : '';
  const headline = recommendation
    ? `You are ${atLeast}about ${gp(gap)} gp short for the next trip.`
    : `You are about ${gp(gap)} gp short and no safe way to raise it could be worked out from what is known.`;
  return { ...base, state: 'SHORT', gap, recommendation, alternatives, needsAttention: ranking.needsAttention, notOffered, headline };
}
