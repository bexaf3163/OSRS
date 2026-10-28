// Declared, interchangeable non-food supplies share physical stock across preparation lines.
// Healing equivalents, equipment and tool tiers keep their existing specialised accounting.
import { nameKey, type OwnedItem } from './checklist';
import { doseKind, type HeldUnits } from './doses';
import { heldExact, type Held, type PlayerState } from './playerState';
import { toolFamilyOf } from './toolTiers';

type StockState = Pick<PlayerState, 'owned' | 'equipment' | 'equipmentItems' | 'manual' | 'bankSeen'>;
interface Demand { key: string; manualKey?: string; nameEn: string; count: number; anyOf?: readonly string[]; heals?: number; equip?: boolean; reservedCount?: number }
export interface MaterialHolding extends HeldUnits {
  parts: { name: string; held: Held }[];
  bankLower: number;
}
export interface MaterialTake { name: string; count: number; noted: boolean }

const material = (line: Demand) => Boolean(line.anyOf?.length && !line.heals && !line.equip && !doseKind(line.nameEn) && !toolFamilyOf(line.nameEn));

/** Positive counts are lower bounds; an unread accepted alternative cannot prove a shortage. */
function holding(state: StockState, line: Demand, reserved: ReadonlyMap<string, number>): MaterialHolding {
  const primary = nameKey(line.nameEn);
  const names = new Map<string, string>();
  for (const name of [line.nameEn, ...(line.anyOf ?? [])]) if (!names.has(nameKey(name))) names.set(nameKey(name), name);
  const parts = [...names.values()].map(name => {
    const h = heldExact(state, name, nameKey(name) === primary ? line.manualKey ?? line.key : undefined);
    const reserve = reserved.get(nameKey(name)) ?? 0;
    let keep = reserve;
    const bank = h.bank === null ? null : Math.max(0, h.bank - keep);
    keep = Math.max(0, keep - (h.bank ?? 0));
    const noted = Math.max(0, h.noted - keep);
    keep = Math.max(0, keep - h.noted);
    const bag = h.bag === null ? null : Math.max(0, h.bag - keep);
    const total = h.total === null ? null : Math.max(0, h.total - reserve);
    return { name, held: { ...h, bag, noted, bank, total } };
  });
  // An explicit primary ownership mark that covers the demand needs no unobserved alternatives.
  const marked = parts[0];
  const physical = parts.reduce((sum, part) => sum + (part.held.bag ?? 0) + part.held.noted + (part.held.bank ?? 0), 0);
  if (marked.held.source === 'manual' && (marked.held.total ?? 0) >= line.count && physical < line.count) {
    return { ...marked.held, unit: 'piece', parts: [marked], bankLower: 0 };
  }
  const sum = (field: 'bag' | 'noted' | 'bank' | 'total') => parts.reduce((n, p) => n + (p.held[field] ?? 0), 0);
  const bagKnown = parts.some(p => p.held.bag !== null);
  const bankKnown = parts.every(p => p.held.bank !== null);
  const complete = parts.every(p => p.held.bank !== null || p.held.source === 'manual');
  const total = sum('total');
  const known = total > 0 || complete;
  return { unit: 'piece', parts, bag: bagKnown ? sum('bag') : null, noted: sum('noted'),
    bank: bankKnown ? sum('bank') : null, bankLower: sum('bank'), total: known ? total : null, equipped: 0,
    presence: total > 0 ? 'PRESENT' : complete ? 'MISSING' : 'UNKNOWN',
    source: complete && physical < line.count && parts.some(p => p.held.source === 'manual') ? 'manual' : parts.some(p => p.held.source !== 'none') ? 'game' : 'none' };
}

/** Required primary stacks are reserved before alternatives are allocated, then physical pieces are spent once. */
export function allocateMaterialStock(state: StockState, lines: readonly Demand[], reservations?: ReadonlyMap<string, number>): Map<string, MaterialHolding> {
  if (!lines.some(material)) return new Map();
  const names = new Set(lines.filter(material).flatMap(line => [line.nameEn, ...(line.anyOf ?? [])]).map(nameKey));
  const items = new Map<string, OwnedItem>([...names].flatMap(key => {
    const value = state.owned?.items.get(key);
    return value ? [[key, { ...value }] as [string, OwnedItem]] : [];
  }));
  const pool = { ...state, manual: { ...state.manual }, owned: state.owned ? { ...state.owned, items } : null };
  const reserved = new Map(reservations);
  if (!reservations) for (const line of lines) reserved.set(nameKey(line.nameEn), (reserved.get(nameKey(line.nameEn)) ?? 0) + line.count);
  const result = new Map<string, MaterialHolding>();
  for (const line of lines) {
    if (!material(line)) continue;
    const primary = nameKey(line.nameEn);
    reserved.set(primary, Math.max(0, (reserved.get(primary) ?? 0) - (line.reservedCount ?? line.count)));
    const held = holding(pool, line, reserved);
    result.set(line.key, held);
    let left = line.count;
    let primaryUsed = 0;
    for (const where of ['bag', 'noted', 'bank'] as const) for (const part of held.parts) {
      const take = Math.min(left, part.held[where] ?? 0);
      const record = items.get(nameKey(part.name));
      if (record && take > 0) {
        const field = where === 'bag' ? 'carried' : where;
        record[field] = Math.max(0, (record[field] ?? 0) - take);
        left -= take;
        if (nameKey(part.name) === primary) primaryUsed += take;
      }
    }
    const manualKey = line.manualKey ?? line.key;
    if (pool.manual[manualKey] !== undefined) pool.manual[manualKey] = Math.max(0, pool.manual[manualKey] - primaryUsed - left);
  }
  return result;
}

/** Exact physical withdrawals after the usable bag has been spent; notes must be unnoted. */
export function materialTake(held: MaterialHolding, count: number): MaterialTake[] {
  const physical = held.parts.reduce((sum, part) => sum + (part.held.bag ?? 0) + part.held.noted + (part.held.bank ?? 0), 0);
  if (physical < count && held.parts.some(p => p.held.source === 'manual')) return [];
  let left = Math.max(0, count - (held.bag ?? 0));
  const take: MaterialTake[] = [];
  for (const where of ['noted', 'bank'] as const) for (const part of held.parts) {
    const n = Math.min(left, part.held[where] ?? 0);
    if (n > 0) { take.push({ name: part.name, count: n, noted: where === 'noted' }); left -= n; }
  }
  return take;
}
