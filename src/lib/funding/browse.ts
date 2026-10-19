// The Money section (2.71): browsing the funding catalogue at any time, not only when a step is short of coins. It is a view over the same evaluator and
// ranking the coin plan uses (evaluate.ts, rank.ts): no second engine. What is added here is only what a list needs: categories, a search, filters,
// a sort, and one honest badge per method.
//
// The rules of the list:
//  - "Can do now" only for a method the evaluator found eligible with every requirement known. A level, quest or tool that could not be checked makes
//    it "Not confirmed", never available.
//  - A method with no estimate shows "Estimate unavailable": never a zero cost or a high profit by omission.
//  - By default the list holds what the player can do; locked ones (membership, levels, quests, capital) are behind a filter, with what is missing.

import type { FundingAssessment } from './assess';
import { evaluate, type EvalContext, type MethodEvaluation, type Range3 } from './evaluate';
import { METHODS } from './methods';
import { rankMethods, type Ranking } from './rank';
import type { Family, FundingMethod } from './types';

export type Category = 'combat' | 'gathering' | 'processing' | 'other';
export type BrowseSort = 'recommended' | 'profit' | 'capital' | 'intensity';

export interface BrowseFilters {
  query: string;
  /** Only what the player can do now (the default); off shows locked ones too, with what is missing. */
  availableOnly: boolean;
  /** Only methods that need no coins to start. */
  noCapital: boolean;
  category: Category | 'all';
  /** Only relaxed methods (low intensity). */
  relaxedOnly: boolean;
}

export const DEFAULT_FILTERS: BrowseFilters = { query: '', availableOnly: true, noCapital: false, category: 'all', relaxedOnly: false };

const CATEGORY: Record<Family, Category> = {
  combat: 'combat', gathering: 'gathering', collecting: 'gathering', processing: 'processing', production: 'processing',
  shop: 'other', 'direct-coin': 'other', 'surplus-sale': 'other', 'self-supply': 'other', 'one-time': 'other',
};
export const categoryOf = (m: Pick<FundingMethod, 'family'>): Category => CATEGORY[m.family];
export const CATEGORY_LABEL: Record<Category, string> = { combat: 'Combat', gathering: 'Gathering', processing: 'Processing', other: 'Other' };

export type Badge = { text: string; tone: 'ok' | 'unknown' | 'locked' };

/**
 * The requirements the evaluator could not check (its caution texts) and the few words a badge says for each: any of them keeps a method from being
 * called available. Where the player stands, the market and world facts are not requirements: they change the estimate, not what the account can do.
 */
const UNKNOWN: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Your (\w+) level is not known$/, (m) => `${m[1]} level unknown`],
  [/^(.+) could not be checked$/, (m) => `${m[1]} unknown`],
  [/^Quest points are not known$/, () => 'quest points unknown'],
  [/^Whether you own a suitable tool is not known/, () => 'tool unknown, open the bank'],
  [/^Your coins are not known$/, () => 'coins unknown'],
  [/^Not personalised/, () => 'combat stats unknown'],
];

/** The one badge of a row: can do now, not confirmed (and what could not be checked), or locked (and what is missing). The details say it in full. */
export function badgeOf(e: MethodEvaluation): Badge {
  if (!e.eligible) return { text: e.blockers[0]?.text ?? 'Not available', tone: 'locked' };
  for (const c of e.cautions) {
    for (const [re, say] of UNKNOWN) {
      const m = re.exec(c);
      if (m) return { text: `Not confirmed: ${say(m)}`, tone: 'unknown' };
    }
  }
  if (!e.minutes) return { text: e.minutesReason ?? 'It does not reach the goal', tone: 'unknown' };
  return { text: 'Can do now', tone: 'ok' };
}

const k = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));

/** "60k-85k gp/h net" from the slow and the fast case, or "Estimate unavailable" when the evaluator has none. */
export function netText(e: Pick<MethodEvaluation, 'netPerHour' | 'eligible' | 'blockers'>): string {
  const r: Range3 | null = e.netPerHour ?? null;
  const priceless = e.blockers.some((b) => b.kind === 'price');
  if (!r || priceless || !Number.isFinite(r.slow) || !Number.isFinite(r.fast) || (r.slow === 0 && r.fast === 0)) return 'Estimate unavailable';
  const lo = Math.min(r.slow, r.fast);
  const hi = Math.max(r.slow, r.fast);
  return lo === hi ? `${k(lo)} gp/h net` : `${k(lo)}–${k(hi)} gp/h net`;
}

/** Coins to start: the tool and the smallest batch's supplies, or "No coins needed". */
export function capitalText(e: Pick<MethodEvaluation, 'upfront'>): string {
  // The least to start with (the tool and the smallest batch): the same figure as "Coins to start" in the details. A full first trip
  // was shown here before, so a row said 2,030 gp to start while its details said 435 (2.72.1).
  const c = Math.ceil(e.upfront.minimum);
  return c > 0 ? `${c.toLocaleString('en-US')} gp to start` : 'No coins needed';
}

export const INTENSITY_LABEL: Record<FundingMethod['intensity'], string> = { low: 'Relaxed', moderate: 'Steady', high: 'Full attention' };

export interface BrowseRow {
  evaluation: MethodEvaluation;
  category: Category;
  badge: Badge;
  net: string;
  capital: string;
  /** The guide would pick this one first. */
  recommended: boolean;
}

export interface BrowseResult {
  /** The personal pick: the ranking's best (what "Start" defaults to). null - nothing the player can do was found. */
  recommended: MethodEvaluation | null;
  rows: BrowseRow[];
  /** Methods the filters hide: how many and the reason the most common. */
  hidden: number;
}

const INTENSITY_RANK: Record<FundingMethod['intensity'], number> = { low: 0, moderate: 1, high: 2 };
const capitalOf = (e: MethodEvaluation) => e.upfront.minimum;
const profitOf = (e: MethodEvaluation) => (e.netPerHour ? e.netPerHour.slow : -Infinity);

/** The list for the Money section: the ranking's order by default, filtered and sorted as asked. */
export function browse(evals: readonly MethodEvaluation[], ranking: Ranking, f: BrowseFilters, sort: BrowseSort): BrowseResult {
  const order = new Map<string, number>();
  ranking.list.forEach((e, i) => order.set(e.method.id, i));
  ranking.needsAttention.forEach((e, i) => order.set(e.method.id, 1000 + i));
  ranking.cannotReach.forEach((c, i) => order.set(c.evaluation.method.id, 2000 + i));
  const q = f.query.trim().toLowerCase();
  const all = evals.map((e): BrowseRow => ({
    evaluation: e, category: categoryOf(e.method), badge: badgeOf(e), net: netText(e), capital: capitalText(e), recommended: ranking.best?.method.id === e.method.id,
  }));
  const shown = all.filter((r) => {
    const m = r.evaluation.method;
    if (q && !`${m.title} ${m.summary} ${m.spot.label}`.toLowerCase().includes(q)) return false;
    if (f.availableOnly && r.badge.tone === 'locked') return false;
    if (f.noCapital && capitalOf(r.evaluation) > 0) return false;
    if (f.category !== 'all' && r.category !== f.category) return false;
    if (f.relaxedOnly && m.intensity !== 'low') return false;
    return true;
  });
  const by: Record<BrowseSort, (a: BrowseRow, b: BrowseRow) => number> = {
    recommended: (a, b) => (order.get(a.evaluation.method.id) ?? 5000) - (order.get(b.evaluation.method.id) ?? 5000),
    profit: (a, b) => profitOf(b.evaluation) - profitOf(a.evaluation),
    capital: (a, b) => capitalOf(a.evaluation) - capitalOf(b.evaluation),
    intensity: (a, b) => INTENSITY_RANK[a.evaluation.method.intensity] - INTENSITY_RANK[b.evaluation.method.intensity],
  };
  const tie = (a: BrowseRow, b: BrowseRow) => (a.badge.tone === b.badge.tone ? 0 : a.badge.tone === 'ok' ? -1 : b.badge.tone === 'ok' ? 1 : a.badge.tone === 'unknown' ? -1 : 1);
  // Without a ranking (the coins are not known) the personal order has nothing to go on: the better-paying method comes first, then the name.
  const rows = [...shown].sort((a, b) => by[sort](a, b) || tie(a, b) || profitOf(b.evaluation) - profitOf(a.evaluation) || (a.evaluation.method.title < b.evaluation.method.title ? -1 : 1));
  return { recommended: ranking.best, rows, hidden: all.length - shown.length };
}

/** What the Money section ranks the methods for when no step is short: the time to make this many more coins. */
export const BROWSE_TARGET = 10_000;

export interface MoneyList {
  evals: MethodEvaluation[];
  ranking: Ranking;
  /** What the order is for: the coins the step is short of, or BROWSE_TARGET more (stepId null). */
  rankedFor: { coins: number; stepId: string | null };
  /** The step's shortfall, offered as a goal; null - it is not short or it cannot be told. */
  shortfall: { stepId: string; coins: number } | null;
}

/**
 * Every method of the catalogue judged for the Money section with the coin card's own inputs. When the step is short: the same target (what the spare
 * items leave of the shortfall) and the same coins to spend, so the two recommend the same method. Otherwise: BROWSE_TARGET more coins out of what the
 * player may spend. `a` is the step's assessment (null while a plan runs for it).
 */
export function moneyList(
  base: Omit<EvalContext, 'cash' | 'mode' | 'target' | 'needItems'>, a: FundingAssessment | null,
  opts: { methods?: readonly FundingMethod[]; activeId?: string | null } = {},
): MoneyList {
  const short = a && a.state === 'SHORT' && a.gap !== null && a.gap > 0 ? a : null;
  const target = short ? Math.max(1, short.gap! - short.budget.surplus.net) : BROWSE_TARGET;
  const cash = a ? a.budget.spendable : base.snap.liquid.amount;
  const evals = (opts.methods ?? METHODS).map((m) => evaluate(m, { ...base, cash, mode: 'earn', target }));
  return {
    evals, ranking: rankMethods(evals, { activeId: opts.activeId ?? null }),
    rankedFor: { coins: target, stepId: short ? short.stepId : null }, shortfall: short ? { stepId: short.stepId, coins: short.gap! } : null,
  };
}

/** What the player asks a started method for (2.71): more coins by an amount, the shortfall of a step, or an open session they stop themselves. */
export type MoneyGoal =
  | { kind: 'amount'; coins: number }
  | { kind: 'shortfall'; stepId: string; coins: number }
  | { kind: 'open' };

/** The words of a goal for the plan and the screens. "Additional" coins: what is in the bank already does not count, unsold loot is not coins. */
export function goalText(g: MoneyGoal): string {
  if (g.kind === 'amount') return `Earn ${g.coins.toLocaleString('en-US')} more coins`;
  if (g.kind === 'shortfall') return `Cover the ${g.coins.toLocaleString('en-US')} gp ${g.stepId} is short`;
  return 'An open session: stop when you like';
}
