// The "What you need" plan as a strip of chips grouped by timing (take now / meanwhile / along the way / not now).
// A chip says where the thing is in words, not only in colour; an unchecked thing stays "not checked" — it is never turned into "missing".

import type { PrepLine, PrepPlan, PrepWhere } from './prepPlan';

export type ChipState = 'ok' | 'bank' | 'missing' | 'unknown';
export interface Chip { key: string; text: string; state: ChipState }
export interface ChipGroup { key: 'now' | 'soon' | 'way' | 'later'; label: string; chips: Chip[] }

const STATE: Record<PrepWhere, ChipState> = { EQUIPPED: 'ok', INVENTORY: 'ok', BANK: 'bank', MISSING: 'missing', UNKNOWN: 'unknown' };
const SUFFIX: Record<ChipState, string> = { ok: '', bank: ' · in the bank', missing: ' · missing', unknown: ' · not checked' };

export function chipOf(l: PrepLine): Chip {
  const state = STATE[l.where];
  const count = l.count > 1 ? ` ×${l.count}${l.exact ? '' : '+'}` : '';
  return { key: l.key, text: `${l.name}${count}${SUFFIX[state]}`, state };
}

export function prepChipGroups(plan: Pick<PrepPlan, 'now' | 'soon' | 'byTheWay' | 'later'>, showLater: boolean): ChipGroup[] {
  const groups: ChipGroup[] = [
    { key: 'now', label: 'Take now', chips: plan.now.map(chipOf) },
    { key: 'soon', label: 'Meanwhile', chips: plan.soon.map(chipOf) },
    { key: 'way', label: 'Along the way', chips: plan.byTheWay.map(chipOf) },
    { key: 'later', label: 'Do not take now', chips: showLater ? plan.later.map(chipOf) : [] },
  ];
  return groups.filter((g) => g.chips.length > 0);
}
