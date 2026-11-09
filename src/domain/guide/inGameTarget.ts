// What the RuneLite plugin shows for a step (guide panel, quest stages, in-game target, auto-completion), built from the shared engines.
import type { Progress, Step, StepBranch } from '../../types';
import { isClosed } from '../quests/next-step';
import { parseAmount } from '../items/checklist';
import { preflightItems } from '../prep/stepItems';
import { nameKey } from '../items/itemKey';
import { watchedItems } from '../quests/branching';
import { methodToolNames } from '../training/methodStep';
import { routeTrigger } from '../prep/carryover';
import { alternativesOf, toolFamilyOf } from '../items/toolTiers';
import { doseKind, doseNames } from '../items/doseKind';
import { stepMaxHit } from '../combat/foodAdvice';
import { npcSpot, stepPlaces } from '../travel/stepPlaces';
import { shortLine } from '../quests/shortText';
import { BANK_SPOTS } from '../readiness/preflight';
import type { ActiveStepPayload, StepGuidePayload, StagePayload } from '../../services/runeliteBridge';

/** The RuneLite panel: the step's items with "where to get" and the points — the main one (NPC, start) and places from the step map. */
export function stepGuide(step: Step, branch?: StepBranch): StepGuidePayload {
  const items = (step.itemsRequired ?? []).map((i) => {
    const n = parseAmount(i.amount);
    const dose = doseKind(i.nameEn);
    return {
      name: i.nameEn,
      ...(i.wikiItemId !== undefined ? { id: i.wikiItemId } : {}),
      ...(n !== null ? { count: n } : {}),
      // A potion: the game counts doses of every size toward it (StepGuide.item), so a (3) and a (1) are 4 of a "Strength potion(4)".
      ...(dose ? { doses: (n ?? 1) * dose.per } : {}),
      ...(i.howToGet ? { where: i.howToGet } : {}),
      ...(i.inStep ? { inStep: true } : {}),
      ...(alternativesOf(i.nameEn, i.anyOf).length ? { alt: alternativesOf(i.nameEn, i.anyOf) } : {}),
    };
  });
  // The places are the same as the points on the step map in the app: the step point, places from the map, where items come from, quest NPCs.
  const places: StepGuidePayload['places'] = stepPlaces(step, branch).map((p) => ({
    x: p.x, y: p.y, plane: p.plane, label: p.label, ...(p.npc ? { npc: p.npc } : {}), ...(p.items?.length ? { items: p.items } : {}),
  }));
  // Always sent, even if empty: without guide the plugin considers the app old and asks to update it
  // (in 2.10 steps without items and with one point went without it — the panel wrote "Update the app" for nothing).
  // A training plan joins its parts with "Then: " for the app's numbered list; the game labels the last one "Next: " itself, so the joiner
  // is dropped here ("Next: Then: fight the Hill Giants…" in the card, 2.72.1).
  const all = (step.quickSteps ?? []).filter((q) => q.length > 0 && q.length <= 500).map((q) => q.replace(/^Then: ([^ ])/, (_m, c: string) => c.toUpperCase()));
  // The plugin shows the last item as "Next", and for a quest without stage data (Shield of Arrav) the whole list is its walkthrough in the game:
  // a cut in the middle would lose instructions. Forty lines is the plugin's own limit for one stage; beyond it the first thirty-nine and the last.
  const steps = all.length > 40 ? [...all.slice(0, 39), all[all.length - 1]] : all;
  const stage = stagePayload(step, places);
  return { items: items.slice(0, 64), places: places.slice(0, 64), ...(steps.length ? { steps } : {}), ...(stage ? { stage } : {}) };
}
const near = (a: { x: number; y: number; plane: number }, b: { x: number; y: number; plane: number }) =>
  a.plane === b.plane && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
/**
 * Quest stages for the game. A stage point (an NPC by name or explicit) goes into places — the same "Where to go" row that the
 * arrow and Shortest Path already know how to lead to; the stage refers to it by number. An unknown NPC — a stage without a point.
 */
/** A short row text for the game: the ready s from the data, otherwise an abbreviation; not sent if it is not shorter than the full one. */
function shortOf(l: { t: string; s?: string }): { s?: string } {
  const short = l.s?.trim() || shortLine(l.t);
  return short && short !== l.t ? { s: short } : {};
}
export function stagePayload(step: Step, places: StepGuidePayload['places']): StagePayload | undefined {
  const qs = step.questStages;
  if (!qs || !qs.stages.length) return undefined;
  const stages: StagePayload['stages'] = [];
  for (const st of [...qs.stages].sort((a, b) => a.at - b.at).slice(0, 40)) {
    let go: number | undefined;
    if (st.go) {
      let p: StepGuidePayload['places'][number] | undefined;
      if (typeof st.go === 'string') {
        const n = npcSpot(st.go, step.id);
        if (n) p = { x: n.x, y: n.y, plane: n.plane, label: `${st.go} — ${n.area}`, npc: st.go };
      } else {
        p = { x: st.go.x, y: st.go.y, plane: st.go.plane, label: st.go.label, ...(st.go.npc ? { npc: st.go.npc } : {}) };
      }
      if (p) {
        let at = places.findIndex((q) => near(q, p!));
        if (at >= 0) {
          if (p.npc && !places[at].npc) places[at] = { ...places[at], npc: p.npc };
        } else if (places.length < 64) {
          places.push(p);
          at = places.length - 1;
        }
        if (at >= 0) go = at;
      }
    }
    stages.push({
      at: st.at, steps: st.do.slice(0, 40).map((l) => ({ t: l.t, ...shortOf(l), ...(l.at ? { x: l.at[0], y: l.at[1], plane: l.at[2] } : {}), ...(l.has ? { has: l.has } : {}), ...(l.need ? { need: l.need } : {}), ...(l.hl ? { hl: l.hl } : {}), ...(l.k ? { k: l.k } : {}), ...(l.pre?.length ? { pre: l.pre.slice(0, 8) } : {}), ...(l.mh ? { mh: l.mh } : {}) })), ...(go !== undefined ? { go } : {}),
      ...(st.items ? { items: st.items.slice(0, 12).map((i) => ({ ...i })) } : {}),
    });
  }
  const guarded = stages.some((s) => s.steps.some((l) => l.pre));
  return { kind: qs.var[0], id: qs.var[1], stages, ...(guarded ? { banks: BANK_SPOTS.slice(0, 40) } : {}) };
}
/** The plugin refuses a longer watch list (ActiveTarget.MAX_LIST). */
export const WATCH_MAX = 64;
/**
 * The step target for the game. An explicit inGame from the route wins; without it — the start point and the gathering places from the step map,
 * so the arrow and tiles work for steps whose highlight is not yet written out.
 * branch — the chosen quick variant: its point replaces the step point, and the waypoints of the ordinary path are not needed.
 * travelWatch — the things the ways to the step need (runes, a teleport item, an axe): counted by the game like the step's own items.
 */
export function toInGameTarget(step: Step, branch?: StepBranch, extraWatch: string[] = [], travelWatch: string[] = []): ActiveStepPayload | null {
  const g = step.inGame ?? {};
  const start = step.mapLocation;
  const alt = branch?.replacementTarget;
  const worldPoint = alt
    ? { x: alt.x, y: alt.y, plane: alt.plane, label: alt.label }
    : g.worldPoint ?? (start ? { x: start.x, y: start.y, plane: start.plane, label: start.label } : undefined);
  const groundTiles = g.groundTiles ?? step.resourceSpots?.map((p) => ({ x: p.x, y: p.y, plane: p.plane, label: p.label }));
  const payload: ActiveStepPayload = { ...g, stepId: step.id, title: step.title };
  // What the step keeps for a later one goes on top of the game trigger: the quest is green but the route is not ready (lib/carryover.ts).
  const trigger = routeTrigger(step);
  if (trigger) payload.completionTrigger = trigger;
  if (worldPoint) payload.worldPoint = worldPoint;
  if (groundTiles?.length) payload.groundTiles = groundTiles;
  if (alt) delete payload.pathWaypoints;
  const goal = alt ? (alt.label.startsWith(branch!.label) ? alt.label : `${branch!.label}: ${alt.label}`) : g.goal ?? worldPoint?.label;
  if (goal) payload.goal = goal;
  const checklist = preflightItems(step).map((i) => ({
    ...(i.equip ? { equip: true } : {}),
    name: i.nameEn, id: i.id, count: i.count, heals: i.heals, ...(i.alt?.length ? { alt: i.alt } : {}), ...(i.doses !== undefined ? { doses: i.doses } : {}),
  }));
  if (checklist.length) payload.checklist = checklist;
  // Also — the items of the nearest steps (one trip): the plugin reports how many of them there are, and they are visible in advance.
  // A tool named by its weakest tier is any tier: the game must report every tier, or a Rune pickaxe in the bag would read as "no pickaxe".
  // The alternatives of a required item (S4-01's food: Trout, Tuna... besides Salmon) are counted too: unread, they would make "short" unknown.
  const alternatives = (step.itemsRequired ?? []).flatMap((i) => (i.inStep ? [] : i.anyOf ?? []));
  // A potion is counted in doses of every size: the game must report all four, or a (3) in the bag would read as "no potion" (doses.ts).
  const potions = [...(step.itemsRequired ?? []), ...(step.itemsRecommended ?? [])].filter((i) => doseKind(i.nameEn)).map((i) => i.nameEn);
  const optionalFood = (step.itemsRecommended ?? []).filter(item => item.heals);
  const foodGuards = step.questStages?.stages.flatMap(stage => stage.do.flatMap(line => (line.pre ?? [])
    .filter(pre => optionalFood.some(food => nameKey(food.nameEn) === nameKey(pre.item)))
    .flatMap(pre => [pre.item, ...(pre.alt ?? [])]))) ?? [];
  const goalWatch = (step.goalItemsRequired ?? []).filter(i => !i.inStep);
  const named = [...watchedItems(step), ...alternatives, ...methodToolNames(step), ...extraWatch, ...potions,
    ...goalWatch.map(i => i.nameEn), ...goalWatch.flatMap(i => i.anyOf ?? []),
    ...optionalFood.flatMap(food => [food.nameEn, ...(food.anyOf ?? [])]), ...foodGuards];
  const own = [...new Set([...named, ...named.flatMap((n) => toolFamilyOf(n) ?? doseNames(n))])].slice(0, 40);
  // And what the ways there need (runes, a teleport item, an axe): the game reports how many the bank holds, so "withdraw it" is said only for what is there.
  // They go after the step's own items and never push one out.
  const watch = [...new Set([...own, ...travelWatch])].slice(0, WATCH_MAX);
  if (watch.length) payload.watchItems = watch;
  if (step.pacing) payload.pacing = step.pacing;
  const hit = stepMaxHit(step);
  if (hit) payload.maxHit = hit;
  if (step.useOn?.length) payload.useOn = step.useOn.slice(0, 8);
  const guide = stepGuide(step, branch);
  payload.guide = guide;
  // A step without a point but with items (a shopping step) goes to the game too: the "What you need" list with "where to get" is useful there.
  const empty = !worldPoint && !groundTiles?.length && !g.npcNames?.length && !g.objectNames?.length
    && !g.dialogChoices?.length && !g.highlightItems?.length && !g.completionTrigger && !checklist.length && !step.pacing
    && !guide.items.length && !guide.places.length;
  return empty ? null : payload;
}
// ---------- Auto-completion ----------
/** Whether a STEP_AUTO_COMPLETED event marks its step done: not a repeat (handled), a known open step. It confirms this
 * milestone only; what the game shows next is the committed Decision's (app/sync/DecisionSync), never route order. */
export function autoCompletes(steps: readonly Step[], p: Progress, stepId: string, handled: ReadonlySet<string>): boolean {
  return !handled.has(stepId) && steps.some(s => s.id === stepId) && !isClosed(p, stepId);
}
