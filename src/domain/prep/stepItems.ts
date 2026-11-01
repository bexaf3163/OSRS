// The items a step needs according to its data: amounts, alternatives, tools and potion doses.
import type { Step, StepItemRequirement } from '../../types';
import { alternativesOf } from '../items/toolTiers';
import { parseAmount } from '../items/checklist';
import { doseKind } from '../items/doseKind';

export interface PreflightItem {
  equip?: boolean;
  nameEn: string;
  id?: number;
  count: number;
  /** false means the route's quantity is not a number: "at least one is there" is checked. */
  exact: boolean;
  heals?: number;
  /** Other items that count in its place (every pickaxe tier for "Bronze pickaxe"). */
  alt?: string[];
  /** Food with a personal plan: what the whole remaining goal needs (`count` is one trip). */
  total?: number;
  /** A potion: the doses `count` potions hold ("Strength potion(4)" ×4 is 16); every size counts toward them (doses.ts, Checklist.java). */
  doses?: number;
}
/** What to check at the bank: the required items except those obtained during the step itself. */
export function preflightItems(step: Step): PreflightItem[] {
  return (step.itemsRequired ?? [])
    .filter((i: StepItemRequirement) => !i.inStep)
    .map((i) => {
      const n = parseAmount(i.amount);
      const alt = alternativesOf(i.nameEn, i.anyOf);
      const dose = doseKind(i.nameEn);
      return {
        nameEn: i.nameEn, id: i.wikiItemId, count: n ?? 1, exact: n !== null, heals: i.heals, ...(alt.length ? { alt } : {}),
        ...(i.equip ? { equip: true } : {}),
        ...(i.totalAmount !== undefined && n !== null && i.totalAmount > n ? { total: i.totalAmount } : {}),
        ...(dose ? { doses: (n ?? 1) * dose.per } : {}),
      };
    });
}
