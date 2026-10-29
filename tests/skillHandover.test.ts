import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey } from '../src/lib/checklist';
import { pickMethods } from '../src/lib/methodPick';
import { SKILLING } from '../src/lib/skillingRates';
import { followedGoal, GOAL_REACHED, methodToolNames, UNKNOWN_GOAL_PREFIX, withTrainingMethod, pickedMethodId } from '../src/lib/methodStep';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { parseNavTarget, toInGameTarget } from '../src/services/runeliteBridge';
import { trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import { trainingNav } from '../src/lib/trainingNav';
import type { Step } from '../src/types';

// Keep longer-goal engine regressions; actual Optional checkpoints have their own acceptance tests.
function extended(step: Step, target: number): Step {
  return { ...step, targets: step.targets?.filter(t => t.skill !== 'firemaking').map(t => ({ ...t, level: target })),
    inGame: { ...step.inGame!, completionTrigger: { ...step.inGame!.completionTrigger!, levels: step.inGame!.completionTrigger!.levels!.filter(t => t.skill !== 'firemaking').map(t => ({ ...t, level: target })) } } };
}
const base = extended(stepById.get('S6-02')!, 50);
function scenario(stats: Record<string, number>, stock: Record<string, { carried?: number; bank?: number }> = {}, base: Step = extended(stepById.get('S6-02')!, 50)) {
  const names = [...new Set([...methodToolNames(base), ...Object.keys(stock)])];
  const owned = { bankSeen: true, items: new Map(names.map(name => [nameKey(name), { name, carried: stock[name]?.carried ?? 0, noted: 0, bank: stock[name]?.bank ?? 0 }])) };
  const progress = emptyProgress();
  const state = buildPlayerState({ mode: 'f2p', stats, progress, owned, gear: null, questsDone: ["Cook's Assistant"], connected: true });
  const raw = pickMethods([base], state, 'f2p', 'chill', 'balanced')[base.id];
  const pick = raw === undefined ? undefined : pickedMethodId(raw);
  const step = withTrainingMethod(base, raw);
  const steps = allSteps.map(s => s.id === step.id ? step : s);
  const engine = createReadinessEngine({ ...contextOf({ step, steps, progress, mode: 'f2p', qp: 100, owned, gear: null, stats }), state });
  return { state, pick, step, engine, payload: toInGameTarget(step)! };
}

/** The target names one of the registry's spots for the method's resources (skilling.json), as the engine picked it. */
const chosenSpotOf = (methodId: string, label: string | undefined) =>
  SKILLING.spots.some((sp) => SKILLING.methods[methodId]?.includes(sp.resource) && label?.endsWith(`— ${sp.label}`));

describe('one coherent Fishing/Cooking handover', () => {
  it('a new training method cannot retain purchases from a superseded combat plan', () => {
    const stale = { ...base, goalItemsRequired: [{ nameEn: 'Salmon', amount: 200, howToGet: 'Old combat plan' }] };
    for (const pick of ['fi-shrimp', GOAL_REACHED, `${UNKNOWN_GOAL_PREFIX}fishing`]) {
      const changed = withTrainingMethod(stale, pick);
      expect(changed).not.toBe(stale);
      expect(changed.goalItemsRequired).toBeUndefined();
    }
  });
  it.each([1, 20, 30, 35, 49])('Fishing50/Cooking%s uses the remaining skill, its supplies and one destination', cooking => {
    const s = scenario({ fishing: 50, cooking });
    expect(s.pick).not.toBe(GOAL_REACHED);
    expect(followedGoal(s.step)).toEqual({ skill: 'cooking', target: 50 });
    expect(s.step.itemsRequired?.length).toBeGreaterThan(0);
    expect(s.step.itemsRequired?.some(i => /fishing net|fishing rod|harpoon|lobster pot/i.test(i.nameEn))).toBe(false);
    expect(s.payload.npcNames ?? []).not.toContain('Fishing spot');
    expect(s.payload.groundTiles).toHaveLength(1);
    expect(s.payload.worldPoint).toMatchObject(s.payload.groundTiles![0]);
    expect(s.payload.completionTrigger).toEqual(base.inGame!.completionTrigger);
    expect(s.payload.checklist?.map(i => i.name)).toEqual(s.step.itemsRequired?.map(i => i.nameEn));
  });
  it('does not send the player to Karamja to cook already-owned tuna', () => {
    const s = scenario({ fishing: 50, cooking: 30 }, { 'Raw tuna': { bank: 26 } });
    expect(s.pick).toBe('ck-tuna');
    expect(s.payload.worldPoint?.label).toContain('Cooking: Tuna');
    expect(s.payload.worldPoint?.label).toContain('Barbarian Village');
    const raw = s.engine.plan(s.step).now.find(i => i.name === 'Raw tuna')!;
    expect(raw.where).toBe('BANK');
    expect(raw.action?.kind).toBe('TAKE');
  });
  it('owned banked food is taken, never bought again; a recipe the processing engine measures faster for the whole goal may still win', () => {
    // 100 trout cover about 7,000 of the 88,000 XP to Cooking 50: most food is bought either way, and tuna is measured faster from 30.
    const s = scenario({ fishing: 50, cooking: 30 }, { 'Raw trout': { bank: 100 } });
    expect(s.pick).toBe('ck-tuna');
    // Below tuna's level the banked trout are the recipe, taken from the bank.
    const t = scenario({ fishing: 50, cooking: 25 }, { 'Raw trout': { bank: 100 } });
    expect(t.pick).toBe('ck-trout');
    expect(t.engine.plan(t.step).now.find(i => i.name === 'Raw trout')?.action?.kind).toBe('TAKE');
  });
  it('cooking owned tuna does not invent a Fishing prerequisite', () => {
    const s = scenario({ fishing: 1, cooking: 30 }, { 'Raw tuna': { carried: 26 } });
    expect(viewMethod(trainingMethods.find(m => m.id === 'ck-tuna')!, s.state).status).toBe('READY');
  });
  it('accepts mixed raw meat without buying duplicate beef', () => {
    const s = scenario({ fishing: 50, cooking: 1 }, { 'Raw beef': { carried: 13 }, 'Raw chicken': { carried: 13 } });
    expect(s.pick).toBe('ck-meat');
    const requirement = s.engine.readiness(s.step).requirements.find(r => r.item === 'Raw beef');
    expect(requirement?.state).toBe('OK');
    expect(s.engine.plan(s.step).now.some(r => r.action?.kind === 'BUY')).toBe(false);
  });
  it('prepares a bounded wine batch at a bank without a guild or range requirement', () => {
    const s = scenario({ fishing: 50, cooking: 35 }, { Grapes: { bank: 13 }, 'Jug of water': { bank: 13 } });
    expect(s.pick).toBe('ck-wine');
    expect(s.step.itemsRequired?.map(i => [i.nameEn, i.amount])).toEqual([['Grapes', 13], ['Jug of water', 13]]);
    expect(s.payload.worldPoint?.label).toContain('Edgeville Bank');
    expect(s.step.how).toContain('12 seconds');
    expect(s.step.how).toContain('bad wine gives no XP');
  });
  it('an unknown second skill is not complete or ready and cannot retain the fishing arrow', () => {
    const s = scenario({ fishing: 50 });
    expect(s.pick).toBe(`${UNKNOWN_GOAL_PREFIX}cooking`);
    expect(s.payload.worldPoint).toBeUndefined();
    expect(s.payload.groundTiles).toEqual([]);
    expect(s.payload.goal).toContain('Check your cooking level');
    expect(s.engine.readiness(s.step).requirements.some(r => r.kind === 'skill' && r.state === 'UNKNOWN')).toBe(true);
    expect(s.engine.readiness(s.step).status).not.toBe('READY');
    expect(s.payload.completionTrigger).toEqual(base.inGame!.completionTrigger);
  });
  it('releases supplies only when both goals are known reached', () => {
    const s = scenario({ fishing: 50, cooking: 50 });
    expect(s.pick).toBe(GOAL_REACHED);
    expect(s.step.itemsRequired).toEqual([]);
    expect(s.payload.worldPoint).toBeUndefined();
    expect(s.payload.completionTrigger).toEqual(base.inGame!.completionTrigger);
  });
  it('watches ingredients and alternatives within the existing bound before switching skill', () => {
    const s = scenario({ fishing: 25, cooking: 1 });
    expect(s.payload.watchItems).toEqual(expect.arrayContaining(['Raw beef', 'Raw chicken', 'Raw trout', 'Raw tuna', 'Grapes', 'Jug of water']));
    expect(s.payload.watchItems!.length).toBeLessThanOrEqual(40);
  });
});

describe('one coherent Mining/Woodcutting handover', () => {
  const mining = extended(stepById.get('S6-03')!, 60);
  it.each([1, 14, 15, 59])('Mining%s projects only the unlocked mining resource and usable tool family', level => {
    const s = scenario({ mining: level, woodcutting: 1 }, { 'Bronze pickaxe': { carried: 1 } }, mining);
    expect(s.pick).toBe(level < 15 ? 'mi-ore' : 'mi-iron');
    expect(s.payload.objectNames).toEqual(level < 15 ? ['Copper rocks', 'Tin rocks'] : ['Iron rocks']);
    expect(s.step.itemsRequired?.map(r => r.nameEn)).toEqual(['Bronze pickaxe']);
    expect(s.step.how).toContain(level < 15 ? 'Copper and tin' : 'Iron, dropping');
    // The gathering engine picks the mine (skilling.json spots): one of the method's own spots, the most XP for this player.
    expect(chosenSpotOf(s.pick!, s.payload.worldPoint?.label)).toBe(true);
    expect(s.payload.groundTiles).toHaveLength(1);
    expect(s.payload.completionTrigger).toEqual(mining.inGame!.completionTrigger);
    expect(s.engine.readiness(s.step).requirements.find(r => r.item === 'Bronze pickaxe')?.state).toBe('OK');
  });
  it.each([[1, 'wc-tree', 'Tree'], [15, 'wc-oak', 'Oak tree'], [30, 'wc-willow', 'Willow tree'], [59, 'wc-willow', 'Willow tree']] as const)(
    'Mining60/Woodcutting%s switches supplies, scene and task together', (level, pick, object) => {
      const s = scenario({ mining: 60, woodcutting: level }, { 'Bronze axe': { bank: 1 }, 'Rune pickaxe': { carried: 1 } }, mining);
      expect(s.pick).toBe(pick);
      expect(followedGoal(s.step)).toEqual({ skill: 'woodcutting', target: 60 });
      expect(s.payload.objectNames).toEqual([object]);
      expect(s.payload.checklist?.map(r => r.name)).toEqual(['Bronze axe']);
      expect(s.engine.plan(s.step).now.find(r => r.name === 'Bronze axe')?.action?.kind).toBe('TAKE');
      expect(s.step.quickSteps?.[0]).toContain('Bank finished-skill tools');
      expect(s.payload.worldPoint?.label).not.toMatch(/mine|ore/i);
      expect(s.payload.completionTrigger).toEqual(mining.inGame!.completionTrigger);
      expect(chosenSpotOf(s.pick!, s.payload.worldPoint?.label)).toBe(true);
      if (level >= 30) {
        expect(s.step.how).toContain('Willow trees');
      }
    });
  it('does not treat an unread primary skill as ready or complete', () => {
    const s = scenario({ woodcutting: 60 }, { 'Bronze pickaxe': { carried: 1 } }, mining);
    expect(s.pick).toBeUndefined();
    expect(s.engine.readiness(s.step).requirements.some(r => r.kind === 'skill' && r.state === 'UNKNOWN')).toBe(true);
    expect(s.engine.readiness(s.step).status).not.toBe('READY');
    expect(s.payload.objectNames).toEqual(['Copper rocks', 'Tin rocks']);
  });
  it('clears all scene IDs and points when the remaining skill is unknown or both goals are reached', () => {
    const withOldIds = { ...mining, inGame: { ...mining.inGame!, npcIds: [123], objectIds: [456] } };
    const states: Record<string, number>[] = [{ mining: 60 }, { mining: 60, woodcutting: 60 }];
    for (const stats of states) {
      const s = scenario(stats, {}, withOldIds);
      expect(s.pick).toBe('woodcutting' in stats ? GOAL_REACHED : `${UNKNOWN_GOAL_PREFIX}woodcutting`);
      expect(s.payload.worldPoint).toBeUndefined();
      expect(s.payload.npcIds).toEqual([]);
      expect(s.payload.objectIds).toEqual([]);
      expect(s.payload.objectNames).toEqual([]);
    }
  });
  it('watches both complete tool families before switching, within the existing protocol bound', () => {
    const s = scenario({ mining: 59, woodcutting: 1 }, {}, mining);
    expect(s.payload.watchItems).toEqual(expect.arrayContaining(['Bronze pickaxe', 'Rune pickaxe', 'Bronze axe', 'Rune axe']));
    expect(s.payload.watchItems!.length).toBeLessThanOrEqual(40);
  });
  it('temporary method navigation preserves the same verified scenery and validates incoming names', () => {
    for (const id of ['mi-ore', 'mi-iron', 'wc-tree', 'wc-oak', 'wc-willow']) {
      const m = trainingMethods.find(m => m.id === id)!;
      const nav = trainingNav(m)!;
      expect(nav.objectNames).toEqual(m.objectNames);
      expect(parseNavTarget(nav)?.objectNames).toEqual(m.objectNames);
      expect(parseNavTarget({ ...nav, objectNames: [5] })?.objectNames).toBeUndefined();
      expect(parseNavTarget({ ...nav, objectNames: Array(9).fill('Tree') })?.objectNames).toBeUndefined();
    }
  });
});
