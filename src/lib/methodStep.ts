// A skill step that follows the training method (Step.followsMethod): what the step asks for and where the arrow goes are those of the method the
// app recommends for the player's real level ("What to train with"), not a fixed list. The route's fixed list for a long climb (Fishing 1-50) was
// the lobster pot and the harpoon, which a level-1 player does not need, and the "any tool counts" fix of 2.54.2 let a harpoon stand in for a net.
//
// Pure data here: the pick itself (which method, from the level, the mode, the style and what is carried) is lib/methodPick.ts and is stored by
// the provider that owns the player state; the store applies it to the steps, so every screen, the readiness engine and the plugin payload
// see the same requirements. A level that is unknown keeps the step's own list: nothing is guessed.

import type { MapLocation, Step, StepItemRequirement } from '../types';
import methodsJson from '../data/trainingMethods.json';
import { items as itemData } from '../data';
import { matchStrict } from '../services/locationResolver';

/** The stored pick when the skill's goal is already reached: no tool of that skill is asked for. */
export const GOAL_REACHED = 'goal-reached';

interface RawNeed { type: string; name?: string; count?: number }
interface RawMethod { id: string; skills: string[]; name: string; from: number; to: number | null; needs?: RawNeed[]; place?: string; where: string }

const RAW: RawMethod[] = (methodsJson as unknown as { methods: (Omit<RawMethod, 'skills'> & { skill: string | string[] })[] }).methods
  .map((m) => ({ ...m, skills: Array.isArray(m.skill) ? m.skill : [m.skill] }));
const METHODS = new Map(RAW.map((m) => [m.id, m]));
const ITEMS = new Map(itemData.map((i) => [i.nameEn.toLowerCase(), i]));

/** The skill and the level the step's own completion check asks for, or null when the step has no such goal. */
export function followedGoal(step: Pick<Step, 'followsMethod' | 'inGame'>): { skill: string; target: number } | null {
  const skill = step.followsMethod;
  const trig = step.inGame?.completionTrigger;
  if (!skill || trig?.type !== 'SKILL_LEVEL') return null;
  const row = trig.levels?.find((l) => l.skill === skill);
  return row ? { skill, target: row.level } : null;
}

/** Every tool any method of the followed skill asks for. The game must report all of them, not only the picked method's: an item that is not
 * tracked reads as unknown, which ranks a method as ready, so the pick would flip between two methods forever. */
export function methodToolNames(step: Pick<Step, 'followsMethod'>): string[] {
  const skill = step.followsMethod;
  if (!skill) return [];
  const names = new Set<string>();
  for (const m of RAW) if (m.skills.includes(skill)) for (const n of m.needs ?? []) if (n.type === 'item' && n.name) names.add(n.name);
  return [...names];
}

function requirement(n: RawNeed, m: RawMethod): StepItemRequirement | null {
  if (n.type !== 'item' || !n.name) return null;
  const known = ITEMS.get(n.name.toLowerCase());
  const shop = known?.buyLocations?.find((b) => !b.members);
  const range = m.to === null ? `from level ${m.from}` : `levels ${m.from}-${m.to}`;
  return {
    nameEn: n.name,
    amount: n.count ?? 1,
    howToGet: `For ${m.name.charAt(0).toLowerCase()}${m.name.slice(1)} (${range}).${shop ? ` ${shop.shopName}, ${shop.location}.` : ''}`,
    ...(known ? { wikiItemId: known.id, iconUrl: known.iconUrl } : {}),
  };
}

/** The place of a method as a step point, from the place dictionary only (no guessing from the text); null when it has none. */
export function methodPoint(methodId: string): MapLocation | null {
  const m = METHODS.get(methodId);
  const p = m?.place ? matchStrict(m.place) : null;
  return m && p ? { x: p.x, y: p.y, plane: p.plane, label: `${m.name} — ${p.label}` } : null;
}

/**
 * The step as the player needs it now: the tools of the picked method, its place, and its tools to highlight in the game. A step without
 * followsMethod, no pick, or a pick that names no known method comes back unchanged (the same object).
 */
export function withTrainingMethod(step: Step, pick: string | undefined): Step {
  if (!step.followsMethod || !pick) return step;
  if (pick === GOAL_REACHED) {
    return { ...step, itemsRequired: [], ...(step.inGame ? { inGame: { ...step.inGame, highlightItems: [] } } : {}) };
  }
  const m = METHODS.get(pick);
  if (!m) return step;
  const itemsRequired = (m.needs ?? []).map((n) => requirement(n, m)).filter((r): r is StepItemRequirement => r !== null);
  const at = methodPoint(pick);
  return {
    ...step,
    itemsRequired,
    ...(at ? { mapLocation: at } : {}),
    ...(step.inGame ? { inGame: { ...step.inGame, highlightItems: itemsRequired.map((i) => i.nameEn) } } : {}),
  };
}
