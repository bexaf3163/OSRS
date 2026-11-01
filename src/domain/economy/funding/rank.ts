// Choosing among evaluated methods. Two stages, as the evaluator already did the first:
//   eligibility - done: only methods the account can do now, whose first batch it can afford, whose product it may sell, are candidates;
//   comparison  - here: the conservative time to the target (the slow case), with a penalty for low confidence so that a shaky number cannot win on luck,
//                 then the money at risk, then the synergy with what the player is already doing, then how much attention it needs.
// A method that needs the player's full attention (high intensity) is held back unless the player asked for it.
// The choice is steady: the plan already running stays unless another is clearly better or the running one has become unsuitable.

import type { MethodEvaluation } from './evaluate';
import { CONFIDENCE_RANK, type Confidence } from './quotes';

/** The slow time is multiplied by this for the confidence the number deserves. */
export const CONFIDENCE_PENALTY: Record<Confidence, number> = { HIGH: 1, MEDIUM: 1.15, LOW: 1.5 };
/** The running plan is kept while its score is within this factor of the best. */
export const KEEP_MARGIN = 1.25;

export interface RankPrefs {
  /** The method of the plan that is running. */
  activeId?: string | null;
  /** Allow methods that need full attention (tick-perfect or very repetitive). */
  allowHighEffort?: boolean;
}

export interface Ranking {
  best: MethodEvaluation | null;
  /** Everything that can be recommended, best first. */
  list: MethodEvaluation[];
  /** Eligible methods held back because they need full attention. */
  needsAttention: MethodEvaluation[];
  /** Eligible methods that cannot reach the target at all, with the reason. */
  cannotReach: { evaluation: MethodEvaluation; reason: string }[];
  /** The running plan was kept although another scored a little better. */
  kept: boolean;
}

export const score = (e: MethodEvaluation): number => (e.minutes ? e.minutes.slow * CONFIDENCE_PENALTY[e.confidence] : Infinity);

const INTENSITY: Record<MethodEvaluation['method']['intensity'], number> = { low: 0, moderate: 1, high: 2 };

export function rankMethods(evals: readonly MethodEvaluation[], prefs: RankPrefs = {}): Ranking {
  const eligible = evals.filter((e) => e.eligible);
  const cannotReach = eligible.filter((e) => !e.minutes).map((e) => ({ evaluation: e, reason: e.minutesReason ?? 'It does not reach the target' }));
  const withTime = eligible.filter((e) => e.minutes);
  const needsAttention = withTime.filter((e) => e.method.intensity === 'high' && !prefs.allowHighEffort && e.method.id !== prefs.activeId);
  const list = withTime
    .filter((e) => !needsAttention.includes(e))
    .sort((a, b) =>
      score(a) - score(b)
      || a.upfront.firstTrip - b.upfront.firstTrip
      || Number(Boolean(b.synergy)) - Number(Boolean(a.synergy))
      || CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
      || INTENSITY[a.method.intensity] - INTENSITY[b.method.intensity]
      || (a.method.id < b.method.id ? -1 : 1));
  let best = list[0] ?? null;
  let kept = false;
  const active = prefs.activeId ? list.find((e) => e.method.id === prefs.activeId) : undefined;
  if (best && active && active !== best && score(active) <= score(best) * KEEP_MARGIN) {
    best = active;
    kept = true;
  }
  return { best, list: best ? [best, ...list.filter((e) => e !== best)] : list, needsAttention, cannotReach, kept };
}
