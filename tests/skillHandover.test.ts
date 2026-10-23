import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey } from '../src/lib/checklist';
import { pickMethods } from '../src/lib/methodPick';
import { followedGoal, GOAL_REACHED, methodToolNames, UNKNOWN_GOAL_PREFIX, withTrainingMethod } from '../src/lib/methodStep';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { toInGameTarget } from '../src/services/runeliteBridge';
import { trainingMethods, viewMethod } from '../src/lib/trainingRouter';

const base = stepById.get('S6-02')!;
function scenario(stats: Record<string, number>, stock: Record<string, { carried?: number; bank?: number }> = {}) {
  const names = [...new Set([...methodToolNames(base), ...Object.keys(stock)])];
  const owned = { bankSeen: true, items: new Map(names.map(name => [nameKey(name), { name, carried: stock[name]?.carried ?? 0, noted: 0, bank: stock[name]?.bank ?? 0 }])) };
  const progress = emptyProgress();
  const state = buildPlayerState({ mode: 'f2p', stats, progress, owned, gear: null, questsDone: ["Cook's Assistant"], connected: true });
  const pick = pickMethods([base], state, 'f2p', 'chill', 'balanced')[base.id];
  const step = withTrainingMethod(base, pick);
  const steps = allSteps.map(s => s.id === step.id ? step : s);
  const engine = createReadinessEngine({ ...contextOf({ step, steps, progress, mode: 'f2p', qp: 100, owned, gear: null, stats }), state });
  return { state, pick, step, engine, payload: toInGameTarget(step)! };
}

describe('one coherent Fishing/Cooking handover', () => {
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
  it('uses an owned banked recipe before unmeasured new purchases', () => {
    const s = scenario({ fishing: 50, cooking: 30 }, { 'Raw trout': { bank: 100 } });
    expect(s.pick).toBe('ck-trout');
    expect(s.engine.plan(s.step).now.find(i => i.name === 'Raw trout')?.action?.kind).toBe('TAKE');
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
