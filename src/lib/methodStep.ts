// A skill step that follows the training method (Step.followsMethod): what the step asks for and where the arrow goes are those of the method the
// app recommends for the player's real level ("What to train with"), not a fixed list. The route's fixed list for a long climb (Fishing 1-50) was
// the lobster pot and the harpoon, which a level-1 player does not need, and the "any tool counts" fix of 2.54.2 let a harpoon stand in for a net.
//
// Pure data here: the pick itself (which method, from the level, the mode, the style and what is carried) is lib/methodPick.ts and is stored by
// the provider that owns the player state; the store applies it to the steps, so every screen, the readiness engine and the plugin payload
// see the same requirements. A level that is unknown keeps the step's own list: nothing is guessed.

import type { MapLocation, Step, StepItemRequirement } from '../types';
import methodsJson from '../data/trainingMethods.json';
import processingJson from '../data/processing.json';
import type { ProcessingRegistry } from './processingRates';
import { items as itemData } from '../data';
import { matchStrict } from '../services/locationResolver';
import { AXES, PICKAXES } from './toolTiers';
import type { MethodNeed } from './trainingRouter';
import { RANGED_WATCH } from './rangedLoadout';
import { STRIKE_WATCH, SUPERHEAT_WATCH } from './magicPlan';
import { f2pAdviceFor } from './f2pSkillAdvice';
import { healsOf } from './combatEstimate';

/** The stored pick when the skill's goal is already reached: no tool of that skill is asked for. */
export const GOAL_REACHED = 'goal-reached';
export const UNKNOWN_GOAL_PREFIX = 'goal-unknown:';
/** Resolved supplies travel with the method pick, as combat/food projections already do; the store never rebuilds a loadout from stale state. */
/** A picked method: its id, or with what the player needs for it, a name for this player, and the spot the gathering engine chose (methodRates.ts). */
export type TrainingPick = string | {
  methodId: string; untilLevel?: number; goalNeeds?: MethodNeed[]; needs: MethodNeed[]; name?: string; where?: string; warning?: string;
  /** The spot the engine picked; waypoints - the way in of a spot under the ground, entrance first. */
  spot?: { label: string; x: number; y: number; plane: number; waypoints?: { x: number; y: number; plane: number; label?: string }[] };
  /** The step's next skill trained on the same catches at a station beside the spot (fish cooked on the fire there), and what is done with them. */
  along?: { skill: string; station: { label: string; x: number; y: number; plane: number }; products: string[]; how: 'bank' | 'drop' };
};

/** The method a pick names, whatever its form. */
export const pickedMethodId = (pick: TrainingPick): string => (typeof pick === 'string' ? pick : pick.methodId);

interface RawMethod { id: string; skills: string[]; name: string; from: number; to: number | null; needs?: MethodNeed[]; place?: string; objectNames?: string[]; npcNames?: string[]; where: string; note?: string }

const RAW: RawMethod[] = (methodsJson as unknown as { methods: (Omit<RawMethod, 'skills'> & { skill: string | string[] })[] }).methods
  .map((m) => ({ ...m, skills: Array.isArray(m.skill) ? m.skill : [m.skill] }));
const METHODS = new Map(RAW.map((m) => [m.id, m]));
const PROCESSING = processingJson as unknown as ProcessingRegistry;
const RECIPES = new Map(PROCESSING.recipes.map(r => [r.id, r]));
const ITEMS = new Map(itemData.map((i) => [i.nameEn.toLowerCase(), i]));

function needNames(need: MethodNeed): readonly string[] {
  if (need.type === 'item') return [need.name, ...need.anyOf ?? []];
  if (need.type === 'tool') return need.skill === 'mining' ? PICKAXES : AXES;
  return [];
}

/** The skill and the level the step's own completion check asks for, or null when the step has no such goal. */
export function followedGoal(step: Pick<Step, 'followsMethod' | 'inGame' | 'bondBranch'>): { skill: string; target: number } | null {
  const skill = step.followsMethod;
  const trig = step.inGame?.completionTrigger;
  if (!skill || trig?.type !== 'SKILL_LEVEL') return null;
  const row = trig.levels?.find((l) => l.skill === skill);
  return row ? { skill, target: row.level } : null;
}

/** One ordered set of goals from the unchanged completion trigger; the declared primary skill goes first. */
export function followedGoals(step: Pick<Step, 'followsMethod' | 'inGame' | 'bondBranch'>): { skill: string; target: number }[] {
  const primary = followedGoal(step);
  const trigger = step.inGame?.completionTrigger;
  if (!primary || trigger?.type !== 'SKILL_LEVEL') return [];
  return [primary, ...(trigger.levels ?? []).filter(g => g.skill !== primary.skill).map(g => ({ skill: g.skill, target: g.level }))];
}

/** Every tool any method of the followed skill asks for. The game must report all of them, not only the picked method's: an item that is not
 * tracked reads as unknown, which ranks a method as ready, so the pick would flip between two methods forever. */
export function methodToolNames(step: Pick<Step, 'followsMethod' | 'inGame' | 'bondBranch'>): string[] {
  const goals = followedGoals(step);
  const skills = goals.length ? goals.map(g => g.skill) : step.followsMethod ? [step.followsMethod] : [];
  if (!skills.length) return [];
  const names = new Set<string>();
  if (skills.includes('ranged')) for (const name of RANGED_WATCH) names.add(name);
  if (skills.includes('magic')) for (const name of SUPERHEAT_WATCH) names.add(name);
  if (skills.includes('magic')) for (const name of STRIKE_WATCH) names.add(name);
  for (const m of RAW) if (m.skills.some(skill => skills.includes(skill))) {
    for (const need of m.needs ?? []) for (const name of needNames(need)) names.add(name);
    // Model-selected recipes can declare supplies absent from the broad catalogue row.
    for (const id of PROCESSING.methods[m.id] ?? []) {
      const r = RECIPES.get(id);
      if (!r || (step.bondBranch && r.members)) continue;
      for (const name of [...r.tools, ...r.inputs.flatMap(i => [i.name, ...(i.anyOf ?? []), ...(i.staff ? [i.staff] : [])]), ...(r.access ? [r.access.carried, r.access.equipped] : [])]) names.add(name);
    }
  }
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
    ...(n.type === 'item' && n.equip ? { equip: true } : {}),
    ...(healsOf(name) !== null ? { heals: healsOf(name)! } : {}),
  };
}

/** The label of a method's point, one rule for the catalogue place and the spot an engine picked: "Cooking: Tuna — Barbarian Village fire". */
const pointLabel = (m: { name: string; skills: readonly string[] }, place: string) => `${m.skills.includes('cooking') ? 'Cooking: ' : ''}${m.name} — ${place}`;

/** The place of a method as a step point, from the place dictionary only (no guessing from the text); null when it has none. */
export function methodPoint(methodId: string): MapLocation | null {
  const m = METHODS.get(methodId);
  const p = m?.place ? matchStrict(m.place) : null;
  return m && p ? { x: p.x, y: p.y, plane: p.plane, label: pointLabel(m, p.label) } : null;
}

/**
 * The step as the player needs it now: the tools of the picked method, its place, and its tools to highlight in the game. A step without
 * followsMethod, no pick, or a pick that names no known method comes back unchanged (the same object).
 */
export function withTrainingMethod(step: Step, pick: TrainingPick | undefined): Step {
  if (!step.followsMethod || !pick) return step;
  const id = pickedMethodId(pick);
  if (id.startsWith(UNKNOWN_GOAL_PREFIX)) {
    const skill = id.slice(UNKNOWN_GOAL_PREFIX.length);
    if (!followedGoals(step).some(g => g.skill === skill)) return step;
    const message = `Check your ${skill} level in RuneLite or Skills before choosing its training method.`;
    return { ...step, goalItemsRequired: undefined, followsMethod: skill, itemsRequired: [], itemsRecommended: [], mapLocation: undefined, resourceSpots: [],
      requirements: [...step.requirements ?? [], { type: 'skill', skill, min: 1 }],
      warning: message, how: message, where: 'Training level not checked', quickSteps: [message], pacing: undefined, foes: undefined, threats: undefined,
      ...(step.inGame ? { inGame: { ...step.inGame, worldPoint: undefined, groundTiles: [], pathWaypoints: undefined,
        npcNames: [], npcIds: [], objectNames: [], objectIds: [], highlightItems: [], goal: message } } : {}),
    };
  }
  if (id === GOAL_REACHED) {
    return { ...step, goalItemsRequired: undefined, itemsRequired: [], itemsRecommended: [], mapLocation: undefined, resourceSpots: [],
      ...(step.inGame ? { inGame: { ...step.inGame, worldPoint: undefined, groundTiles: [], pathWaypoints: undefined,
        npcNames: [], npcIds: [], objectNames: [], objectIds: [], highlightItems: [], goal: 'Training goals reached' } } : {}),
    };
  }
  const raw = METHODS.get(id);
  const m = raw && typeof pick !== 'string' ? { ...raw, ...(pick.name ? { name: pick.name } : {}), ...(pick.where ? { where: pick.where } : {}) } : raw;
  const goals = followedGoals(step);
  const goal = goals.find(g => m?.skills.includes(g.skill));
  if (!m || !goal) return step;
  const phaseTarget = typeof pick === 'object' && pick.untilLevel !== undefined ? Math.min(goal.target, pick.untilLevel) : goal.target;
  const equipmentHint = step.bondBranch ? f2pAdviceFor(goal.skill)?.equipment : undefined;
  const needs = typeof pick === 'string' ? m.needs ?? [] : pick.needs;
  const gates = needs.filter((n): n is Extract<MethodNeed, { type: 'skill' | 'quest' }> => n.type === 'skill' || n.type === 'quest');
  const requirements = [...(step.requirements ?? []).filter(r => r.type !== 'skill' || !gates.some(n => n.type === 'skill' && n.skill === r.skill && n.min >= r.min)), ...gates];
  const itemsRequired = needs.map((n) => requirement(n, m)).filter((r): r is StepItemRequirement => r !== null);
  const chosen = typeof pick !== 'string' ? pick.spot : undefined;
  const along = typeof pick !== 'string' ? pick.along : undefined;
  // One line for the station beside the spot: the catches are processed there before they are banked or dropped.
  const alongLine = along ? `${along.skill === 'cooking' ? 'Cook' : 'Make'} the ${along.products.join(' and ').toLowerCase()} on the ${along.station.label} beside the spot, then ${along.how === 'bank' ? 'bank them' : 'drop them'}: ${along.skill} trains at the same time.` : null;
  const at = chosen ? { x: chosen.x, y: chosen.y, plane: chosen.plane, label: pointLabel(m, chosen.label) } : methodPoint(id);
  return {
    ...step,
    goalItemsRequired: typeof pick !== 'string' && pick.goalNeeds ? pick.goalNeeds.map(n => requirement(n, m)).filter((r): r is StepItemRequirement => r !== null)
      .map(r => ({ ...r, howToGet: 'For the remaining staged training goal (estimate); future preparation may change.' })) : undefined,
    followsMethod: goal.skill,
    ...(equipmentHint ? { fields: [...(step.fields ?? []).filter(f => f.label !== 'Equipment'), { label: 'Equipment', text: equipmentHint }] } : {}),
    itemsRequired,
    requirements,
    ...(goal.skill !== step.followsMethod || goal.skill === 'mining' || goal.skill === 'woodcutting' || goal.skill === 'ranged' || goal.skill === 'magic' ? {
      itemsRecommended: [], foes: undefined, threats: undefined, pacing: undefined,
      where: m.where, how: `Train ${goal.skill} to ${phaseTarget}: ${m.name}. ${m.note ?? ''}`.trim(),
      quickSteps: ['Bank finished-skill tools and surplus supplies before withdrawing the current batch.', `Prepare the listed supplies for ${m.name}.`, `Train ${goal.skill} to ${phaseTarget} at ${m.where}. ${m.note ?? ''}`.trim()],
    } : {}),
    ...(alongLine ? { quickSteps: [...(goal.skill !== step.followsMethod || goal.skill === 'mining' || goal.skill === 'woodcutting' ? [] : step.quickSteps ?? []), alongLine] } : {}),
    // The engine's one safety line for its spot (aggressive NPCs that attack this player) joins the step's own warning.
    ...(typeof pick !== 'string' && pick.warning ? { warning: [step.warning, pick.warning].filter(Boolean).join(' ') } : {}),
    // The static climb contains future places. Once a method is selected, map and plugin use only its point.
    mapLocation: at ?? undefined, resourceSpots: at ? [at] : [],
    ...(step.inGame ? { inGame: {
      ...step.inGame,
      worldPoint: at ?? undefined, groundTiles: at ? [at] : [], pathWaypoints: chosen?.waypoints?.length ? chosen.waypoints.map((p) => ({ x: p.x, y: p.y, plane: p.plane })) : undefined,
      goal: at?.label ?? `${m.name}: ${m.where}`,
      objectNames: [...m.objectNames ?? [], ...(along ? ['Fire'] : [])], objectIds: [],
      ...(m.npcNames || goal.skill !== step.followsMethod || goal.skill === 'ranged' || goal.skill === 'magic' ? { npcNames: m.npcNames ?? [], npcIds: [] } : {}),
      highlightItems: itemsRequired.map((i) => i.nameEn),
    } } : {}),
  };
}
