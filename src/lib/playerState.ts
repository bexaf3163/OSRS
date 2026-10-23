// The single player state: levels, items, coins, quests, position, mode: one snapshot for the whole app.
// Readiness, shopping, preparation, the navigation target and the change summary read it, instead of each taking its own pieces of bridge/store.
//
// The main rule: "unknown" is not "none". Every value has three outcomes: known (from where), unknown.
// An item is PRESENT (have it), MISSING (surely not: both the bag and the bank are known), UNKNOWN (the bank was not opened and it is not in the bag).

import type { GameMode, PlayerStats, Progress } from '../types';
import type { GearState } from '../services/runeliteBridge';
import { nameKey, type OwnedState } from './checklist';
import { toolFamilyOf, toolUse, usableAt } from './toolTiers';

export type StateSource = 'game' | 'profile' | 'manual';

export type Known<T> = { known: true; value: T; source: StateSource } | { known: false };

export const unknown = { known: false } as const;
const known = <T>(value: T, source: StateSource): Known<T> => ({ known: true, value, source });

export interface WorldPoint { x: number; y: number; plane: number }

export interface PlayerState {
  mode: GameMode;
  /** There is a live connection to the game: without it everything from the game is "unknown", not "zero". */
  connected: boolean;
  player: string | null;
  levels: Record<string, Known<number>>;
  coins: { bag: Known<number>; bank: Known<number> };
  /** Occupied bag slots (of 28): unknown until the plugin sends them. */
  bagSlots: Known<number>;
  /** The weight of the bag and worn items, kg (from the game); unknown until the plugin sends it. */
  weight: Known<number>;
  /** What is in the bag (all items, not only tracked ones) for weight and extras; unknown until the plugin sends it. */
  bagItems: Known<{ name: string; count: number }[]>;
  /** The quest names counted in the game. */
  quests: Known<string[]>;
  position: Known<WorldPoint>;
  /** The bank was opened in this session: only then "not in the bag" means "not at all". */
  bankSeen: boolean;
  /** What is worn: slot to name. */
  equipment: Record<string, string>;
  /** The worn items were read from the game; false means unknown, not "nothing is worn". Absent in a hand-built state is read as unknown. */
  equipmentKnown?: boolean;
  /** The manual "I already have it" marks from shopping (the list row key to the quantity). */
  manual: Record<string, number>;
  owned: OwnedState | null;
  /** A short fingerprint for memoisation: it changes only when what affects the calculations changed. */
  fingerprint: string;
}

export interface PlayerStateInput {
  mode: GameMode;
  stats: PlayerStats | null;
  progress: Pick<Progress, 'levels'> & { ownedManual?: Record<string, { count: number }> };
  owned: OwnedState | null;
  gear: GearState | null;
  questsDone: string[] | null;
  position?: WorldPoint | null;
  connected?: boolean;
  player?: string | null;
}

/** Levels from the game win over manual ones; if there are neither, unknown. */
export function levelsOf(stats: PlayerStats | null, profile: Record<string, number>): Record<string, Known<number>> {
  const out: Record<string, Known<number>> = {};
  for (const [k, v] of Object.entries(profile)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = known(v, 'profile');
  if (stats) for (const [k, v] of Object.entries(stats)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = known(v, 'game');
  return out;
}

export function buildPlayerState(i: PlayerStateInput): PlayerState {
  const live = i.connected ?? (i.stats !== null || i.owned !== null || i.gear !== null || i.questsDone !== null || i.position != null);
  // Callers may retain last-known raw objects for history. They are never current game facts after logout/disconnect.
  const gear = live ? i.gear : null;
  const owned = live ? i.owned : null;
  const equipment: Record<string, string> = {};
  for (const g of gear?.equipment ?? []) if (g.slot) equipment[g.slot] = g.name;
  const manual: Record<string, number> = {};
  for (const [k, v] of Object.entries(i.progress.ownedManual ?? {})) if (typeof v?.count === 'number') manual[k] = v.count;
  const coins = {
    bag: gear && gear.coins !== null ? known(gear.coins, 'game') : unknown,
    bank: gear && gear.bankCoins !== null ? known(gear.bankCoins, 'game') : unknown,
  };
  const state: PlayerState = {
    mode: i.mode,
    connected: live,
    player: i.player ?? null,
    levels: levelsOf(live ? i.stats : null, i.progress.levels ?? {}),
    coins,
    bagSlots: gear && typeof gear.inventorySlots === 'number' ? known(gear.inventorySlots, 'game') : unknown,
    weight: gear && typeof gear.weight === 'number' ? known(gear.weight, 'game') : unknown,
    bagItems: gear?.inventory ? known(gear.inventory.map((g) => ({ name: g.name, count: g.count ?? 1 })), 'game') : unknown,
    quests: live && i.questsDone ? known(i.questsDone, 'game') : unknown,
    position: live && i.position ? known(i.position, 'game') : unknown,
    bankSeen: owned?.bankSeen === true,
    equipment,
    equipmentKnown: Array.isArray(gear?.equipment),
    manual,
    owned,
    fingerprint: '',
  };
  state.fingerprint = fingerprintOf(state);
  return state;
}

function fingerprintOf(s: PlayerState): string {
  const lv = Object.entries(s.levels).map(([k, v]) => `${k}${v.known ? v.value : '?'}`).sort().join(',');
  const items = s.owned ? [...s.owned.items.entries()].map(([k, o]) => `${k}:${o.carried}/${o.noted}/${o.bank ?? '?'}/${o.legacyToolCount ? 'legacy' : 'exact'}`).sort().join(';') : '-';
  const c = (k: Known<number>) => (k.known ? k.value : '?');
  const q = s.quests.known ? JSON.stringify([...new Set(s.quests.value.map(nameKey))].sort()) : '?';
  const eq = Object.entries(s.equipment).map(([k, v]) => `${k}=${v}`).sort().join(',');
  const man = Object.entries(s.manual).map(([k, v]) => `${k}=${v}`).sort().join(',');
  const pos = s.position.known ? `${s.position.value.x},${s.position.value.y},${s.position.value.plane}` : '?';
  return [s.mode, s.connected ? 1 : 0, s.bankSeen ? 1 : 0, JSON.stringify(s.player), s.equipmentKnown ? 1 : 0, pos, lv, c(s.coins.bag), c(s.coins.bank), c(s.bagSlots), c(s.weight), s.bagItems.known ? s.bagItems.value.map((b) => `${b.name}:${b.count}`).sort().join(',') : '?', q, eq, man, items].join('|');
}

/** The skill's level; undefined means unknown. */
export function levelOf(s: PlayerState, skill: string): number | undefined {
  const l = s.levels[skill];
  return l?.known ? l.value : undefined;
}

export type Presence = 'PRESENT' | 'MISSING' | 'UNKNOWN';

export interface Held {
  presence: Presence;
  /** In the bag and on the character (banknotes separately). */
  bag: number | null;
  noted: number;
  /** null means this item's bank quantity has not been established in this session. */
  bank: number | null;
  /** Of which worn (for display only: it is already included in bag). */
  equipped: number;
  /** The sum of everything known; null means not everything is known and there is nothing in the bag. */
  total: number | null;
  source: StateSource | 'none';
}

/**
 * How much of an item the player has. The game knows both the bag and the bank, which is the main thing. If the bank is unknown, the player's words ("I already have N")
 * are counted and the bag does not refute them; otherwise if it is in the bag it is known "have", and if not it is UNKNOWN, not MISSING.
 */
export function heldOf(
  s: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'> & { levels?: PlayerState['levels'] }, nameEn: string, manualKey?: string,
): Held {
  const base = heldExact(s, nameEn, manualKey);
  const family = toolFamilyOf(nameEn);
  if (!family) return base;
  // "Bronze pickaxe" in a route step means "a pickaxe": a better tier does the same job, so a better tier that is seen counts.
  // Unreported usable tiers keep the family total unknown, even when the named bronze tier is confirmed absent.
  // A tier the player's level cannot use does not do the job: a Rune pickaxe at Mining 10 is not "a pickaxe" for the step.
  const parts = family
    .filter((n) => usableAt(n, (skill) => levelValue(s, skill)))
    .map((n) => (nameKey(n) === nameKey(nameEn) ? base : heldExact(s, n)));
  if (!parts.length) return base;
  // Explicit manual ownership keeps its existing fallback when no other tier is positively observed.
  if (base.source === 'manual' && !parts.some((p) => p !== base && p.presence === 'PRESENT')) return base;
  const legacy = family.some((n) => s.owned?.items.get(nameKey(n))?.legacyToolCount);
  const sum = (pick: (h: Held) => number | null): number | null => {
    const known = parts.map(pick).filter((v): v is number => v !== null);
    return known.length ? legacy ? Math.max(...known) : known.reduce((a, b) => a + b, 0) : null;
  };
  const presence: Presence = parts.some((p) => p.presence === 'PRESENT') ? 'PRESENT' : parts.every((p) => p.presence === 'MISSING') ? 'MISSING' : 'UNKNOWN';
  const bankKnown = parts.every((p) => p.bank !== null);
  const total = sum((p) => p.total);
  const source = parts.find((p) => p.source === 'game')?.source ?? parts.find((p) => p.source === 'manual')?.source ?? parts[0].source;
  return {
    presence, bag: sum((p) => p.bag), noted: sum((p) => p.noted) ?? 0, bank: bankKnown ? sum((p) => p.bank) : null,
    equipped: parts.reduce((a, p) => a + p.equipped, 0), total: presence === 'UNKNOWN' ? null : total, source,
  };
}

function levelValue(s: { levels?: PlayerState['levels'] }, skill: string): number | null {
  const l = s.levels?.[skill];
  return l && l.known ? l.value : null;
}

/** Tiers of the tool the player holds but cannot use yet: "Rune pickaxe (needs Mining 41)". Empty when none or the level is unknown. */
export function unusableTools(s: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen' | 'levels'>, nameEn: string): string[] {
  const family = toolFamilyOf(nameEn);
  if (!family) return [];
  const out: string[] = [];
  for (const n of family) {
    const u = toolUse(n);
    const lv = u ? levelValue(s, u.skill) : null;
    if (!u || lv === null || lv >= u.level) continue;
    if (heldExact(s, n).presence === 'PRESENT') out.push(`${n} (needs ${u.skill === 'mining' ? 'Mining' : 'Woodcutting'} ${u.level})`);
  }
  return out;
}

/** Physical named stock, without generic tool substitution. Allocation must not spend one Rune pickaxe through several tier names. */
export function heldExact(s: Pick<PlayerState, 'owned' | 'equipment' | 'manual' | 'bankSeen'>, nameEn: string, manualKey?: string): Held {
  const o = s.owned?.items.get(nameKey(nameEn));
  const equipped = Object.values(s.equipment).filter((n) => nameKey(n) === nameKey(nameEn)).length;
  const manual = manualKey ? s.manual[manualKey] : undefined;
  // A global bank observation does not prove every tracked row's quantity. A new/unreported row remains unknown.
  if (o && s.bankSeen && o.bank !== undefined) {
    const bag = o.carried;
    const bank = o.bank;
    const total = bag + o.noted + bank;
    return { presence: total > 0 ? 'PRESENT' : 'MISSING', bag, noted: o.noted, bank, equipped, total, source: 'game' };
  }
  // The player's mark: the bag from the game does not refute it (the rest may be in the bank), but does not reduce it either.
  // "I have 0" is also the player's word: none, not "unknown".
  if (manual !== undefined) {
    const total = Math.max(manual, (o?.carried ?? 0) + (o?.noted ?? 0));
    return { presence: total > 0 ? 'PRESENT' : 'MISSING', bag: o ? o.carried : null, noted: o?.noted ?? 0, bank: null, equipped, total, source: 'manual' };
  }
  // The bank is unknown: what is in the bag is known, and not in the bag is "not checked", not "none".
  if (o && o.carried + o.noted > 0) return { presence: 'PRESENT', bag: o.carried, noted: o.noted, bank: null, equipped, total: o.carried + o.noted, source: 'game' };
  // The plugin sends only the items it tracks (the step, shopping): no record is not "no item" but "not tracked".
  return { presence: 'UNKNOWN', bag: o ? o.carried : null, noted: o?.noted ?? 0, bank: null, equipped, total: null, source: 'none' };
}

export type QuestPresence = 'DONE' | 'NOT_DONE' | 'UNKNOWN';

/** A quest is counted in the game; the list is unknown means UNKNOWN. */
export function questOf(s: PlayerState, quest: string): QuestPresence {
  if (!s.quests.known) return 'UNKNOWN';
  return s.quests.value.some((q) => nameKey(q) === nameKey(quest)) ? 'DONE' : 'NOT_DONE';
}

export function coinsOf(s: PlayerState): { bag: number | null; bank: number | null; total: number | null } {
  const bag = s.coins.bag.known ? s.coins.bag.value : null;
  const bank = s.coins.bank.known ? s.coins.bank.value : null;
  return { bag, bank, total: bag === null || bank === null ? null : bag + bank };
}

// ---------------------------------------------------------------------------
// What changed between two snapshots: for recounting the preparation and the "27 to 30 Defence" summary.

export type StateChange =
  | { kind: 'LEVEL'; skill: string; from: number; to: number }
  | { kind: 'ITEM'; name: string; from: number; to: number }
  | { kind: 'COINS'; where: 'bag' | 'bank'; from: number; to: number }
  | { kind: 'QUEST'; name: string }
  | { kind: 'MODE'; from: GameMode; to: GameMode }
  | { kind: 'CONNECTION'; connected: boolean };

const ITEM_CHANGE_LIMIT = 40;

export function diffPlayerState(prev: PlayerState | null, next: PlayerState): StateChange[] {
  if (!prev || prev.fingerprint === next.fingerprint) return [];
  const out: StateChange[] = [];
  if (prev.mode !== next.mode) out.push({ kind: 'MODE', from: prev.mode, to: next.mode });
  if (prev.connected !== next.connected) out.push({ kind: 'CONNECTION', connected: next.connected });
  // Only when known both before and now: "unknown to known" is not a gain but the appearance of data.
  for (const [skill, now] of Object.entries(next.levels)) {
    const before = prev.levels[skill];
    if (before?.known && now.known && before.value !== now.value) out.push({ kind: 'LEVEL', skill, from: before.value, to: now.value });
  }
  for (const where of ['bag', 'bank'] as const) {
    const a = prev.coins[where];
    const b = next.coins[where];
    if (a.known && b.known && a.value !== b.value) out.push({ kind: 'COINS', where, from: a.value, to: b.value });
  }
  if (prev.quests.known && next.quests.known) {
    const had = new Set(prev.quests.value.map(nameKey));
    for (const q of next.quests.value) if (!had.has(nameKey(q))) out.push({ kind: 'QUEST', name: q });
  }
  if (prev.owned && next.owned) {
    const total = (o: { carried: number; noted: number; bank?: number }, seen: boolean) => o.carried + o.noted + (seen ? o.bank ?? 0 : 0);
    // The bank was opened or closed: the totals are not comparable, count only the bag.
    const withBank = prev.bankSeen && next.bankSeen;
    const names = new Set([...prev.owned.items.keys(), ...next.owned.items.keys()]);
    let n = 0;
    for (const k of names) {
      const a = prev.owned.items.get(k);
      const b = next.owned.items.get(k);
      const from = a ? (withBank ? total(a, true) : a.carried + a.noted) : 0;
      const to = b ? (withBank ? total(b, true) : b.carried + b.noted) : 0;
      if (from !== to && n++ < ITEM_CHANGE_LIMIT) out.push({ kind: 'ITEM', name: b?.name ?? a?.name ?? k, from, to });
    }
  }
  return out;
}
