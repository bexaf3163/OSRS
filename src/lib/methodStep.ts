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
import { AXES, PICKAXES } from './toolTiers';
import type { MethodNeed } from './trainingRouter';

/** The stored pick when the skill's goal is already reached: no tool of that skill is asked for. */
export const GOAL_REACHED = 'goal-reached';
export const UNKNOWN_GOAL_PREFIX = 'goal-unknown:';

interface RawMethod { id: string; skills: string[]; name: string; from: number; to: number | null; needs?: MethodNeed[]; place?: string; objectNames?: string[]; where: string; note?: string }

const RAW: RawMethod[] = (methodsJson as unknown as { methods: (Omit<RawMethod, 'skills'> & { skill: string | string[] })[] }).methods
  .map((m) => ({ ...m, skills: Array.isArray(m.skill) ? m.skill : [m.skill] }));
const METHODS = new Map(RAW.map((m) => [m.id, m]));
const ITEMS = new Map(itemData.map((i) => [i.nameEn.toLowerCase(), i]));

function needNames(need: MethodNeed): readonly string[] {
  if (need.type === 'item') return [need.name, ...need.anyOf ?? []];
  if (need.type === 'tool') return need.skill === 'mining' ? PICKAXES : AXES;
  return [];
}

/** The skill and the level the step's own completion check asks for, or null when the step has no such goal. */
export function followedGoal(step: Pick<Step, 'followsMethod' | 'inGame'>): { skill: string; target: number } | null {
  const skill = step.followsMethod;
  const trig = step.inGame?.completionTrigger;
  if (!skill || trig?.type !== 'SKILL_LEVEL') return null;
  const row = trig.levels?.find((l) => l.skill === skill);
  return row ? { skill, target: row.level } : null;
}

/** One ordered set of goals from the unchanged completion trigger; the declared primary skill goes first. */
export function followedGoals(step: Pick<Step, 'followsMethod' | 'inGame'>): { skill: string; target: number }[] {
  const primary = followedGoal(step);
  const trigger = step.inGame?.completionTrigger;
  if (!primary || trigger?.type !== 'SKILL_LEVEL') return [];
  return [primary, ...(trigger.levels ?? []).filter(g => g.skill !== primary.skill).map(g => ({ skill: g.skill, target: g.level }))];
}

/** Every tool any method of the followed skill asks for. The game must report all of them, not only the picked method's: an item that is not
 * tracked reads as unknown, which ranks a method as ready, so the pick would flip between two methods forever. */
export function methodToolNames(step: Pick<Step, 'followsMethod' | 'inGame'>): string[] {
  const goals = followedGoals(step);
  const skills = goals.length ? goals.map(g => g.skill) : step.followsMethod ? [step.followsMethod] : [];
  if (!skills.length) return [];
  const names = new Set<string>();
  for (const m of RAW) if (m.skills.some(skill => skills.includes(skill))) for (const need of m.needs ?? []) for (const name of needNames(need)) names.add(name);
  return [...names];
}

function requirement(n: MethodNeed, m: RawMethod): StepItemRequirement | null {
  const names = needNames(n);
  const name = names[0];
  if (!name) return null;
  const known = ITEMS.get(name.toLowerCase());
  const shop = known?.buyLocations?.find((b) => !b.members);
  return {
    nameEn: name,
    amount: n.type === 'item' ? n.count ?? 1 : 1,
    howToGet: `For ${m.name.charAt(0).toLowerCase()}${m.name.slice(1)}.${shop ? ` ${shop.shopName}, ${shop.location}.` : ''}`,
    ...(known ? { wikiItemId: known.id, iconUrl: known.iconUrl } : {}),
    ...(names.length > 1 ? { anyOf: names.slice(1) } : {}),
  };
}

/** The place of a method as a step point, from the place dictionary only (no guessing from the text); null when it has none. */
export function methodPoint(methodId: string): MapLocation | null {
  const m = METHODS.get(methodId);
  const p = m?.place ? matchStrict(m.place) : null;
  return m && p ? { x: p.x, y: p.y, plane: p.plane, label: `${m.skills.includes('cooking') ? 'Cooking: ' : ''}${m.name} — ${p.label}` } : null;
}

/**
 * The step as the player needs it now: the tools of the picked method, its place, and its tools to highlight in the game. A step without
 * followsMethod, no pick, or a pick that names no known method comes back unchanged (the same object).
 */
export function withTrainingMethod(step: Step, pick: string | undefined): Step {
  if (!step.followsMethod || !pick) return step;
  if (pick.startsWith(UNKNOWN_GOAL_PREFIX)) {
    const skill = pick.slice(UNKNOWN_GOAL_PREFIX.length);
    if (!followedGoals(step).some(g => g.skill === skill)) return step;
    const message = `Check your ${skill} level in RuneLite or Skills before choosing its training method.`;
    return { ...step, followsMethod: skill, itemsRequired: [], itemsRecommended: [], mapLocation: undefined, resourceSpots: [],
      requirements: [...step.requirements ?? [], { type: 'skill', skill, min: 1 }],
      warning: message, how: message, where: 'Training level not checked', quickSteps: [message], pacing: undefined, foes: undefined, threats: undefined,
      ...(step.inGame ? { inGame: { ...step.inGame, worldPoint: undefined, groundTiles: [], pathWaypoints: undefined,
        npcNames: [], npcIds: [], objectNames: [], objectIds: [], highlightItems: [], goal: message } } : {}),
    };
  }
  if (pick === GOAL_REACHED) {
    return { ...step, itemsRequired: [], itemsRecommended: [], mapLocation: undefined, resourceSpots: [],
      ...(step.inGame ? { inGame: { ...step.inGame, worldPoint: undefined, groundTiles: [], pathWaypoints: undefined,
        npcNames: [], npcIds: [], objectNames: [], objectIds: [], highlightItems: [], goal: 'Training goals reached' } } : {}),
    };
  }
  const m = METHODS.get(pick);
  const goals = followedGoals(step);
  const goal = goals.find(g => m?.skills.includes(g.skill));
  if (!m || !goal) return step;
  const itemsRequired = (m.needs ?? []).map((n) => requirement(n, m)).filter((r): r is StepItemRequirement => r !== null);
  const at = methodPoint(pick);
  return {
    ...step,
    followsMethod: goal.skill,
    itemsRequired,
    ...(goal.skill !== step.followsMethod || goal.skill === 'mining' || goal.skill === 'woodcutting' ? {
      itemsRecommended: [], foes: undefined, threats: undefined, pacing: undefined,
      where: m.where, how: `Train ${goal.skill} to ${goal.target}: ${m.name}. ${m.note ?? ''}`.trim(),
      quickSteps: ['Bank finished-skill tools and surplus supplies before withdrawing the current batch.', `Prepare the listed supplies for ${m.name}.`, `Train ${goal.skill} to ${goal.target} at ${m.where}. ${m.note ?? ''}`.trim()],
    } : {}),
    // The static climb contains future places. Once a method is selected, map and plugin use only its point.
    mapLocation: at ?? undefined, resourceSpots: at ? [at] : [],
    ...(step.inGame ? { inGame: {
      ...step.inGame,
      worldPoint: at ?? undefined, groundTiles: at ? [at] : [], pathWaypoints: undefined,
      goal: at?.label ?? `${m.name}: ${m.where}`,
      objectNames: m.objectNames ?? [], objectIds: [],
      ...(goal.skill !== step.followsMethod ? { npcNames: [], npcIds: [] } : {}),
      highlightItems: itemsRequired.map((i) => i.nameEn),
    } } : {}),
  };
}
