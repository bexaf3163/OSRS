import type { CandidateRow, CommittedDecision,CostExpression, ExpectedEffect, Minutes, ObjectiveEvaluation, PlannerModel, PlanningSnapshot, Projection } from './contracts';
import { comparableKnown, exactCost, noTime, sumExpressions, sumMinutes, totalCost, validActionCost, validExpression, validMinutes } from './cost';
import { coherentSkillXp, levelForXp, xpForLevel } from '../player/xp';
import { observedResources, projectResources } from './resources';
import { nameKey } from '../items/itemKey';
import { sameSession } from './scope';

/** How many objectives look one quest further (beam width of the second horizon). */
const BEAM = 4;
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** The parts of an objective's time (Evaluation.cost) in the player's words. */
const PART_WORDS: Readonly<Record<string, string>> = { prepare: 'preparation', work: 'quest work', travel: 'travel', banking: 'banking', exchange: 'Grand Exchange', switching: 'switching' };

export function observedProjection(snapshot: PlanningSnapshot): Projection {
  const levels = Object.fromEntries(Object.entries(snapshot.player.levels).flatMap(([id, value]) => value.known
    && Number.isInteger(value.value) && value.value >= 1 && value.value <= 99 ? [[id, value.value]] : []));
  const xp = Object.fromEntries(Object.entries(snapshot.xp).flatMap(([id, xp]) => xp.known && coherentSkillXp(xp.value,
    snapshot.player.levels[id]?.known ? snapshot.player.levels[id].value : undefined) ? [[id, xp.value]] : []));
  const xpBounds = { ...Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { min: xpForLevel(level), max: level === 99 ? 200_000_000 : xpForLevel(level + 1) - 1 }])),
    ...Object.fromEntries(Object.entries(xp).map(([id, value]) => [id, { min: value, max: value }])) };
  return { scope: { ...snapshot.scope }, completed: new Set(Object.entries(snapshot.quests).filter(([, q]) => q.state === 'COMPLETED').map(([id]) => id)),
    xp, levels, xpBounds, unlocks: new Set(), resources: observedResources(snapshot) };
}
/** Hypothetical balances belong only to search. No effect writes observed PlayerState or executable money/ownership evidence. */
export function projectSuccess(before: Projection, effects: readonly ExpectedEffect[]): Projection {
  if (before.invalidResources) return before;
  const quests = effects.filter(effect => effect.kind === 'quest');
  if (quests.length && quests.every(effect => before.completed.has(effect.questId))) return before;
  const completed = new Set(before.completed), unlocks = new Set(before.unlocks), xp = { ...before.xp }, levels = { ...before.levels }, xpBounds = { ...before.xpBounds };
  for (const effect of effects) {
    if (effect.kind === 'quest') completed.add(effect.questId);
    if (effect.kind === 'unlock') unlocks.add(effect.id);
    if (effect.kind === 'xp' && Number.isSafeInteger(effect.amount) && effect.amount >= 0 && effect.amount <= 200_000_000) {
      if (xp[effect.skill] !== undefined) xp[effect.skill] = Math.min(200_000_000, xp[effect.skill] + effect.amount);
      const bound = xpBounds[effect.skill];
      if (bound) {
        xpBounds[effect.skill] = { min: Math.min(200_000_000, bound.min + effect.amount), max: Math.min(200_000_000, bound.max + effect.amount) };
        levels[effect.skill] = Math.max(levels[effect.skill] ?? 0, levelForXp(xpBounds[effect.skill].min));
      }
    }
    if (effect.kind === 'skill-floor' && Number.isInteger(effect.level) && effect.level >= 1 && effect.level <= 99) {
      const floor = xpForLevel(effect.level), bound = xpBounds[effect.skill];
      const prior = bound?.min ?? xp[effect.skill] ?? (levels[effect.skill] === undefined ? undefined : xpForLevel(levels[effect.skill]));
      levels[effect.skill] = Math.max(levels[effect.skill] ?? 0, effect.level);
      if (prior === undefined || prior < floor) {
        // A final training action may overshoot the level. A guaranteed floor is not an exact future XP balance.
        delete xp[effect.skill];
        xpBounds[effect.skill] = { min: floor, max: 200_000_000 };
      }
    }
  }
  const changes = effects.filter(effect => effect.kind === 'resources' || effect.kind === 'resources-unknown');
  let resources = before.resources;
  for (const effect of changes) {
    if (!resources) break;
    if (effect.kind === 'resources') {
      const next = projectResources(resources, [effect.change]);
      resources = next ?? undefined;
    } else if (effect.source.trim()) {
      // An unmodelled fight, quest or training wears out no single worn piece, so it stays a lower bound unless the objective
      // names it (it may be handed in). Worn stacks (arrows, darts) can be spent and retire with everything else.
      // shortcut: a stack of exactly one counts as a piece; replace with stackability from the item data if one is ever planned.
      const named = new Set((effect.items ?? []).map(nameKey));
      const worn = Object.fromEntries(Object.entries(resources.worn ?? {}).filter(([key, count]) => count === 1 && !named.has(key)));
      resources = { items: Object.fromEntries(Object.keys(resources.items).map(name => [name, { floor: worn[name] ?? 0, complete: false }])),
        gp: { floor: 0, complete: false }, position: null, worn };
    } else resources = undefined;
  }
  return { ...before, completed, xp, levels, xpBounds, unlocks, ...(resources ? { resources } : {}),
    ...(changes.length && !resources ? { invalidResources: true } : {}) };
}
function usable(snapshot: PlanningSnapshot, value: ObjectiveEvaluation): boolean {
  const action = value.activeAction;
  if (action.goalId !== value.objectiveId || !action.id.trim() || !action.title.trim() || !action.sourceIds.some(source => source.trim())
    || !action.completionEvidence.length || (action.time !== null && !validMinutes(action.time))) return false;
  const evidence = [...action.completionEvidence, ...action.prerequisites.flatMap(requirement => requirement.evidence)];
  if (evidence.some(row => row.snapshotRevision !== snapshot.scope.snapshotRevision || !row.source.trim() || !row.predicate.trim())) return false;
  if (action.gpCost && (!Number.isFinite(action.gpCost.amount) || action.gpCost.amount < 0 || !action.gpCost.source.trim())) return false;
  if (!validActionCost(value.cost) || value.hardBlocked || action.feasibility === 'BLOCKED') return false;
  if (value.comparisonCost && !validExpression(value.comparisonCost)) return false;
  if (action.kind !== 'VERIFY' && action.kind !== 'MANUAL_WAIT' && action.feasibility !== 'READY') return false;
  return action.kind === 'VERIFY' || action.kind === 'MANUAL_WAIT' || action.prerequisites.every(req => !req.hard || req.state === 'met');
}

export interface DecisionOptions {
  previous?: CommittedDecision | null;
  /** An explicit owner goal, not the current page or an old plugin destination. */
  lockedObjectiveId?: string | null;
  switchThreshold?: number;
}

interface Estimate { estimate: Minutes | null; expression: CostExpression | null }
function compareEstimates(a: Estimate, b: Estimate): number {
  if (a.estimate && b.estimate) return a.estimate.typical - b.estimate.typical;
  if (a.estimate || b.estimate) return a.estimate ? -1 : 1;
  if (comparableKnown(a.expression, b.expression)) return a.expression!.known.typical - b.expression!.known.typical;
  // Different unknown terms are not a time comparison. Never order by the text of those terms (2.82.0 put every quest
  // with an unknown preparation first because "prepare:" sorts before "preparation:"): fewer unknown terms first, then
  // the lower known minimum; decide() names the rows this leaves uncompared, and the caller's ID is the last tie-break.
  const unknowns = (e: Estimate) => e.expression?.unresolved.length ?? Number.MAX_SAFE_INTEGER;
  const floor = (e: Estimate) => e.expression?.known.typical ?? Number.MAX_SAFE_INTEGER;
  return unknowns(a) - unknowns(b) || floor(a) - floor(b);
}

/** Equal totals (both orders finish the same quests): the option whose own time is known and shorter goes first. */
function ownCost(value: ObjectiveEvaluation): [number, number] {
  const parts = Object.values(value.cost);
  return [parts.filter(m => !validMinutes(m)).length, parts.reduce((n, m) => n + (validMinutes(m) ? m.typical : 0), 0)];
}
function compareOwn(a: ObjectiveEvaluation, b: ObjectiveEvaluation): number {
  const [ua, ka] = ownCost(a), [ub, kb] = ownCost(b);
  return ua - ub || ka - kb;
}

/** Two quest horizons; a bounded shortlist avoids a graph search on every observation. */
export function decide(snapshot: PlanningSnapshot, model: PlannerModel, options: DecisionOptions = {}): CommittedDecision | null {
  const projection = observedProjection(snapshot);
  const ids = [...new Set(model.objectiveIds)].sort().filter(id => !projection.completed.has(id));
  if (options.lockedObjectiveId && !projection.completed.has(options.lockedObjectiveId) && !ids.includes(options.lockedObjectiveId)) return null;
  const constrained = options.lockedObjectiveId && ids.includes(options.lockedObjectiveId)
    ? new Set(model.prerequisitesFor?.(options.lockedObjectiveId, projection) ?? [options.lockedObjectiveId]) : null;
  const evaluated = ids.filter(id => !constrained || constrained.has(id)).map(id => model.evaluate(id, projection)).filter((v): v is ObjectiveEvaluation => !!v && usable(snapshot, v));
  const scored = evaluated.flatMap(value => {
    const cost = totalCost(value.cost);
    // VERIFY and WAIT have no simulated success: they cannot receive speculative quest XP credit.
    const executable = value.activeAction.kind !== 'VERIFY' && value.activeAction.kind !== 'MANUAL_WAIT';
    const after = executable ? projectSuccess(projection, value.effects) : projection;
    if (after.invalidResources) return [];
    const future = executable ? model.remaining(after) : model.remaining(projection);
    const costExpression = value.comparisonCost ?? exactCost(cost);
    const futureExpression = model.remainingExpression?.(executable ? after : projection) ?? exactCost(future);
    const followingObjectiveId: string | undefined = undefined;
    return [{ value, estimate: sumMinutes([cost, future]), expression: sumExpressions([costExpression, futureExpression]), followingObjectiveId,
      after: executable ? after : null, cost, costExpression }];
  });
  // Beam search (brief 08): the second horizon re-estimates the whole remaining route once per pair, so only the best few
  // executable objectives, the running one and an owner lock look one quest further; the rest keep their one-step estimate.
  const beam = new Set(scored.filter(row => row.after).sort((a, b) => compareEstimates(a, b) || compareOwn(a.value, b.value)).slice(0, BEAM).map(row => row.value.objectiveId));
  for (const id of [options.previous?.objectiveId, options.lockedObjectiveId]) if (id) beam.add(id);
  for (const row of scored) {
    const { value, after, cost, costExpression } = row;
    if (!after || !beam.has(value.objectiveId)) continue;
    // The second horizon handles cross-quest reward ordering; terminal remaining() owns joint accounting.
    const nextFrontier = options.lockedObjectiveId && !after.completed.has(options.lockedObjectiveId)
      ? new Set(model.prerequisitesFor?.(options.lockedObjectiveId, after) ?? [options.lockedObjectiveId]) : null;
    const next = ids.filter(id => id !== value.objectiveId && !after.completed.has(id) && (!nextFrontier || nextFrontier.has(id))).map(id => model.evaluate(id, after))
      .filter((v): v is ObjectiveEvaluation => !!v && usable(snapshot, v) && v.activeAction.kind !== 'VERIFY' && v.activeAction.kind !== 'MANUAL_WAIT')
      .sort((x, y) => (totalCost(x.cost)?.typical ?? Infinity) - (totalCost(y.cost)?.typical ?? Infinity) || compareId(x.objectiveId, y.objectiveId)).slice(0, 6);
    const horizons = next.flatMap(second => {
      const future = projectSuccess(after, second.effects);
      if (future.invalidResources) return [];
      const rest = model.remaining(future), secondCost = totalCost(second.cost);
      return [{ followingObjectiveId: second.objectiveId, estimate: sumMinutes([cost, secondCost, rest]), expression: sumExpressions([costExpression,
        second.comparisonCost ?? exactCost(secondCost), model.remainingExpression?.(future) ?? exactCost(rest)]) }];
    }).filter(h => h.estimate || h.expression).sort(compareEstimates);
    if (horizons.length) Object.assign(row, horizons[0]);
  }
  if (constrained && !scored.length) return null;
  // Reliable executable work outranks an unrelated unknown/partner check. Explicit locks can still request a check.
  const priority = (v: ObjectiveEvaluation) => v.activeAction.kind === 'MANUAL_WAIT' ? 2 : v.activeAction.kind === 'VERIFY' ? 1 : 0;
  scored.sort((a, b) => priority(a.value) - priority(b.value) || compareEstimates(a, b)
    || compareOwn(a.value, b.value) || compareId(a.value.objectiveId, b.value.objectiveId));
  let chosen = scored.find(row => row.value.objectiveId === options.lockedObjectiveId) ?? scored[0];
  if (!chosen) return null;
  const previous = options.previous;
  const incumbent = previous && sameSession(snapshot.scope, previous) ? scored.find(row => row.value.objectiveId === previous.objectiveId) : null;
  const threshold = Math.min(.5, Math.max(0, options.switchThreshold ?? .12));
  const begun = incumbent && snapshot.quests[incumbent.value.objectiveId]?.state === 'IN_PROGRESS';
  const sharedUnknowns = incumbent && comparableKnown(incumbent.expression, chosen.expression);
  const incumbentMinutes = incumbent?.estimate ?? (sharedUnknowns ? incumbent.expression!.known : null);
  const chosenMinutes = chosen.estimate ?? (sharedUnknowns ? chosen.expression!.known : null);
  // Only a proven, material saving replaces the running objective: an unknown time proves nothing, so two objectives that cannot be
  // compared never trade places on every observation (an equip, a bank read).
  const provablyFaster = !!(incumbentMinutes && chosenMinutes && chosenMinutes.typical < incumbentMinutes.typical * (1 - threshold));
  if (!options.lockedObjectiveId && incumbent && priority(incumbent.value) <= priority(chosen.value) && (begun || !provablyFaster)) chosen = incumbent;
  const { value, estimate } = chosen;
  const comparableUnmeasured = !estimate && scored.some(row => row !== chosen && comparableKnown(row.expression, chosen.expression));
  // A feasible objective whose time cannot be compared is never dropped silently: when even its known part is below the
  // choice it leads the alternatives, the reasons name it and confidence falls to LOW.
  const bound = estimate?.typical ?? chosen.expression?.known.typical ?? Infinity;
  const unranked = scored.filter(row => row !== chosen && priority(row.value) === priority(chosen.value)
    && !(row.estimate && estimate) && !comparableKnown(row.expression, chosen.expression) && (row.expression?.known.fast ?? 0) < bound);
  const ordered = [chosen, ...scored.filter(row => row !== chosen)];
  const total = (row: typeof chosen) => row.estimate ? Math.round(row.estimate.typical) : null;
  const candidates = ordered.map((row, index): CandidateRow => {
    const parts = Object.entries(row.value.cost) as [string, Minutes | null][];
    const unknown = parts.filter(([, m]) => !validMinutes(m)).map(([key]) => key);
    const unknownWords = unknown.map(key => PART_WORDS[key] ?? key).join(', ');
    const knownMinutes = Math.round(parts.reduce((n, [, m]) => n + (validMinutes(m) ? m.typical : 0), 0));
    const xp = Object.fromEntries(row.value.effects.flatMap(e => e.kind === 'xp' ? [[e.skill, e.amount]] : []));
    const verdict = row === chosen
      ? (options.lockedObjectiveId && row.value.objectiveId === options.lockedObjectiveId ? 'Chosen: your selected goal'
        : row === incumbent && row !== scored[0] ? 'Chosen: current objective kept; nothing else is clearly faster'
        : priority(row.value) > 0 ? `Chosen: no objective is ready to do yet. First: ${row.value.activeAction.title}`
        : total(row) !== null ? `Chosen: lowest known total time (about ${total(row)} min to finish the open quests)`
        : comparableUnmeasured ? `Chosen: lowest known time (about ${Math.round(row.expression!.known.typical)} min); unmeasured quests are assumed to cost the same either way`
        : `Chosen with no full time comparison: fewest unknown parts (${row.expression?.unresolved.length ?? 'all'}), then the lowest known minimum (about ${knownMinutes} min)`)
      : priority(row.value) > priority(chosen.value) ? `${row.value.activeAction.kind === 'MANUAL_WAIT' ? 'Blocked' : 'Needs a check first'}: ${row.value.activeAction.title}`
      : total(row) !== null && total(chosen) !== null ? `Slower: about ${total(row)} min in total, against ${total(chosen)} min`
      : comparableKnown(row.expression, chosen.expression) && Math.round(row.expression!.known.typical) === Math.round(chosen.expression!.known.typical)
        ? `Same known total as the choice (about ${Math.round(row.expression!.known.typical)} min); ranked lower by its own time (${unknown.length ? `unknown ${unknownWords}` : `${knownMinutes} min`})`
      : comparableKnown(row.expression, chosen.expression) ? `Slower on the known part: about ${Math.round(row.expression!.known.typical)} min against ${Math.round(chosen.expression!.known.typical)} min (unmeasured parts assumed equal)`
      : unranked.includes(row) ? `Time unknown: ${unknownWords || 'later quests'}`
      : `Time unknown: ${unknownWords || 'later quests'}; known part about ${knownMinutes} min`;
    const laterUnknown = [...new Set((row.expression?.unresolved ?? []).map(term => term.replace(/:branch\d+/g, '')))];
    return { id: row.value.objectiveId, action: row.value.activeAction.kind, minutes: unknown.length ? null : knownMinutes, knownMinutes, unknown, laterUnknown, xp, rank: index + 1, verdict };
  });
  return { ...snapshot.scope, revision: (previous?.revision ?? 0) + 1, objectiveId: value.objectiveId, candidates,
    ...(options.lockedObjectiveId ? { requestedObjectiveId: options.lockedObjectiveId } : {}), activeAction: value.activeAction,
    ...(chosen.followingObjectiveId ? { followingObjectiveId: chosen.followingObjectiveId } : {}),
    alternatives: [...unranked, ...scored.filter(row => row !== chosen && !unranked.includes(row))].slice(0, 3).map(row => ({ id: row.value.objectiveId, minutes: row.estimate?.typical ?? null,
      comparisonReason: unranked.includes(row) ? 'Time unknown, so it could be faster; not ranked below the choice' : priority(row.value) ? 'Needs verification or a manual blocker resolved' : row.estimate ? 'Compared by total remaining minutes'
        : comparableKnown(row.expression, chosen.expression) ? 'Compared known minutes; identical unmeasured work is shared' : 'Total time is not yet known' })),
    expectedNext: { effects: value.activeAction.kind === 'VERIFY' || value.activeAction.kind === 'MANUAL_WAIT' ? [] : value.activeAction.expectedEffects,
      evidenceRequired: value.activeAction.completionEvidence }, // A choice made without a full time (unmeasured parts assumed equal) is never claimed as HIGH or MEDIUM.
    confidence: unranked.length || (!estimate && scored.length > 1) ? 'LOW' : value.confidence,
    why: [...value.activeAction.reasons, ...(unranked.length ? [`Not compared because their time is unknown: ${unranked.slice(0, 5).map(row => row.value.objectiveId).join(', ')}`] : []), ...(comparableUnmeasured && chosen.expression?.unresolved.length
      ? ['Comparable known costs exclude shared unmeasured work; total remaining time is unknown'] : []), ...(options.lockedObjectiveId && value.objectiveId !== options.lockedObjectiveId
      ? [`Resolve required quest progress for your selected goal: ${options.lockedObjectiveId}`] : []), ...(begun ? ['Continue the quest already in progress'] : []),
      ...(chosen === incumbent ? ['Keep the current objective unless a material improvement or hard blocker requires a change'] : [])],
    estimatedRemaining: estimate ?? (ids.length ? null : noTime()) };
}
