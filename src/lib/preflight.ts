import type { QuestStageLine, StagePre } from '../types';
import type { GearItem } from '../services/runeliteBridge';
import { BANKS, EXCHANGE, dist, type Point } from './travel';
import { nameKey } from './checklist';

/**
 * The item pre-flight guard for a quest stage step: while an item the step uses is not in the bag (or worn), the arrow does not lead to the step.
 * It leads where the item is: the nearest bank when the bank snapshot holds it, else the place named in the data, else the Grand Exchange.
 * The plugin runs the same rules in Java (Preflight.java); this module is the app's copy and what the tests pin.
 *
 * Unknown is not missing: with no bag read yet nothing is blocked, and the bank is used only when it has really been seen.
 */
export interface PreflightInput {
  carried: GearItem[] | null;
  /** The bank snapshot, or null when the bank has never been opened. */
  bank?: GearItem[] | null;
  from: Point;
}

export interface PreflightBlock {
  item: string;
  need: number;
  have: number;
  via: 'bank' | 'source' | 'exchange';
  target: Point & { label: string };
  /** What to do now, for the HUD heading and the arrow label. */
  instruction: string;
  /** The red HUD chip. */
  chip: string;
  on?: string[];
  npc?: string;
}

/** How many of the item the container holds: by exact id when the data gives one, else by name. */
export function countOf(items: GearItem[], p: Pick<StagePre, 'item' | 'id'>): number {
  const key = nameKey(p.item);
  let n = 0;
  for (const i of items) {
    const c = i.count ?? 1;
    if (p.id !== undefined ? i.id === p.id : nameKey(i.name) === key) n += c;
  }
  return n;
}

export const missingChip = (item: string): string => `⚠ Missing Item: ${item} - Turn back!`;

/** Where a banked item is taken from: the banks of the surface and the Grand Exchange (it has booths). */
export const BANK_SPOTS: (Point & { label: string })[] = [...BANKS, EXCHANGE];

const nearest = <T extends Point>(from: Point, list: T[]): T | null => list.reduce<T | null>((m, c) => (!m || dist(from, c) < dist(from, m) ? c : m), null);

/** The first missing item of the step and where to get it; null when the step may go on. */
export function itemPreflight(line: Pick<QuestStageLine, 'pre'>, inp: PreflightInput): PreflightBlock | null {
  if (!line.pre?.length || inp.carried === null) return null;
  for (const p of line.pre) {
    const need = p.n ?? 1;
    const have = countOf(inp.carried, p);
    if (have >= need) continue;
    const base = { item: p.item, need, have, chip: missingChip(p.item) };
    if (inp.bank && countOf(inp.bank, p) >= need - have) {
      const bank = nearest(inp.from, BANK_SPOTS);
      if (bank) return { ...base, via: 'bank', target: bank, instruction: `Take ${p.item} from the bank` };
    }
    if (p.at) {
      return {
        ...base, via: 'source', target: { x: p.at[0], y: p.at[1], plane: p.at[2], label: p.t ?? `Get ${p.item}` }, instruction: p.t ?? `Get ${p.item}`,
        ...(p.on?.length ? { on: p.on } : {}), ...(p.npc ? { npc: p.npc } : {}),
      };
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
