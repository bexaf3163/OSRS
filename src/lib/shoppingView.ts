// The Shopping screen: "what do I still have to obtain before I go on?" for a scope (the next trip, this step, or stages the player picked). It
// reads the same list (shopping.ts), the same player state (playerState.ts) and the same source router as the step's preparation; it adds no
// requirement of its own. Every row says what to do with it: buy at the exchange or in a shop, take it from the bank, put it on, get it on the
// way, or open the bank first. Unknown ownership is never "missing" and never "owned".

import type { Progress, Step, WikiItemDetail } from '../types';
import { aggregateShopping, formatGp, type ShoppingLine, type ShoppingList, type ShoppingSource } from './shopping';
import { heldOf, type PlayerState } from './playerState';
import { planSources } from './sourceRouter';
import { healsOf } from './combatEstimate';
import { nameKey, parseAmount } from './checklist';
import { isClosed } from './next-step';
import { tripWindow } from './oneTrip';
import { gearData } from '../services/gearAdvisor';

export type ScopeKind = 'trip' | 'step' | 'range';
/** What to do with a row: buy at the exchange, buy in a shop, take from the bank, put on, get on the way, check first, nothing. */
export type Channel = 'ge' | 'shop' | 'bank' | 'equip' | 'along' | 'unknown' | 'have';

export interface Ownership {
  /** Everything known (bag, worn, noted, bank, a manual mark, alternatives); null means not known. */
  total: number | null;
  /** With the player: bag, worn and noted, alternatives included; null means the bag was not read. */
  withYou: number | null;
  bank: number | null;
  worn: number;
  source: 'game' | 'manual' | 'bag' | 'none';
  /** Pieces of another item that does the same job, counted in (food by healing). */
  viaAlternatives: number;
}

export interface ShopRow {
  key: string;
  name: string;
  id?: number;
  iconUrl?: string;
  /** What the steps of the scope need in all (food for a training step: the whole goal). */
  required: number;
  exact: boolean;
  /** How many to act on: to buy, to take from the bank, to collect. For a row that cannot be checked, the most that may be missing. */
  qty: number;
  channel: Channel;
  /** Short and imperative: "Buy at the Grand Exchange", "Take 5 from the bank". */
  action: string;
  unitPrice: number | null;
  cost: number | null;
  optional: boolean;
  reusable: boolean;
  /** Sold at the exchange: only these go into the exchange list. */
  tradeable: boolean;
  own: Ownership;
  /** The steps it is for: "S3-08 ×110, S4-01". */
  why: string;
  sources: ShoppingSource[];
  howToGet: string;
}

// Worn items are not used up (the gear data has no ammunition slot).
const wearable = new Set(gearData.items.filter((p) => p.slot).map((p) => nameKey(p.name)));

/**
 * How much of a line the player has, by the shared player state, with the items that do the same job. `reserved` is what other lines of the same
 * list need of an alternative (the Lobsters a step asks for are not also the Salmon of another): only the rest of that stack counts here.
 */
export function ownershipOf(
  state: PlayerState, line: Pick<ShoppingLine, 'nameEn' | 'key' | 'anyOf' | 'heals'>, reserved?: ReadonlyMap<string, number>,
): Ownership {
  const base = heldOf(state, line.nameEn, line.key);
  // Worn is with you even when the game was not asked to count the item.
  let withYou = base.bag === null ? (base.equipped > 0 ? base.equipped : null) : base.bag + base.noted;
  let bank = base.bank;
  let worn = base.equipped;
  let alt = 0;
  for (const name of line.anyOf ?? []) {
    const h = heldOf(state, name);
    const altHeals = line.heals ? healsOf(name) : null;
    const conv = (n: number) => (line.heals && altHeals ? Math.floor((n * altHeals) / line.heals) : n);
    // The pieces another line needs come out of the bank first, then the bag.
    let keep = reserved?.get(nameKey(name)) ?? 0;
    const bankFree = h.bank === null ? null : Math.max(0, h.bank - keep);
    if (h.bank !== null) keep = Math.max(0, keep - h.bank);
    const bagFree = h.bag === null ? null : Math.max(0, h.bag + h.noted - keep);
    if (h.total !== null && (h.bank !== null || h.source === 'manual')) alt += conv((bagFree ?? 0) + (bankFree ?? 0));
    if (withYou !== null && bagFree !== null) withYou += conv(bagFree);
    if (bank !== null && bankFree !== null) bank += conv(bankFree);
    worn += h.equipped;
  }
  // Only a full count is a total: the bag without the bank is a lower bound, and an unknown amount stays unknown whatever the alternatives add.
  const complete = base.source === 'manual' || (base.source === 'game' && base.bank !== null);
  const total = complete && base.total !== null ? base.total + alt : null;
  const source = base.source === 'manual' ? 'manual' : complete ? 'game' : withYou !== null ? 'bag' : 'none';
  return { total, withYou, bank, worn, source, viaAlternatives: alt };
}

export interface RowContext {
  state: PlayerState;
  /** Sold at the exchange (the price service's item list); an unknown item is taken as sold. */
  onGe: (line: ShoppingLine) => boolean;
  /** An item card (shops, spawns, the exchange price). */
  detail: (id: number) => WikiItemDetail | undefined;
  /** The exchange's buy side for one piece; null means no price. */
  gePrice: (line: ShoppingLine) => number | null;
  /** Pieces the next trip needs, by line key: a long training step buys the whole goal but takes one bag at a time. */
  trip?: ReadonlyMap<string, number>;
}

const why = (sources: readonly ShoppingSource[]) => sources.map((s) => {
  const n = parseAmount(s.amount);
  return `${s.stepId}${n !== null && n > 1 && !s.carryOver ? ` ×${n}` : ''}${s.carryOver ? ' (the same one)' : ''}`;
}).join(', ');

const firstSentence = (t: string) => (t.split(/(?<=[.!?])\s/)[0] ?? t).replace(/\.$/, '');

function row(line: ShoppingLine, optional: boolean, ctx: RowContext, reserved: ReadonlyMap<string, number>): ShopRow {
  const own = ownershipOf(ctx.state, line, reserved);
  const required = line.count;
  const tradeable = ctx.onGe(line);
  const tripNeed = Math.min(required, ctx.trip?.get(line.key) ?? required);
  const base = {
    key: line.key, name: line.nameEn, ...(line.id !== undefined ? { id: line.id } : {}), ...(line.iconUrl ? { iconUrl: line.iconUrl } : {}),
    required, exact: line.exact, optional, reusable: line.reusable, tradeable, own, why: why(line.sources), sources: line.sources, howToGet: line.howToGet,
  };
  const done = (action: string): ShopRow => ({ ...base, qty: 0, channel: 'have', action, unitPrice: null, cost: null });
  const withYou = own.withYou ?? 0;
  const enough = (own.total !== null && own.total >= required) || withYou >= required;
  if (line.inStepOnly && !enough) {
    const first = line.sources.find((s) => !s.carryOver)?.stepId ?? line.sources[0]?.stepId;
    return { ...base, qty: Math.max(0, required - (own.total ?? withYou)), channel: 'along', action: `You get it during ${first}`, unitPrice: null, cost: null };
  }
  if (enough) {
    if (withYou < tripNeed && (own.bank ?? 0) > 0) {
      const qty = Math.min(tripNeed - withYou, own.bank ?? 0);
      return { ...base, qty, channel: 'bank', action: `Take ${qty} from the bank`, unitPrice: null, cost: null };
    }
    if (wearable.has(nameKey(line.nameEn)) && own.worn === 0 && withYou > 0 && /\b(wear|wield|equip)/i.test(line.howToGet)) {
      return { ...base, qty: 1, channel: 'equip', action: 'In your bag: put it on before the step', unitPrice: null, cost: null };
    }
    return done(own.worn > 0 ? 'Worn' : withYou >= tripNeed ? 'With you' : 'Owned');
  }
  if (own.total === null) {
    // Priced at the exchange only to say what it could cost at most; it is not counted as a purchase.
    const qty = Math.max(0, required - withYou);
    const unit = tradeable ? ctx.gePrice(line) : null;
    // The group says it is not confirmed; the row says what to do if it is missing.
    const fallback = tradeable ? 'the Grand Exchange' : line.howToGet ? firstSentence(line.howToGet) : 'on the way';
    return { ...base, qty, channel: 'unknown', action: `If you do not have it: ${fallback}`, unitPrice: unit, cost: unit === null ? null : unit * qty };
  }
  const missing = required - own.total;
  const banked = own.bank ?? 0;
  const also = banked > 0 ? ` · ${banked} more in the bank` : '';
  const detail = line.id !== undefined ? ctx.detail(line.id) : undefined;
  const plan = planSources({
    name: line.nameEn, need: missing, manualKey: line.key, ...(detail ? { detail } : {}),
    ...(tradeable && ctx.gePrice(line) !== null ? { gePrice: ctx.gePrice(line)! } : {}), kinds: ['shop', 'ge', 'free', 'drop'],
  }, ctx.state);
  const src = plan.primary;
  const geOption = [plan.primary, ...plan.alternatives].find((o) => o?.kind === 'ge');
  // A shop holds a few at a time: a bigger batch than its stock is bought at the exchange when the exchange sells it.
  const stock = src?.kind === 'shop' ? detail?.buyLocations?.find((b) => src.label.startsWith(b.shopName.replace(/\.$/, '')))?.stock : undefined;
  // With the player's position unknown, "the nearest shop" is any shop in the world (a members island behind a quest): an item the exchange sells is
  // then bought at the exchange; a shop wins only when it is known to be nearer.
  const near = src?.distance !== undefined && (geOption?.distance === undefined || src.distance <= geOption.distance);
  const fits = !tradeable || ((typeof stock !== 'number' || stock >= missing) && near);
  if (src?.kind === 'shop' && fits) {
    const unit = src.price ?? null;
    return { ...base, qty: missing, channel: 'shop', action: `Buy at ${src.label}${also}`, unitPrice: unit, cost: unit === null ? null : unit * missing };
  }
  if (tradeable && src?.kind !== 'free') {
    const unit = ctx.gePrice(line) ?? src?.price ?? null;
    return { ...base, qty: missing, channel: 'ge', action: `Buy at the Grand Exchange${also}`, unitPrice: unit, cost: unit === null ? null : unit * missing };
  }
  const how = src?.kind === 'free' || src?.kind === 'drop' ? src.label : line.howToGet ? firstSentence(line.howToGet) : 'Not sold at the exchange';
  return { ...base, qty: missing, channel: 'along', action: how, unitPrice: null, cost: null };
}

/** The rows of a list: the required ones, then the optional ones. */
export function shopRows(list: ShoppingList, ctx: RowContext): ShopRow[] {
  // What every required line needs of its own item: an alternative stack serves another line only beyond that.
  const reserved = new Map(list.required.map((l) => [nameKey(l.nameEn), l.count]));
  return [...list.required.map((l) => row(l, false, ctx, reserved)), ...list.recommended.map((l) => row(l, true, ctx, reserved))];
}

// ---------------------------------------------------------------------------
// The scope

export interface StageRange { from: number; to: number; openOnly: boolean }

/** The steps of a scope: the next trip (the current step and the next open ones, as the step's preparation), this step, or the stages picked. */
export function scopeSteps(scope: ScopeKind, steps: Step[], progress: Progress, currentId: string | null, range: StageRange): Step[] {
  if (scope === 'range') return steps.filter((s) => s.stage >= range.from && s.stage <= range.to && (!range.openOnly || !isClosed(progress, s.id)));
  if (!currentId) return [];
  if (scope === 'step') return steps.filter((s) => s.id === currentId);
  return tripWindow(steps, progress, currentId);
}

/** The list of a scope and what one trip takes of each line. */
export function scopeList(steps: Step[]): { list: ShoppingList; trip: Map<string, number> } {
  const list = aggregateShopping(steps, { wholeGoal: true });
  const one = aggregateShopping(steps);
  return { list, trip: new Map([...one.required, ...one.recommended].map((l) => [l.key, l.count])) };
}

// ---------------------------------------------------------------------------
// Budget: what the required purchases cost against what the player has, the optional ones apart

export interface Budget {
  /** Priced required purchases (exchange and shops). */
  required: number;
  /** Required purchases without a price. */
  unpriced: number;
  /** Rows whose ownership is not confirmed, and the most they could cost (priced ones). */
  unknownRows: number;
  unknownMax: number;
  /** Priced optional purchases. */
  optional: number;
  /** Coins the steps themselves ask for (fares, fees). */
  coinsForSteps: number;
  /** Bag and bank coins; the bag alone when it covers everything; null means not known. */
  funds: number | null;
  /** What is short; null means not known (the bank was not read). */
  shortfall: number | null;
}

export function budgetOf(rows: readonly ShopRow[], coinsForSteps: number, coins: { bag: number | null; bank: number | null }): Budget {
  const buy = (r: ShopRow) => r.channel === 'ge' || r.channel === 'shop';
  const req = rows.filter((r) => !r.optional && buy(r));
  const required = req.reduce((a, r) => a + (r.cost ?? 0), 0);
  const unpriced = req.filter((r) => r.cost === null).length;
  const unknown = rows.filter((r) => !r.optional && r.channel === 'unknown' && r.qty > 0);
  const optional = rows.filter((r) => r.optional && buy(r)).reduce((a, r) => a + (r.cost ?? 0), 0);
  const need = required + coinsForSteps;
  const funds = coins.bag !== null && coins.bank !== null ? coins.bag + coins.bank : coins.bag !== null && coins.bag >= need ? coins.bag : null;
  return {
    required, unpriced, unknownRows: unknown.length, unknownMax: unknown.reduce((a, r) => a + (r.cost ?? 0), 0), optional, coinsForSteps, funds,
    shortfall: funds === null ? null : Math.max(0, need - funds),
  };
}

// ---------------------------------------------------------------------------
// Empty and partial states: each said as what it is, never "Nothing to buy" for all of them

export type EmptyKind = 'error' | 'no-plan' | 'no-requirements' | 'all-owned' | 'offline' | 'not-loaded';

export function emptyStateOf(i: {
  error: boolean; scope: ScopeKind; current: string | null; rows: readonly ShopRow[]; connected: boolean; hasSnapshot: boolean; loaded: boolean;
}): EmptyKind | null {
  if (i.error) return 'error';
  if (i.scope !== 'range' && !i.current) return 'no-plan';
  const req = i.rows.filter((r) => !r.optional);
  if (!req.length) return 'no-requirements';
  if (req.every((r) => r.channel === 'have')) return 'all-owned';
  const checked = req.some((r) => r.channel !== 'unknown' && r.channel !== 'along');
  if (!checked && !i.connected && !i.hasSnapshot) return 'offline';
  if (!checked && i.connected && !i.loaded) return 'not-loaded';
  return null;
}

const ago = (ms: number) => {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/** What the app knows of the bag and the bank, in the words of what the connection can and cannot do. */
export function syncLine(i: { connected: boolean; loaded: boolean; bankSeen: boolean; bankSavedAt?: number; now?: number }): string {
  const now = i.now ?? Date.now();
  if (!i.connected) {
    return i.bankSavedAt !== undefined ? `Offline — using last-known quantities (bank last checked ${ago(now - i.bankSavedAt)}).` : 'Offline — ownership not confirmed. Connect RuneLite to check your bag and bank.';
  }
  if (!i.loaded) return 'Waiting for your character: log in to the game in RuneLite.';
  if (!i.bankSeen) return 'Bag checked. Open your bank in RuneLite to refresh.';
  if (i.bankSavedAt !== undefined) return `Bank last checked ${ago(now - i.bankSavedAt)}. Open your bank in RuneLite to refresh.`;
  return 'Bag and bank checked in this session.';
}

/** The exchange list for the clipboard: exchange purchases only, the ones not confirmed apart; no bank withdrawals, no shop or quest items. */
export function geListText(title: string, rows: readonly ShopRow[], coinsForSteps: number): string | null {
  const line = (r: ShopRow) => `${r.name} x${r.qty}${r.exact ? '' : '+'}`;
  const buy = rows.filter((r) => !r.optional && r.channel === 'ge' && r.qty > 0);
  const check = rows.filter((r) => !r.optional && r.channel === 'unknown' && r.tradeable && r.qty > 0);
  if (!buy.length && !check.length) return null;
  const out = [title, ...buy.map(line)];
  if (check.length) out.push('Not confirmed (check your bank first):', ...check.map(line));
  if (coinsForSteps > 0) out.push(`Coins ~${formatGp(coinsForSteps)} gp (for the steps themselves)`);
  return out.join('\n');
}
