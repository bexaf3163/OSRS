import type { QuestStageLine, StagePre } from '../../types';
import type { GearItem } from '../../services/runeliteBridge';
import { BANKS, EXCHANGE, bankTiles, type Point } from '../travel/travel';
import { nameKey } from '../items/itemKey';
import { usableAt, toolFamilyOf } from '../items/toolTiers';
import { effectiveHeal, foodCarry, heldFood, allocateFoodStock } from '../player/foodStock';
import { FOODS } from '../../data/threats';
import type { OwnedItem, OwnedState } from '../items/checklist';
import { allocateMaterialStock } from '../player/materialStock';
import { doseKind, doseName } from '../items/doseKind';
import { countWorn, type WornItem } from '../items/equipmentCount';
import type { PreflightItem } from '../prep/stepItems';

/**
 * The item pre-flight guard for a quest stage step: while an item the step uses is not in the bag (or worn), the arrow does not lead to the step.
 * It leads to a known bank holding, a source named in the data, or a bank check before buying when bank ownership is unread.
 * The exchange is a purchase fallback only after the current-session bank was checked.
 * The plugin runs the same rules in Java (Preflight.java); this module is the app's copy and what the tests pin.
 *
 * Unknown is not missing: with no bag read yet nothing is blocked, and the bank is used only when it has really been seen.
 */
export interface PreflightInput {
  carried: GearItem[] | null;
  /** The bank snapshot, or null when the bank has never been opened. */
  bank?: GearItem[] | null;
  /** False for a saved earlier-session snapshot; it cannot prove a purchase shortage. */
  bankCurrent?: boolean;
  from: Point;
  /** The player's real levels: a pickaxe or axe tier above them does not count (Preflight.java the same). Absent — unknown, every tier counts. */
  levels?: Partial<Record<string, number>> | null;
}

export interface PreflightBlock {
  item: string;
  need: number;
  have: number;
  via: 'bank' | 'check-bank' | 'source' | 'exchange';
  target: Point & { label: string };
  /** What to do now, for the HUD heading and the arrow label. */
  instruction: string;
  /** The red HUD chip. */
  chip: string;
  on?: string[];
  npc?: string;
}

/**
 * How many of the item the container holds: by exact id when the data gives one, else by name; the alternatives count by name (Preflight.count).
 * Food counts by healing, in pieces of the named food: 10 Cooked meat (3 each) are 4 Trout (7 each). A food the table does not know counts as one
 * piece of the named one, never more. A pickaxe or axe tier the player's level cannot use is not counted.
 */
export function countOf(items: GearItem[], p: Pick<StagePre, 'item' | 'id' | 'alt'>, levels?: Partial<Record<string, number>> | null): number {
  const key = nameKey(p.item);
  const level = (skill: string) => (typeof levels?.[skill] === 'number' ? (levels[skill] as number) : null);
  const alts = new Set((p.alt ?? []).filter((n) => usableAt(n, level)).map(nameKey));
  const hp = levels?.hitpoints;
  const rawUnit = healOf(p.item);
  const unit = rawUnit === null ? null : effectiveHeal({ heals: rawUnit }, hp);
  let n = 0;
  let healing = 0;
  for (const i of items) {
    if (i.noted) continue;
    const c = i.count ?? 1;
    if (p.id !== undefined ? i.id === p.id : nameKey(i.name) === key) {
      n += c;
      healing += c * (unit ?? 0);
    } else if (alts.has(nameKey(i.name))) {
      if (unit === null) n += c;
      else {
        const raw = healOf(i.name);
        if (raw !== null) healing += c * effectiveHeal({ heals: raw }, hp);
      }
    }
  }
  return unit === null ? n : Math.floor(healing / unit);
}

const HEALS = new Map(FOODS.map((f) => [nameKey(f.name), f.heals]));
const healOf = (name: string): number | null => HEALS.get(nameKey(name)) ?? null;

export const missingChip = (item: string): string => `⚠ Missing Item: ${item} - Turn back!`;

/** Where a banked item is taken from: the banks, the Grand Exchange's bankers and Lumbridge Castle's top floor among them. */
export const BANK_SPOTS: (Point & { label: string })[] = BANKS;

/** The nearest bank, the stairs to an upstairs one counted (the plugin's Preflight.nearest weighs them the same way). */
const nearest = <T extends Point>(from: Point, list: T[]): T | null => list.reduce<T | null>((m, c) => (!m || bankTiles(from, c) < bankTiles(from, m) ? c : m), null);

/** Name whole physical bank food/notes using the same healing allocation as preparation. */
function foodBankInstruction(p: StagePre, inp: PreflightInput): string | null {
  const food = FOODS.find(item => nameKey(item.name) === nameKey(p.item));
  if (!food) return null;
  const primary = nameKey(p.item);
  const names = [...new Map([p.item, ...(p.alt ?? [])].map(name => [nameKey(name), name])).values()];
  const bankKnown = Boolean(inp.bank && inp.bankCurrent !== false);
  const items = new Map<string, OwnedItem>();
  const primaryItem = (item: GearItem) => p.id !== undefined && !item.noted ? item.id === p.id : nameKey(item.name) === primary;
  for (const name of names) {
    const matches = (item: GearItem) => nameKey(name) === primary ? primaryItem(item) : !primaryItem(item) && nameKey(item.name) === nameKey(name);
    const count = (list: GearItem[], noted: boolean) => list.filter(item => Boolean(item.noted) === noted && matches(item)).reduce((n, item) => n + (item.count ?? 1), 0);
    items.set(nameKey(name), { name, carried: count(inp.carried ?? [], false), noted: count(inp.carried ?? [], true),
      ...(bankKnown ? { bank: count(inp.bank!, false) } : {}),
    });
  }
  const stock = heldFood({ owned: { bankSeen: bankKnown, items }, bankSeen: bankKnown, equipment: {}, manual: {} },
    { nameEn: p.item, heals: food.heals, anyOf: p.alt }, undefined, inp.levels?.hitpoints);
  const selected = foodCarry(stock, p.n ?? 1);
  if (selected.missing || !selected.take.length) return null;
  const unnote = selected.take.some(item => item.noted);
  if (!unnote && selected.take.every(item => nameKey(item.name) === primary)) return null;
  const combined = new Map<string, { name: string; count: number }>();
  for (const item of selected.take) {
    const key = nameKey(item.name);
    combined.set(key, { name: item.name, count: (combined.get(key)?.count ?? 0) + item.count });
  }
  return `${unnote ? 'Withdraw or unnote' : 'Take'} ${[...combined.values()].map(item => `${item.count} ${item.name}`).join(', ')} from the bank`;
}

/** The first missing item of the step and where to get it; null when the step may go on. */
export function itemPreflight(line: Pick<QuestStageLine, 'pre'>, inp: PreflightInput): PreflightBlock | null {
  if (!line.pre?.length || inp.carried === null) return null;
  for (const p of line.pre) {
    const need = p.n ?? 1;
    const have = countOf(inp.carried, p, inp.levels);
    if (have >= need) continue;
    const base = { item: p.item, need, have, chip: missingChip(p.item) };
    const foodTake = foodBankInstruction(p, inp);
    if (foodTake || (inp.bankCurrent !== false && inp.bank && countOf([...inp.carried, ...inp.bank], p, inp.levels) >= need)) {
      const bank = nearest(inp.from, BANK_SPOTS);
      if (bank) return { ...base, via: 'bank', target: bank, instruction: foodTake ?? `Take ${p.item} from the bank` };
    }
    if (p.at) {
      return {
        ...base, via: 'source', target: { x: p.at[0], y: p.at[1], plane: p.at[2], label: p.t ?? `Get ${p.item}` }, instruction: p.t ?? `Get ${p.item}`,
        ...(p.on?.length ? { on: p.on } : {}), ...(p.npc ? { npc: p.npc } : {}),
      };
    }
    if (!inp.bank || inp.bankCurrent === false) {
      const bank = nearest(inp.from, BANK_SPOTS);
      if (bank) return { ...base, via: 'check-bank', target: bank, instruction: `Check your bank for ${p.item} before buying` };
    }
    return { ...base, via: 'exchange', target: EXCHANGE, instruction: `Buy ${p.item} on the Grand Exchange` };
  }
  return null;
}

/**
 * Where the arrow may point for the step: its own tile, or, while an item is missing, the place to get the item. The step tile is never returned
 * while the guard blocks it.
 */
export function guardedDestination(line: QuestStageLine, inp: PreflightInput): (Point & { label?: string }) | null {
  const block = itemPreflight(line, inp);
  if (block) return block.target;
  return line.at ? { x: line.at[0], y: line.at[1], plane: line.at[2] } : null;
}

export type PreflightState = 'IN_BAG_READY' | 'MISSING_FROM_BAG' | 'NOT_FOUND_IN_BANK' | 'NOT_EQUIPPED' | 'UNKNOWN';
export interface PreflightRow {
  item: PreflightItem;
  have: number;
  /** null means the bank was not opened yet. */
  inBank: number | null;
  state: PreflightState;
}
export interface PreflightResult {
  rows: PreflightRow[];
  /** READY_TO_DEPART: everything is on hand. */
  ready: boolean;
  missing: number;
}
export function evaluatePreflight(items: PreflightItem[], owned: OwnedState, levels?: Partial<Record<string, number>> | null, equipment?: readonly WornItem[] | null): PreflightResult {
  const foods = allocateFoodStock({ owned, bankSeen: owned.bankSeen, equipment: {}, manual: {} },
    items.map((item, index) => ({ ...item, key: `departure:${index}`, anyOf: item.alt })), levels?.hitpoints);
  const materials = allocateMaterialStock({ owned, bankSeen: owned.bankSeen, equipment: {}, manual: {} },
    items.map((item, index) => ({ ...item, key: `departure:${index}`, anyOf: item.alt })));
  const rows = items.map((item, index): PreflightRow => {
    // A potion counts in doses across its four sizes, each potion by its own doses: a (3) and a (1) are 4.
    const dose = item.doses !== undefined ? doseKind(item.nameEn) : null;
    const all = dose
      ? [1, 2, 3, 4].map((d) => ({ o: owned.items.get(nameKey(doseName(dose.base, d))), w: d }))
      : [...new Set([item.nameEn, ...(item.alt ?? [])].map(nameKey))]
        .filter((n) => usableAt(n, (skill) => levels?.[skill] ?? null))
        .map((n) => ({ o: owned.items.get(n), w: 1 }));
    const need = item.doses ?? item.count;
    const legacy = Boolean(toolFamilyOf(item.nameEn)) && all.some(({ o }) => o?.legacyToolCount);
    const count = (where: 'carried' | 'bank') => legacy ? Math.max(0, ...all.map(({ o }) => o?.[where] ?? 0)) : all.reduce((s, { o, w }) => s + (o?.[where] ?? 0) * w, 0);
    const food = foods.get(`departure:${index}`);
    const material = materials.get(`departure:${index}`);
    const carried = material ? material.bag ?? 0 : food ? food.bag ?? 0 : count('carried');
    const accepted = new Set([item.nameEn, ...(item.alt ?? [])].map(nameKey));
    const worn = countWorn(equipment, n => accepted.has(nameKey(n)));
    const have = item.equip ? worn.count : carried;
    const inBank = material ? material.bank : food ? food.bank : owned.bankSeen && all.every(({ o }) => o?.bank !== undefined) ? count('bank') : null;
    let state: PreflightState;
    if (have >= need) state = 'IN_BAG_READY';
    else if (item.equip && !worn.known) state = 'UNKNOWN';
    else if (item.equip && carried >= need) state = 'NOT_EQUIPPED';
    else if (inBank === null || carried + inBank + (material?.noted ?? 0) >= need) state = 'MISSING_FROM_BAG';
    else state = 'NOT_FOUND_IN_BANK';
    return { item, have, inBank, state };
  });
  const missing = rows.filter((r) => r.state !== 'IN_BAG_READY').length;
  return { rows, ready: rows.length > 0 && missing === 0, missing };
}
