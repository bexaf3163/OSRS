// The planner's input from the app's state, in one place: the "How to get there" card and the one-line tip on the step read it, so they never disagree.

import type { GameMode, PlayerStats } from '../types';
import type { GearState } from '../services/runeliteBridge';
import { nameKey, type OwnedItem, type OwnedState } from './checklist';
import { NET, STAFF_NAMES, TRANSPORT, type ItemSource, type Point, type TravelInput } from './travel';

/** What the bank holds, by name key: the planner looks for tablets there before it suggests buying them. */
export function bankCounts(items: Iterable<Pick<OwnedItem, 'name' | 'bank'>>): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) if ((i.bank ?? 0) > 0) out.set(nameKey(i.name), i.bank!);
  return out;
}

/**
 * The bank as the game reported it, by name key, with the zeros: a thing the game counted and found none of is "none", a thing it was not asked about
 * is absent (unknown). The planner needs the difference: "withdraw it" is said only for what the bank is known to hold.
 */
export function bankReport(items: Iterable<Pick<OwnedItem, 'name' | 'bank'>>, bankCoins?: number | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) if (typeof i.bank === 'number') out.set(nameKey(i.name), i.bank);
  if (typeof bankCoins === 'number') out.set(nameKey('Coins'), bankCoins);
  return out;
}

/**
 * The names of the things the ways need, for the game to count in the bag and the bank: the runes of the spells, the teleport items and what charges
 * them (Teleport cards), the canoe axes; for a members account the tablets.
 */
export function transportWatch(mode: GameMode): string[] {
  const out = new Set<string>();
  for (const t of TRANSPORT.teleports) {
    for (const rune of Object.keys(t.runes ?? {})) out.add(`${rune[0].toUpperCase()}${rune.slice(1)} rune`);
    for (const item of t.items ?? []) out.add(item);
    if (t.charges) out.add(t.charges.item);
  }
  for (const axe of TRANSPORT.canoe.axes) out.add(axe);
  // The Cowbell amulet (free-to-play): the bag and the bank are counted like the other teleport items; empty or charged comes from the item id.
  if (TRANSPORT.cowbell) out.add(TRANSPORT.cowbell.item);
  // Tablets are members' items: a free-to-play account is not asked about them.
  if (mode === 'members') for (const tb of NET.tablets) out.add(tb.item);
  return [...out];
}

/** Coins matter to the ways as "enough for a fare, a tablet, the runes": the key changes only when one of these is crossed. */
const COIN_STEPS = [30, 300, 1000, 3000];

/**
 * The part of the bag and the bank the ways depend on, as a short key: when it changes (runes bought, an axe withdrawn, a staff put on) the
 * transport is judged again at once. Everything else in the bag does not touch it, so skilling does not make the app ask the game on every item.
 */
export function transportKey(gear: GearState | null, owned: OwnedState | null | undefined): string {
  const names = [...transportWatch('members'), ...STAFF_NAMES];
  const carried = gear && (gear.equipment || gear.inventory) ? [...(gear.equipment ?? []), ...(gear.inventory ?? [])] : null;
  const have = carried === null ? '?' : names.map((n) => carried.filter((g) => g.name === n).reduce((s, g) => s + (g.count ?? 1), 0)).join(',');
  const bank = owned?.bankSeen ? names.map((n) => owned.items.get(nameKey(n))?.bank ?? '?').join(',') : '?';
  const coins = typeof gear?.coins === 'number' ? COIN_STEPS.filter((c) => gear.coins! >= c).length : '?';
  const banked = typeof gear?.bankCoins === 'number' ? COIN_STEPS.filter((c) => gear.bankCoins! >= c).length : '?';
  return `${have}|${bank}|${coins}|${banked}`;
}

export interface TravelInputSources {
  from: Point;
  to: Point;
  /** The levels typed by hand; the ones from the game go over them. */
  levels: Readonly<Record<string, number | undefined>>;
  stats: PlayerStats | null;
  gear: GearState | null;
  owned: OwnedState | null | undefined;
  priceOf?: (name: string) => number | undefined;
  mode: GameMode;
  homeCooldownSec?: number | null;
  /** The fairy ring network is unlocked (see fairyRingsUnlocked); absent means unknown. */
  fairyRings?: boolean | null;
  /** false: the game did not say whether the Home Teleport is ready. */
  homeCooldownKnown?: boolean;
  /** The spellbook from the game: 0 is the standard one; null or absent means the game did not say. */
  spellbook?: number | null;
  /** The Chronicle's charges from the game; null or absent: unknown. */
  chronicleCharges?: number | null;
  /** Where a missing thing can be got (the app's source router). */
  sourceOf?: (name: string, need: number) => ItemSource | null;
  /** The one-time ways the route says were used (see oneTimeUsedOf). */
  oneTimeUsed?: readonly string[];
  /** The quests the game reports completed; null or absent: unknown. */
  questsDone?: readonly string[] | null;
}

/** The one-time ways (Count Check) whose route step is closed: they were used, or knowingly skipped, and are not offered again. */
export const oneTimeUsedOf = (progress: { steps: Record<string, string | undefined> }): string[] =>
  (TRANSPORT.oneTime ?? []).filter((w) => progress.steps[w.usedAfter] === 'done' || progress.steps[w.usedAfter] === 'skipped').map((w) => w.id);

/** The route unlocks the fairy rings at S9-03 (Fairytale II): before that step is closed the rings are not offered. */
export const FAIRY_RING_STEP = 'S9-03';
export const fairyRingsUnlocked = (progress: { steps: Record<string, string | undefined> }): boolean =>
  progress.steps[FAIRY_RING_STEP] === 'done' || progress.steps[FAIRY_RING_STEP] === 'skipped';

export function travelInputOf(s: TravelInputSources): TravelInput {
  const carried = s.gear && (s.gear.equipment || s.gear.inventory) ? [...(s.gear.equipment ?? []), ...(s.gear.inventory ?? [])] : null;
  return {
    from: s.from, to: s.to, levels: { ...s.levels, ...(s.stats ?? {}) }, carried, bankSeen: Boolean(s.owned?.bankSeen),
    // What is worn, apart from the bag: a staff gives its runes only wielded. A plugin that sends no equipment list leaves it unknown.
    ...(s.gear ? { worn: s.gear.equipment ?? null } : {}),
    ...(s.chronicleCharges !== undefined ? { chronicleCharges: s.chronicleCharges } : {}),
    bank: s.owned?.bankSeen ? bankReport(s.owned.items.values(), s.gear?.bankCoins) : null,
    priceOf: s.priceOf, members: s.mode === 'members', homeCooldownSec: s.homeCooldownSec ?? null,
    ...(s.fairyRings === undefined ? {} : { fairyRings: s.fairyRings }),
    ...(s.homeCooldownKnown === undefined ? {} : { homeCooldownKnown: s.homeCooldownKnown }),
    // Free-to-play has only the standard spellbook; a members account is asked, and an unanswered question stays a thing to check.
    ...(typeof s.spellbook === 'number' ? { standardSpellbook: s.spellbook === 0 } : s.mode === 'members' && s.spellbook === null ? { standardSpellbook: null } : {}),
    ...(s.sourceOf ? { sourceOf: s.sourceOf } : {}),
    ...(s.oneTimeUsed ? { oneTimeUsed: s.oneTimeUsed } : {}),
    ...(s.questsDone !== undefined ? { questsDone: s.questsDone } : {}),
  };
}
