import { describe, expect, it } from 'vitest';
import { adviseTraining, type TrainingMethod } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { DEFAULT_FEATURES, parseFeatures } from '../src/lib/features';
import { priorityOf } from '../src/lib/playStyle';
import { bankingPays, earningsOrder, netEarnings } from '../src/lib/lootValue';
import { processRate, type ProcessingRegistry } from '../src/lib/processingRates';
import { gatherRate, type SkillingRegistry } from '../src/lib/skillingRates';
import { parseHash } from '../src/lib/router';
import type { PriceView } from '../src/lib/funding/quotes';

const method = (id: string, extra: Partial<TrainingMethod> = {}): TrainingMethod => ({
  id, name: id, skills: ['fishing'], from: 1, to: null, members: false, kind: 'method', needs: [],
  xph: [10000, 10000], xpa: null, act: null, xpTotal: null, effort: 'low', risk: 'none', cost: 'free', where: 'Test place', url: '', ...extra,
});
const state = (bankSeen = true) => buildPlayerState({ mode: 'f2p', stats: { fishing: 20, smithing: 20, woodcutting: 20 }, progress: emptyProgress(),
  connected: true, questsDone: [], gear: { inventory: [], equipment: [], coins: 100, bankCoins: bankSeen ? 0 : null },
  owned: { bankSeen, items: new Map([['test ore', { name: 'Test ore', carried: 0, noted: 0, bank: bankSeen ? 0 : undefined }], ['bronze axe', { name: 'Bronze axe', carried: 1, noted: 0, bank: bankSeen ? 0 : undefined }]]) },
});
const prices = (buy: Record<string, number>, sell: Record<string, number>): PriceView => {
  const q = (n: number) => ({ price: n, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] });
  return { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined,
    buy: n => buy[n] === undefined ? null : q(buy[n]), sell: n => sell[n] === undefined ? null : q(sell[n]) };
};
const advice = (methods: TrainingMethod[], priority: 'balanced' | 'fastest' | 'profit', s = state(), market?: PriceView) =>
  adviseTraining({ skill: 'fishing', target: 30, state: s, mode: 'f2p', style: 'chill', priority, methods, prices: market });

describe('one persisted training objective and direct skill access', () => {
  it('defaults to balanced and preserves explicit objectives without changing older saves', () => {
    expect(priorityOf(DEFAULT_FEATURES)).toBe('balanced');
    expect(priorityOf(parseFeatures('{"profitTraining":true}'))).toBe('profit');
    expect(priorityOf(parseFeatures('{"efficient":true}'))).toBe('fastest');
    expect(priorityOf(parseFeatures('{"relaxedTraining":true}'))).toBe('relaxed');
    expect(priorityOf(parseFeatures('{"profitTraining":"yes"}'))).toBe('balanced');
  });
  it('keeps existing skill routes and supports direct Defence selection', () => {
    expect(parseHash('#/skills/ME')).not.toHaveProperty('skill');
    expect(parseHash('#/skills/ME/defence')).toMatchObject({ page: 'skills', param: 'ME', skill: 'defence' });
    expect(parseHash('#/step/S4-03')).toMatchObject({ page: 'path', step: 'S4-03' });
  });
});

describe('money means known proceeds after supplies, not gross drops', () => {
  const fast = method('fast', { xph: [30000, 30000], costPerHour: 0, lootPerHour: 0 });
  const rich = method('rich', { xph: [12000, 12000], costPerHour: 500, lootPerHour: 10000 });
  it('money favours net income, XP favours speed, and an unknown cost is never free', () => {
    const expensive = method('gross-only', { costPerHour: 20000, lootPerHour: 21000 });
    const unread = method('unread', { cost: 'profit', costPerHour: null, lootPerHour: 100000 });
    expect(advice([fast, expensive, rich, unread], 'profit').best?.method.id).toBe('rich');
    expect(advice([rich, fast], 'fastest').best?.method.id).toBe('fast');
    expect(netEarnings({ costPerHour: null, lootPerHour: 100000 })).toBeNull();
    expect(earningsOrder(null, -100)).toBe(0);
    expect(earningsOrder(Infinity, 100)).toBeGreaterThan(0);
  });
  it('inaccessible levels and manual setups never become the automatic money recommendation', () => {
    const locked = method('locked', { ...rich, id: 'locked', needs: [{ type: 'skill', skill: 'fishing', min: 50 }], lootPerHour: 100000 });
    const manual = method('manual', { ...rich, id: 'manual', manualSetup: 'Verify exact equipment', lootPerHour: 100000 });
    expect(advice([locked, manual, rich], 'profit').best?.method.id).toBe('rich');
  });
  it('a known unaffordable next-trip kit loses to a feasible method; unread money is not a deficit', () => {
    const costly = method('costly', { ...rich, id: 'costly', xph: [100000, 100000], needs: [{ type: 'item', name: 'Test ore', count: 10 }] });
    const board = prices({ 'Test ore': 100 }, {});
    expect(advice([costly, fast], 'balanced', state(), board).best?.method.id).toBe('fast');
    const only = advice([costly], 'profit', state(), board).best!;
    expect(only.fundingShortfall).toBe(900);
    expect(only.reason).toContain('earn at least 900 gp');
    expect(advice([costly], 'profit', state(false), board).best?.fundingShortfall).toBeUndefined();
  });
  it.each(['balanced', 'profit'] as const)('%s at zero cash keeps an executable new-skill method ahead of an unpriced batch', priority => {
    const supplied = method('future-supplied', { xph: [1000, 1000], needs: [] });
    const unpriced = method('future-unpriced', { xph: [100000, 100000], consumables: [{ name: 'Test ore', qty: 1 }], needs: [{ type: 'item', name: 'Test ore', count: 1 }] });
    const zero = state();
    if (zero.coins.bag.known) zero.coins.bag.value = 0;
    expect(advice([unpriced, supplied], priority, zero).best?.method.id).toBe(supplied.id);
    // A real quote and enough money make the faster purchase comparable again.
    if (priority === 'balanced') expect(advice([unpriced, supplied], priority, state(), prices({ 'Test ore': 1 }, {})).best?.method.id).toBe(unpriced.id);
  });
  it('money banking still needs a positive sale, while fastest avoids extra pickup time', () => {
    expect(bankingPays(10, 100, null, 'profit')).toBe(true);
    expect(bankingPays(0, 1, null, 'profit')).toBe(false);
    expect(bankingPays(10, 1, 1, 'fastest')).toBe(false);
  });
});

describe('new registry entries inherit the objective, including selection inside one catalogue method', () => {
  it('processing picks the profitable recipe rather than only its faster-XP sibling', () => {
    const recipe = { id: 'fast', skill: 'smithing', level: 1, xp: 100, ticks: 4, facility: null, tools: [], inputs: [{ name: 'Test ore', qty: 1, stacks: false }], output: { name: 'Fast bar', qty: 1 } };
    const reg: ProcessingRegistry = { stations: [], recipes: [recipe, { ...recipe, id: 'rich', xp: 20, output: { name: 'Rich bar', qty: 1 } }], methods: { test: ['fast', 'rich'] } };
    const m = method('test', { skills: ['smithing'] });
    const board = prices({ 'Test ore': 10 }, { Cowhide: 100, 'Fast bar': 11, 'Rich bar': 100 });
    expect(processRate(m, 'smithing', state(), { prices: board, objective: 'fastest' }, reg)?.basis).toBe('Fast bar');
    expect(processRate(m, 'smithing', state(), { prices: board, objective: 'profit' }, reg)?.basis).toBe('Rich bar');
  });
  it('gathering can choose a lower-XP resource for its better banked income', () => {
    const resource = { id: 'fast', skill: 'woodcutting', object: 'Test tree', tool: 'axe', ticks: 4, cascade: false, lifetime: 'one' as const,
      products: [{ name: 'Fast logs', level: 1, xp: 100, respawn: [1, 1] as [number, number] }], byTool: { 'Bronze axe': { low: 128, high: 256 } } };
    const spot = { resource: 'fast', label: 'Test grove', place: { x: 3095, y: 3240, plane: 0, label: 'Test grove' }, count: 6, members: false, bank: 'Draynor Bank' };
    const reg: SkillingRegistry = { tools: { axe: { skill: 'woodcutting', tiers: [{ item: 'Bronze axe', level: 1, wield: 1 }] } },
      resources: [resource, { ...resource, id: 'rich', products: [{ ...resource.products[0], name: 'Rich logs', xp: 20 }] }],
      spots: [spot, { ...spot, resource: 'rich' }], methods: { test: ['fast', 'rich'] } };
    const m = method('test', { skills: ['woodcutting'] });
    const board = prices({}, { Cowhide: 100, 'Fast logs': 1, 'Rich logs': 500 });
    expect(gatherRate(m, 'woodcutting', state(), { prices: board, objective: 'fastest' }, reg)?.lootPerHour).toBeUndefined();
    expect(gatherRate(m, 'woodcutting', state(), { prices: board, objective: 'profit' }, reg)?.loot).toBe('Rich logs');
  });
});
