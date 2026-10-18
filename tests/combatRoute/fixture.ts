// The reported character at S4-03 (Attack 30, Strength 21, Defence 1, 24 hitpoints, an Adamant scimitar and iron armour), built the way the app builds
// the estimator's inputs. Tests state what differs from it.

import { allSteps, stepById } from '../../src/data';
import { gearById } from '../../src/services/gearAdvisor';
import type { StepEstimateContext } from '../../src/lib/combatEstimate';
import type { PlanInput } from '../../src/lib/combatRoute/plans';
import { nameKey, type OwnedItem, type OwnedState } from '../../src/lib/checklist';
import type { Step } from '../../src/types';

const gearId = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const SLOT: Record<string, string> = { 'Adamant scimitar': 'weapon', 'Mithril scimitar': 'weapon', 'Iron full helm': 'head', 'Iron platebody': 'body', 'Iron plateskirt': 'legs', 'Iron kiteshield': 'shield' };

export const HISTORICAL = {
  stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 },
  xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 },
  worn: ['Adamant scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'],
};

export function gearOf(worn: string[]) {
  return { equipment: worn.map((n) => ({ id: gearId(n), name: n, slot: SLOT[n] ?? 'body' })), inventory: [], coins: 400, bankCoins: 0 } as never;
}

export function ownedOf(items: Record<string, [number, number]>, bankSeen = true): OwnedState {
  return { bankSeen, items: new Map(Object.entries(items).map(([n, [carried, bank]]): [string, OwnedItem] => [nameKey(n), { name: n, carried, noted: 0, bank: bankSeen ? bank : undefined }])) };
}

export interface Over {
  stepId?: string;
  stats?: Record<string, number>;
  xp?: Record<string, number>;
  worn?: string[];
  items?: Record<string, [number, number]>;
  bankSeen?: boolean;
  foodPrice?: number | null;
  keepDefenceOne?: boolean;
  adopted?: string | null;
  fights?: StepEstimateContext['fights'];
}

export function planInput(o: Over = {}): PlanInput {
  const step = stepById.get(o.stepId ?? 'S4-03') as Step;
  return {
    step, steps: allSteps,
    ctx: { stats: o.stats ?? HISTORICAL.stats, xp: o.xp ?? HISTORICAL.xp, gear: gearOf(o.worn ?? HISTORICAL.worn), fights: o.fights },
    owned: ownedOf(o.items ?? {}, o.bankSeen ?? true),
    foodPrice: o.foodPrice === undefined ? 33 : o.foodPrice,
    keepDefenceOne: o.keepDefenceOne, adopted: o.adopted,
  };
}
