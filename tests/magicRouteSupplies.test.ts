import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey } from '../src/lib/checklist';
import { methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { pickMethods } from '../src/lib/methodPick';
import { adviseTraining, trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { toInGameTarget } from '../src/services/runeliteBridge';

const base = stepById.get('S6-04')!;
function scenario(magic: number | null, smithing: number | null = 15, stock: Record<string, { carried?: number; bank?: number }> = {}, fireStaff = false, unread = false) {
  const progress = emptyProgress();
  for (const s of allSteps) { if (s.id === base.id) break; progress.steps[s.id] = 'done'; }
  const stats = { ...(magic === null ? {} : { magic }), ...(smithing === null ? {} : { smithing }) };
  const equipment = fireStaff ? [{ id: 1387, name: 'Staff of fire', slot: 'weapon', count: 1 }] : [];
  const gear = { equipment, inventory: [], coins: 0, bankCoins: 0 };
  const owned = { bankSeen: !unread, items: new Map(methodToolNames(base).map(name => [nameKey(name), { name, carried: stock[name]?.carried ?? (name === 'Staff of fire' && fireStaff ? 1 : 0), noted: 0, ...(!unread ? { bank: stock[name]?.bank ?? 0 } : {}) }])) };
  const state = buildPlayerState({ mode: 'f2p', stats, progress, owned, gear, connected: true, questsDone: [] });
  const pick = pickMethods([base], state, 'f2p', 'chill', 'balanced')[base.id];
  const step = withTrainingMethod(base, pick);
  const engine = createReadinessEngine({ ...contextOf({ step, steps: allSteps.map(s => s.id === base.id ? step : s), progress, mode: 'f2p', qp: 44, stats, owned, gear }), state });
  return { state, pick, step, engine, payload: toInGameTarget(step)! };
}

describe('S6-04 spell-dependent supplies', () => {
  it.each([1, 25, 35])('Magic%s without confirmed higher-spell inputs gets real Wind Strike runes instead of nature-only preparation', level => {
    const s = scenario(level);
    expect(s.pick).toMatchObject({ methodId: 'ma-strike', name: 'Wind Strike on cows and chickens' });
    expect(s.payload.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Mind rune', count: 100 }), expect.objectContaining({ name: 'Air rune', count: 100 }), expect.objectContaining({ name: 'Trout', heals: 7 })]));
    expect(s.payload.checklist?.some(r => r.name === 'Nature rune')).toBe(false);
    expect(s.step.how).toContain('Wind Strike');
    expect(s.payload.completionTrigger).toEqual(base.inGame!.completionTrigger);
  });
  it('uses an unlocked higher Strike only with its confirmed ingredients and projects the same spell name', () => {
    const s = scenario(25, 15, { 'Mind rune': { bank: 50 }, 'Fire rune': { bank: 60 }, 'Air rune': { bank: 40 }, Trout: { bank: 5 } });
    expect(s.pick).toMatchObject({ name: 'Fire Strike on cows and chickens' });
    expect(s.step.how).toContain('Fire Strike');
    expect(s.payload.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Fire rune', count: 60 }), expect.objectContaining({ name: 'Air rune', count: 40 })]));
    expect(s.engine.plan(s.step).lines.find(r => r.name === 'Fire rune')?.where).toBe('BANK');
  });
  it('never selects Fire Strike below its actual level even if the runes are owned', () => {
    const s = scenario(1, 15, { 'Mind rune': { carried: 100 }, 'Fire rune': { carried: 300 }, 'Air rune': { carried: 200 } });
    expect(s.pick).toMatchObject({ name: 'Wind Strike on cows and chickens' });
  });
  it.each([43, 54])('Magic%s with a prepared ore batch uses Superheat and carries its actual inputs', level => {
    const s = scenario(level, 15, { 'Nature rune': { carried: 25 }, 'Iron ore': { carried: 25 }, 'Fire rune': { carried: 100 } });
    expect(s.pick).toMatchObject({ methodId: 'ma-superheat' });
    expect(s.payload.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Iron ore', count: 25 }), expect.objectContaining({ name: 'Nature rune', count: 25 }), expect.objectContaining({ name: 'Fire rune', count: 100 })]));
    expect(s.payload.npcNames ?? []).toEqual([]);
    expect(s.engine.readiness(s.step).status).toBe('READY');
  });
  it.each([14, null])('does not assume Smithing15 for Superheat: %s', smithing => {
    const s = scenario(43, smithing, { 'Nature rune': { carried: 25 }, 'Iron ore': { carried: 25 }, 'Fire rune': { carried: 100 } });
    expect(s.pick).toMatchObject({ methodId: 'ma-strike' });
    expect(s.payload.checklist?.some(r => r.name === 'Iron ore')).toBe(false);
  });
  it('unread runes cannot become ready or a definite purchase deficit', () => {
    const s = scenario(25, null, {}, false, true);
    expect(s.engine.readiness(s.step).status).not.toBe('READY');
    expect(s.engine.readiness(s.step).requirements.some(r => r.state === 'UNKNOWN')).toBe(true);
    expect(s.engine.plan(s.step).now.some(r => r.action?.kind === 'BUY')).toBe(false);
  });
  it('also clears combat targets when the projection receives a previously projected spell step', () => {
    const strike = scenario(25);
    expect(strike.payload.npcNames).toContain('Cow');
    const utility = scenario(43, 15, { 'Nature rune': { carried: 25 }, 'Iron ore': { carried: 25 }, 'Fire rune': { carried: 100 } });
    const next = withTrainingMethod(strike.step, utility.pick);
    expect(toInGameTarget(next)?.npcNames).toEqual([]);
    expect(next.itemsRequired?.some(r => r.nameEn === 'Iron ore')).toBe(true);
  });
  it('unknown Magic holds the fallback and the original goal alone releases supplies', () => {
    const unknown = scenario(null);
    expect(unknown.pick).toBeUndefined();
    expect(unknown.engine.readiness(unknown.step).requirements.some(r => r.kind === 'skill' && r.state === 'UNKNOWN')).toBe(true);
    const done = scenario(55);
    expect(done.step.itemsRequired).toEqual([]);
    expect(done.payload.completionTrigger).toEqual(base.inGame!.completionTrigger);
  });
  it('keeps alchemy/splashing visible and unchecked without putting them in the automatic path', () => {
    const s = scenario(30);
    const advice = adviseTraining({ skill: 'magic', target: 55, state: s.state, mode: 'f2p', style: 'chill', priority: 'balanced' });
    expect(advice.others.some(v => v.method.id === 'ma-alch')).toBe(true);
    expect(advice.path.every(l => !l.method.manualSetup)).toBe(true);
    for (const id of ['ma-splash', 'ma-alch', 'ma-halch']) {
      const view = viewMethod(trainingMethods.find(m => m.id === id)!, s.state);
      expect(view.status).not.toBe('READY');
      expect(view.unchecked.some(n => n.state === 'UNKNOWN')).toBe(true);
    }
    expect(methodToolNames(base).length).toBeLessThanOrEqual(40);
  });
});
