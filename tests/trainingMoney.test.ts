import { describe, expect, it } from 'vitest';
import { adviseTraining, type TrainingMethod } from '../src/domain/training/trainingRouter';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { parseHash } from '../src/app/router';
import type { PriceView } from '../src/domain/market/quotes';

const method = (id: string, extra: Partial<TrainingMethod> = {}): TrainingMethod => ({
  id, name: id, skills: ['fishing'], from: 1, to: null, members: false, kind: 'method', needs: [],
  xph: [10000, 10000], xpa: null, act: null, xpTotal: null, effort: 'low', risk: 'none', cost: 'free', where: 'Test place', url: '', ...extra,
});
const state = (bankSeen = true) => buildPlayerState({ mode: 'f2p', stats: { fishing: 20, smithing: 20, woodcutting: 20 }, progress: emptyProgress(),
  connected: true, questsDone: [], gear: { inventory: [], equipment: [], coins: 100, bankCoins: bankSeen ? 0 : null },
  owned: { bankSeen, items: new Map([['test ore', { name: 'Test ore', carried: 0, noted: 0, bank: bankSeen ? 0 : undefined }],
    ['bronze axe', { name: 'Bronze axe', carried: 1, noted: 0, bank: bankSeen ? 0 : undefined }]]) } });
const prices = (buy: Record<string, number>, sell: Record<string, number>): PriceView => {
  const q = (n: number) => ({ price: n, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
  return { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
    buy: n => buy[n] === undefined ? null : q(buy[n]), sell: n => sell[n] === undefined ? null : q(sell[n]) };
};
const advice = (methods: TrainingMethod[], s = state(), market?: PriceView) =>
  adviseTraining({ skill: 'fishing', target: 30, state: s, mode: 'f2p', methods, prices: market });

describe('skill pages', () => {
  it('keeps existing skill routes and supports direct Defence selection', () => {
    expect(parseHash('#/skills/ME')).not.toHaveProperty('skill');
    expect(parseHash('#/skills/ME/defence')).toMatchObject({ page: 'skills', param: 'ME', skill: 'defence' });
    expect(parseHash('#/step/S4-03')).toMatchObject({ page: 'path', step: 'S4-03' });
  });
});

describe('what the money allows', () => {
  const rich = method('rich', { xph: [12000, 12000], costPerHour: 500, lootPerHour: 10000 });
  it('inaccessible levels and manual setups never become the automatic recommendation', () => {
    const locked = method('locked', { ...rich, id: 'locked', needs: [{ type: 'skill', skill: 'fishing', min: 50 }], lootPerHour: 100000 });
    const manual = method('manual', { ...rich, id: 'manual', manualSetup: 'Verify exact equipment', lootPerHour: 100000 });
    expect(advice([locked, manual, rich]).best?.method.id).toBe('rich');
  });
  it('a known unaffordable next-trip kit loses to a feasible method', () => {
    const fast = method('fast', { xph: [30000, 30000], costPerHour: 0, lootPerHour: 0 });
    const costly = method('costly', { ...rich, id: 'costly', xph: [100000, 100000], needs: [{ type: 'item', name: 'Test ore', count: 10 }] });
    const board = prices({ 'Test ore': 100 }, {});
    expect(advice([costly, fast], state(), board).best?.method.id).toBe('fast');
  });
  it('zero cash keeps an executable new-skill method ahead of an unpriced batch', () => {
    const supplied = method('future-supplied', { xph: [1000, 1000], needs: [] });
    const unpriced = method('future-unpriced', { xph: [100000, 100000], consumables: [{ name: 'Test ore', qty: 1 }], needs: [{ type: 'item', name: 'Test ore', count: 1 }] });
    const zero = state();
    if (zero.coins.bag.known) zero.coins.bag.value = 0;
    expect(advice([unpriced, supplied], zero).best?.method.id).toBe(supplied.id);
    // A real quote and enough money make the faster purchase comparable again.
    expect(advice([unpriced, supplied], state(), prices({ 'Test ore': 1 }, {})).best?.method.id).toBe(unpriced.id);
  });
});
