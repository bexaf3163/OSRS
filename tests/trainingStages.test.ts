import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { adviseTraining, trainingMethods } from '../src/lib/trainingRouter';
import { RANGED_WATCH } from '../src/lib/rangedLoadout';
import { methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { pickMethods } from '../src/lib/methodPick';
import { goalArrows } from '../src/lib/rangedAmmo';
import { market } from './funding/market';

const state = (levels: Record<string, number>, stock: Record<string, number> = {}) => buildPlayerState({
  mode: 'f2p', connected: true, stats: { hitpoints: 31, defence: 33, ...levels },
  progress: { ...emptyProgress(), levels }, questsDone: ['Dragon Slayer I'],
  gear: { equipment: [], inventory: [], coins: 10000, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map([...new Set([...RANGED_WATCH, ...methodToolNames(stepById.get('S6-03')!), ...Object.keys(stock)])].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: stock[name] ?? 0 }])) },
});

describe('shared staged training, not a starter grind to the final goal', () => {
  it('Ranged has an early bow milestone and retires the beginner trainer at20', () => {
    const st = state({ ranged: 1 }, { Salmon: 20 });
    const advice = adviseTraining({ skill: 'ranged', target: 40, mode: 'f2p', style: 'chill', priority: 'balanced', state: st, prices: market() });
    expect(advice.actionTarget).toBe(5);
    expect(advice.path[0].method.id).toBe('ra-lumb');
    expect(advice.path.every(l => l.method.id !== 'ra-lumb' || l.toLevel <= 20)).toBe(true);
    expect(advice.path.some(l => l.fromLevel === 5 && l.needs?.some(n => n.type === 'item' && n.name === 'Oak shortbow'))).toBe(true);
    expect(advice.path.some(l => l.fromLevel >= 20 && l.method.id !== 'ra-lumb')).toBe(true);
    const arrows = goalArrows(advice.path, st, 0, market());
    expect(arrows).toMatchObject({ goalLevel: 40, changesKit: true });
    expect(arrows!.shots.mid).toBeGreaterThan(0);
    const base = stepById.get('S6-01')!;
    const pick = pickMethods([base], st, 'f2p', 'chill', 'balanced', { prices: market() })[base.id];
    const resolved = withTrainingMethod(base, pick);
    expect(resolved.how).toContain('to 5:');
    expect(resolved.how).not.toContain('to 40:');
    expect(resolved.inGame?.completionTrigger).toEqual(base.inGame?.completionTrigger);
  });
  it.each([20, 26, 30, 39])('Ranged%s does not send the player back to the beginner birds', ranged => {
    const advice = adviseTraining({ skill: 'ranged', target: 40, mode: 'f2p', style: 'chill', priority: 'balanced', state: state({ ranged }, { Salmon: 20 }), prices: market() });
    expect(advice.best).not.toBeNull();
    expect(advice.best!.method.id).not.toBe('ra-lumb');
  });
  it('the starter-only declaration also applies to newly declared content in another skill', () => {
    const base = trainingMethods.find(m => m.id === 'wc-tree')!;
    const starter = { ...base, id: 'future-intro', skills: ['crafting'], from: 1, to: 10, introductory: true, needs: [], xph: [10000, 10000] as [number, number] };
    const later = { ...starter, id: 'future-next', from: 10, to: 99, introductory: false, xph: [1000, 1000] as [number, number] };
    const advice = adviseTraining({ skill: 'crafting', target: 20, mode: 'f2p', style: 'chill', priority: 'balanced', state: state({ crafting: 1 }), methods: [starter, later] });
    expect(advice.path.map(l => [l.method.id, l.fromLevel, l.toLevel])).toEqual([['future-intro', 1, 10], ['future-next', 10, 20]]);
  });
  it('includes the Wiki level21 barbarian stage for XP, with its actual level10 opponent', () => {
    const advice = adviseTraining({ skill: 'ranged', target: 26, mode: 'f2p', style: 'efficient', priority: 'fastest', state: state({ ranged: 21 }, { Salmon: 20 }), prices: market() });
    expect(advice.best?.method.id).toBe('ra-barbarian');
    expect(advice.actionTarget).toBeLessThanOrEqual(26);
    expect(advice.best?.method.where).toContain('level 10');
  });
  it('does not silently assume another skill is trained in a future forecast', () => {
    const base = trainingMethods.find(m => m.id === 'wc-tree')!;
    const early = { ...base, id: 'future-safe', skills: ['crafting'], from: 1, to: 99, needs: [], xph: [1000, 1000] as [number, number] };
    const later = { ...early, id: 'future-secondary-gate', from: 10, xph: [10000, 10000] as [number, number], needs: [{ type: 'skill' as const, skill: 'smithing', min: 15 }] };
    const advice = adviseTraining({ skill: 'crafting', target: 20, mode: 'f2p', style: 'chill', priority: 'balanced', state: state({ crafting: 1, smithing: 1 }), methods: [early, later] });
    expect(advice.path.every(l => l.method.id === early.id)).toBe(true);
  });
  it('an owned tool unlock creates a stage even when the tree type stays the same', () => {
    const advice = adviseTraining({ skill: 'woodcutting', target: 45, mode: 'f2p', style: 'chill', priority: 'balanced', state: state({ woodcutting: 35 }, { 'Bronze axe': 1, 'Rune axe': 1 }), prices: market() });
    expect(advice.path.some(l => l.fromLevel === 41 && l.method.rateBasis?.includes('Rune axe'))).toBe(true);
  });
  it('conditional future kits never mutate observed levels, equipment, stock or cash', () => {
    const st = state({ ranged: 1 }, { Salmon: 20 });
    const before = structuredClone(st);
    adviseTraining({ skill: 'ranged', target: 40, mode: 'f2p', style: 'chill', priority: 'balanced', state: st, prices: market() });
    expect(st).toEqual(before);
  });

});
