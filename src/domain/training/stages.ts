// The planned path told as stages: where each one trains and what changes when it starts (a better tool, a new spot, new supplies).
import type { GameMode } from '../../types';
import { nameKey } from '../items/itemKey';
import { AXES, PICKAXES, toolUse } from '../items/toolTiers';
import type { PlayerState } from '../player/playerState';
import { SPELLS, isCombatSpell } from '../combat/magicPlan';
import type { PathLeg } from './trainingRouter';

export interface Stage {
  leg: PathLeg;
  fromLevel: number;
  toLevel: number;
  /** What is new when this stage starts: the tool tier the level opens, supplies the previous stage did not use. */
  changes: string[];
}

/** Special and cosmetic tiers that are not the next upgrade (a gilded pickaxe works as a rune one). */
const SIDE_TIER = /^(gilded|3rd age|infernal) /i;

/** The best axe or pickaxe the level allows (members tiers only on a members account); null for other skills. */
export function toolTierAt(skill: string, level: number, mode: GameMode): string | null {
  const family = skill === 'mining' ? PICKAXES : skill === 'woodcutting' ? AXES : null;
  if (!family) return null;
  let best: string | null = null;
  for (const name of family) {
    const use = toolUse(name);
    if (use && use.level <= level && (mode === 'members' || !use.members) && !SIDE_TIER.test(name)) best = name;
  }
  return best;
}

/** The runes of the best combat spell of this level, by name: the spell a later Magic stage plans to buy for. */
function strikeRunesAt(level: number): string[] {
  const spell = SPELLS.filter((sp) => isCombatSpell(sp) && sp.level <= level).sort((x, y) => y.level - x.level)[0];
  return spell ? Object.keys(spell.runes).map((e) => `${e[0].toUpperCase()}${e.slice(1)} rune`) : [];
}

/**
 * A later leg as the plan sees it: the player carries what that stage recommends buying (the tool tier the level opens, the
 * runes of the best combat spell) once it differs from the kit of the current level, unless they already carry it, so the
 * rate matches the advice. Until then the player's own kit stands.
 */
export function withPlannedKit(state: PlayerState, skill: string, level: number, currentLevel: number): PlayerState {
  const kitAt = (lv: number): [string, number][] => {
    const tier = toolTierAt(skill, lv, state.mode);
    return tier ? [[tier, 1]] : skill === 'magic' ? strikeRunesAt(lv).map((r) => [r, 1000]) : [];
  };
  const kit = kitAt(level);
  if (JSON.stringify(kit) === JSON.stringify(kitAt(currentLevel))) return state;
  const owned = state.owned ?? { bankSeen: false, items: new Map() };
  const missing = kit.filter(([name]) => (owned.items.get(nameKey(name))?.carried ?? 0) <= 0);
  if (!missing.length) return state;
  const items = new Map(owned.items);
  for (const [name, count] of missing) items.set(nameKey(name), { name, carried: count, noted: 0 });
  return { ...state, owned: { ...owned, items } };
}

const itemNames = (leg: PathLeg): string[] =>
  (leg.needs ?? []).flatMap((n) => (n.type === 'item' && !toolUse(n.name) ? [n.name] : []));

/** Legs that change nothing are joined; a new method, tool tier or supply starts a stage. */
export function stagesOf(path: readonly PathLeg[], skill: string, mode: GameMode): Stage[] {
  const out: Stage[] = [];
  for (const leg of path) {
    const prev = out[out.length - 1];
    const tool = toolTierAt(skill, leg.fromLevel, mode);
    const items = itemNames(leg);
    if (prev) {
      const prevItems = itemNames(prev.leg);
      const changes = [
        ...(tool && tool !== toolTierAt(skill, prev.fromLevel, mode) ? [tool] : []),
        ...items.filter((i) => !prevItems.includes(i)),
      ];
      if (prev.leg.method.id === leg.method.id && !changes.length) {
        prev.toLevel = leg.toLevel;
        continue;
      }
      out.push({ leg, fromLevel: leg.fromLevel, toLevel: leg.toLevel, changes });
    } else {
      out.push({ leg, fromLevel: leg.fromLevel, toLevel: leg.toLevel, changes: [...(tool ? [tool] : []), ...items] });
    }
  }
  return out;
}
