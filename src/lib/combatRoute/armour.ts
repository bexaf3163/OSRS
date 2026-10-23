import type { GameMode, GearPiece, StepItemRequirement } from '../../types';
import { itemById } from '../../data';
import { canWear, gearById, gearData, relevantDefence, type IncomingStyle, type Levels } from '../../services/gearAdvisor';
import { heldExact, levelOf, type PlayerState } from '../playerState';
import { nameKey } from '../checklist';
import type { PriceView } from '../funding/quotes';
import { itemPrice } from '../itemPrice';

const STYLES: IncomingStyle[] = ['stab', 'slash', 'crush', 'magic', 'ranged'];
const styleOf = (style: string): IncomingStyle | null => STYLES.find(s => s === style) ?? null;

/** The catalogue owns stats, IDs and equip requirements; this policy only compares its existing records. */
export function armourOptions(id: number, style: string, mode: GameMode): GearPiece[] {
  const base = gearById.get(id);
  if (!base) return [];
  const against = styleOf(style);
  return gearData.items.filter(p => p.slot === base.slot && !p.reqUnverified && (!p.members || mode === 'members')
    && (against ? relevantDefence(p, against) >= relevantDefence(base, against)
      : (['stab', 'slash', 'crush'] as const).every(s => p.defence[s] >= base.defence[s])));
}

export function armourDefence(ids: readonly number[]): number {
  return Math.max(1, ...ids.map(id => gearById.get(id)?.req?.defence ?? 1));
}

function usable(p: GearPiece, state: PlayerState, worn = false): boolean {
  const levels: Levels = { attack: levelOf(state, 'attack') ?? 1, strength: levelOf(state, 'strength') ?? 1,
    defence: levelOf(state, 'defence') ?? 1, ranged: levelOf(state, 'ranged') ?? 1, magic: levelOf(state, 'magic') ?? 1, prayer: levelOf(state, 'prayer') ?? 1 };
  // Confirmed worn gear establishes its quest unlock; ownership alone does not.
  const quests = state.quests.known ? state.quests.value : worn ? p.req?.quests ?? [] : [];
  return canWear(p, levels, new Set(quests));
}

export function armourReady(ids: readonly number[], style: string, state: PlayerState | undefined): boolean {
  if (!state?.connected || !state.equipmentKnown || ids.length === 0) return false;
  return ids.every(id => armourOptions(id, style, state.mode).some(p => usable(p, state, true)
    && nameKey(state.equipment[p.slot] ?? '') === nameKey(p.name)));
}

/** Owned usable pieces precede purchases. Unread alternatives are retained in anyOf, never treated as absent. */
export function armourItems(ids: readonly number[], style: string, state: PlayerState, prices?: PriceView): StepItemRequirement[] {
  return ids.flatMap(id => {
    const base = gearById.get(id);
    if (!base) return [];
    const isWorn = (p: GearPiece) => state.connected && state.equipmentKnown && nameKey(state.equipment[p.slot] ?? '') === nameKey(p.name);
    const options = armourOptions(id, style, state.mode).filter(p => usable(p, state, isWorn(p)));
    const owned = options.filter(p => isWorn(p) || heldExact(state, p.name).presence === 'PRESENT');
    const rank = (p: GearPiece) => nameKey(state.equipment[p.slot] ?? '') === nameKey(p.name) ? 0 : (heldExact(state, p.name).bag ?? 0) > 0 ? 1 : 2;
    owned.sort((a, b) => rank(a) - rank(b) || relevantDefence(b, styleOf(style)) - relevantDefence(a, styleOf(style)) || a.id - b.id);
    const purchase = options.filter(p => p.metal === base.metal).sort((a, b) =>
      (itemPrice(prices, a.name, a.id, 1).unit ?? Infinity) - (itemPrice(prices, b.name, b.id, 1).unit ?? Infinity) || Number(b.id === id) - Number(a.id === id));
    const chosen = owned[0] ?? purchase[0] ?? base;
    const detail = itemById.get(chosen.id);
    const alternatives = options.filter(p => p.id !== chosen.id).map(p => p.name);
    return [{ nameEn: chosen.name, wikiItemId: chosen.id, amount: 1, equip: true,
      ...(alternatives.length ? { anyOf: alternatives } : {}), ...(detail?.iconUrl ? { iconUrl: detail.iconUrl } : { iconUrl: chosen.iconUrl }),
      howToGet: `Black armour requires ${armourDefence(ids)} Defence. Equip owned equivalent or better armour; buy only needed upgrades on the Grand Exchange. Keep coins for food.`,
    }];
  });
}
