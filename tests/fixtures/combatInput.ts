// The reported character (Attack 30, Strength 21, Defence 1, 24 hitpoints, an Adamant scimitar and iron armour) on a retired
// combat training step, built the way the app builds the estimator's inputs. Tests state what differs from it.
import { gearById } from '../../src/domain/combat/gearAdvisor';
import type { StepEstimateContext } from '../../src/domain/combat/combatEstimate';
import { termsFor } from '../../src/domain/combat/spots';
import type { OwnedItem, OwnedState } from '../../src/domain/items/checklist';
import type { Step } from '../../src/types';
import { retiredStep } from './retiredSteps';

const gearId = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const SLOT: Record<string, string> = { 'Adamant scimitar': 'weapon', 'Iron full helm': 'head', 'Iron platebody': 'body', 'Iron plateskirt': 'legs', 'Iron kiteshield': 'shield' };
const STATS = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
const XP = { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 };
const WORN = ['Adamant scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'];

export interface CombatInput { step: Step; ctx: StepEstimateContext; owned: OwnedState }

export function combatInput(stepId: string): CombatInput {
  const owned: OwnedState = { bankSeen: true, items: new Map<string, OwnedItem>() };
  return {
    step: retiredStep(stepId),
    ctx: {
      stats: STATS, xp: XP, fights: undefined, terms: termsFor(),
      gear: { equipment: WORN.map((n) => ({ id: gearId(n), name: n, slot: SLOT[n] })), inventory: [], coins: 400, bankCoins: 0 } as never,
    },
    owned,
  };
}
