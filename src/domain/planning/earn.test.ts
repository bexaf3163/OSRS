import { describe, expect, it } from 'vitest';
import { bestEarnRate, earnAction, gatherTime, levelledEarnRates } from './earn';
import { ctxOf, fakePrices, fakeSnap } from '../../../tests/funding/helpers';
import { METHODS } from '../economy/funding/methods';

const snapshot = { scope: { characterId: 'c', mode: 'f2p', gameSessionId: 's', snapshotRevision: 4 } } as never;
const step = { id: 'S1-01', title: 'Buy a skirt' } as never;
const rate = { methodId: 'cowhides', title: 'Collect cowhides', netPerHour: { fast: 60_000, typical: 30_000, slow: 15_000 } };

describe('the earn adapter', () => {
  it('times the shortfall by the best dependable rate, fastest at the highest rate', () => {
    const action = earnAction(snapshot, step, 'Prince Ali Rescue', 1_500, rate)!;
    expect(action).toMatchObject({ kind: 'EARN', goalId: 'Prince Ali Rescue', stepId: 'S1-01', feasibility: 'READY' });
    expect(action.time).toMatchObject({ fast: 1.5, typical: 3, slow: 6 });
    expect(action.completionEvidence[0].snapshotRevision).toBe(4);
  });

  it('gives nothing without a rate, a positive shortfall or a positive income', () => {
    expect(earnAction(snapshot, step, 'g', 1_500, null)).toBeNull();
    expect(earnAction(snapshot, step, 'g', 0, rate)).toBeNull();
    expect(earnAction(snapshot, step, 'g', 100, { ...rate, netPerHour: { fast: 10, typical: 0, slow: 0 } })).toBeNull();
  });
});

const prices = fakePrices(Object.fromEntries(METHODS.flatMap(m => m.outputs.map(out => [out.item.name, { buy: 100, sell: 80 }]))));
const base = (levels: Record<string, number>) => {
  const { cash: _cash, mode: _mode, target: _target, needItems: _need, ...rest } = ctxOf({ prices, snap: fakeSnap({ levels, bankSeen: true }) });
  return rest;
};

describe('gathering quest items yourself (Money engine supply mode)', () => {
  it('times an item a method yields and keeps one no method yields UNKNOWN', () => {
    const all = Object.fromEntries(['attack', 'strength', 'defence', 'hitpoints', 'mining', 'woodcutting', 'fishing', 'crafting', 'smithing', 'cooking', 'magic', 'ranged', 'prayer', 'firemaking'].map(s => [s, 99]));
    const one = gatherTime(base(all), new Map([['Cowhide', 1]]), 5_000);
    expect(one?.source).toContain('for Cowhide');
    expect(one!.typical).toBeGreaterThan(0);
    // More hides take longer, and two items cost the sum of their own trips.
    expect(gatherTime(base(all), new Map([['Cowhide', 20]]), 5_000)!.typical).toBeGreaterThan(one!.typical);
    const both = gatherTime(base(all), new Map([['Cowhide', 1], ['Iron ore', 1]]), 5_000);
    expect(both!.typical).toBeCloseTo(one!.typical + gatherTime(base(all), new Map([['Iron ore', 1]]), 5_000)!.typical, 5);
    expect(gatherTime(base(all), new Map([['Nothing yields this item', 1]]), 5_000)).toBeNull();
    expect(gatherTime(base(all), new Map(), 5_000)).toBeNull();
  });
});

describe('the best dependable earning rate', () => {
  it('is a positive net rate from the Money ranking, or nothing', () => {
    const rate = bestEarnRate(base({ attack: 40, strength: 40, defence: 40, hitpoints: 40 }), 5_000);
    expect(rate?.netPerHour.slow).toBeGreaterThan(0);
    expect(METHODS.some(m => m.id === rate!.methodId)).toBe(true);
  });
});

describe('S61: earn now or train first, by total wall-clock time', () => {
  const unlock = { methodId: 'faster', title: 'Faster method', netPerHour: { fast: 600_000, typical: 600_000, slow: 600_000 }, skill: 'mining', level: 15 };
  const train = (minutes: number) => () => ({ fast: minutes, typical: minutes, slow: minutes, source: 'test training' });

  it('trains first when the unlocked method gets 4,300 GP sooner in total, and says why', () => {
    // Earn now: 4,300 GP at 30k/h is about 8.6 min; train 2 min + 4,300 at 600k/h ≈ 0.4 min.
    const action = earnAction(snapshot, step, 'Prince Ali Rescue', 4_300, rate, { levelled: [unlock], train: train(2) })!;
    expect(action).toMatchObject({ kind: 'TRAIN', title: 'Train mining to 15, then earn 4300 gp: Faster method', stepId: 'S1-01' });
    expect(action.time!.typical).toBeCloseTo(2 + 4_300 / 600_000 * 60, 5);
    expect(action.reasons.join(' ')).toMatch(/unlocks Faster method/);
  });

  it('earns now when the training costs more time than it saves, or its time is unknown', () => {
    expect(earnAction(snapshot, step, 'g', 4_300, rate, { levelled: [unlock], train: train(30) })!.kind).toBe('EARN');
    expect(earnAction(snapshot, step, 'g', 4_300, rate, { levelled: [unlock], train: () => null })!.kind).toBe('EARN');
  });

  it('with no open method at all, training first is the only way to the coins', () => {
    expect(earnAction(snapshot, step, 'g', 4_300, null, { levelled: [unlock], train: train(30) })!.kind).toBe('TRAIN');
  });

  it('lists methods blocked only by one skill level, judged at that level', () => {
    const levelled = levelledEarnRates(base({ attack: 1, strength: 1, defence: 1, hitpoints: 10, mining: 1, woodcutting: 1, fishing: 1, smithing: 1, crafting: 1, cooking: 1 }), 5_000);
    expect(levelled.length).toBeGreaterThan(0);
    for (const row of levelled) {
      const level = METHODS.find(m => m.id === row.methodId)!.requirements.find(r => r.kind === 'level' && r.skill === row.skill);
      expect(row.level, row.methodId).toBeGreaterThan(1);
      if (level && 'level' in level) expect(row.level).toBeGreaterThanOrEqual(level.level as number);
      expect(row.netPerHour.slow).toBeGreaterThan(0);
    }
  });
});

describe('S06: the money ranking compares every family by net GP/h for this character (real 2026-10-18 market)', () => {
  it('high melee earns by combat, a woodcutter gets a different method, and Woodcutting is never the default', async () => {
    const { market, MARKET_NOW } = await import('../../../tests/funding/market');
    const { gearById } = await import('../combat/gearAdvisor');
    const { combatPersonaliser } = await import('../economy/funding/combatAdapter');
    const { gatherPersonaliser } = await import('../economy/funding/gatherAdapter');
    const { processPersonaliser } = await import('../economy/funding/processAdapter');
    const { buildPlayerState } = await import('../player/playerState');
    const id = (n: string) => [...gearById.values()].find(p => p.name === n)!.id;
    const prices = market();
    const picks: { id?: string; family?: string; net: number }[] = [];
    for (const [melee, wc, kit] of [[70, 1, ['Rune scimitar', 'Rune full helm', 'Rune platebody', 'Rune platelegs', 'Rune kiteshield']], [1, 70, ['Rune axe']]] as const) {
      const levels = { attack: melee, strength: melee, defence: melee, hitpoints: Math.max(10, melee), woodcutting: wc };
      const gear = { equipment: kit.map(n => ({ id: id(n), name: n })), inventory: [], coins: 100_000, bankCoins: 0 };
      const state = buildPlayerState({ mode: 'f2p', connected: true, player: 'P', stats: levels, progress: { levels: {} }, questsDone: [], owned: { bankSeen: true, items: new Map(kit.map(n => [n.toLowerCase(), { name: n, carried: 1, bank: 0, noted: 0 }])) }, gear, position: { x: 3222, y: 3218, plane: 0 } } as never);
      const combat = combatPersonaliser({ stats: levels, xp: null, gear: gear as never, fights: null, train: null }, prices), gather = gatherPersonaliser(state), proc = processPersonaliser(state);
      const { cash: _c, mode: _m, target: _t, needItems: _n, ...b } = ctxOf({ prices, now: MARKET_NOW, snap: fakeSnap({ levels, bankSeen: true }), personalise: (m, tool) => combat(m) ?? gather(m, tool) ?? proc(m) });
      const r = bestEarnRate(b, 100_000);
      picks.push({ id: r?.methodId, family: METHODS.find(x => x.id === r?.methodId)?.family, net: r?.netPerHour.slow ?? 0 });
    }
    expect(picks[0].family).toBe('combat');
    expect(picks[1].family).not.toBe(picks[0].family);
    // Woodcutting methods (chop-oak-draynor, chop-yew-edgeville) exist, but a Woodcutting 70 player is not sent there by default.
    expect(picks.filter(p => p.id?.startsWith('chop-'))).toEqual([]);
    expect(picks.every(p => p.net > 0)).toBe(true);
  });
});
