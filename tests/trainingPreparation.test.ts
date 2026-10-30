import { describe, expect, it } from 'vitest';
import { adviseTraining, methodNeeds, preparationNeeds, trainingMethods } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { gearData } from '../src/services/gearAdvisor';
import { FOODS } from '../src/lib/foodAdvice';
import type { PriceView } from '../src/lib/funding/quotes';
import type { MethodView, TrainingMethod } from '../src/lib/trainingRouter';
import { withTrainingMethod } from '../src/lib/methodStep';
import type { Step } from '../src/types';

const quote = { price: 1, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] };
const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, buy: () => quote, sell: () => quote };
const character = (magic = false) => buildPlayerState({ mode: 'f2p', connected: true, player: 'Kit Test', progress: emptyProgress(), questsDone: [],
  stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24, magic: 13 },
  gear: { equipment: [{ id: magic ? 1387 : 1321, name: magic ? 'Staff of fire' : 'Bronze scimitar', slot: 'weapon', count: 1 }], inventory: [], coins: 10000, bankCoins: 0 },
  owned: { bankSeen: true, items: new Map([...new Set([...gearData.items.map(p => p.name), ...FOODS.map(f => f.name), 'Air rune', 'Mind rune', 'Fire rune'])]
    .map(name => [name.toLowerCase(), { name, carried: name === (magic ? 'Staff of fire' : 'Bronze scimitar') ? 1 : 0, noted: 0, bank: magic && ['Air rune', 'Mind rune'].includes(name) ? 1000 : name === 'Mithril scimitar' ? 1 : 0 }])) } });

describe('one prepared kit from the existing combat and Gear models', () => {
  const picked = (method: TrainingMethod) => ({ best: { method, status: 'READY', missing: [], unchecked: [], reason: '' } as MethodView, upgrade: null });
  it('a selected melee trainer carries modelled food and uses a better usable owned weapon before shopping', () => {
    const state = character(), before = structuredClone(state);
    const method = trainingMethods.find(m => m.id === 'me-cow')!;
    const advice = adviseTraining({ skill: 'attack', target: 40, mode: 'f2p', state, style: 'efficient', priority: 'fastest', methods: [method], prices });
    expect(advice.best?.method.rateSource).toBe('model');
    const needs = preparationNeeds(advice, state, prices);
    expect(needs).toContainEqual({ type: 'item', name: 'Mithril scimitar', count: 1, equip: true });
    expect(needs.some(n => n.type === 'item' && n.name === 'Salmon' && n.count! > 0 && n.count! <= 26)).toBe(true);
    expect(needs.some(n => n.type === 'item' && n.name === 'Bronze scimitar')).toBe(false);
    expect(state).toEqual(before);
  });
  it('a newly declared strike trainer inherits rune substitution and recovery food without discarding model-resolved needs', () => {
    const state = character(true);
    const original = trainingMethods.find(m => m.kit === 'strike-spell')!;
    const method = { ...original, id: 'future-strike-trainer', npcNames: ['Hill Giant'] };
    const advice = adviseTraining({ skill: 'magic', target: 19, mode: 'f2p', state, style: 'efficient', priority: 'fastest', methods: [method], prices });
    expect(advice.best?.method.rateSource).toBe('model');
    const needs = methodNeeds(advice.best!.method, state, prices);
    expect(needs.some(n => n.type === 'item' && n.name === 'Fire rune')).toBe(false);
    expect(needs.some(n => n.type === 'item' && n.name === 'Mind rune')).toBe(true);
    const food = needs.filter(n => n.type === 'item' && FOODS.some(f => f.name === n.name));
    expect(food).toHaveLength(1);
    expect(food[0]).toMatchObject({ type: 'item', name: 'Trout', count: expect.any(Number) });
    expect(food[0].type === 'item' && food[0].count! >= 5).toBe(true);
    expect(needs).toEqual(advice.best!.method.needs);
  });
  it('keeps a usable partial recipe together, refilling only when no complete action remains', () => {
    const state = character();
    const method: TrainingMethod = { ...trainingMethods.find(m => m.id === 'ck-meat')!, consumables: [{ name: 'Future material', qty: 1 }, { name: 'Future solvent', qty: 2 }],
      needs: [{ type: 'item', name: 'Future material', count: 8 }, { type: 'item', name: 'Future solvent', count: 16 }, { type: 'item', name: 'Future tool', count: 1 }] };
    state.owned!.items.set('future material', { name: 'Future material', carried: 2, noted: 0, bank: 100 });
    state.owned!.items.set('future solvent', { name: 'Future solvent', carried: 3, noted: 0, bank: 100 });
    const needs = preparationNeeds(picked(method), state, prices);
    expect(needs).toContainEqual({ type: 'item', name: 'Future material', count: 1 });
    expect(needs).toContainEqual({ type: 'item', name: 'Future solvent', count: 2 });
    expect(needs).toContainEqual({ type: 'item', name: 'Future tool', count: 1 });
    state.owned!.items.set('future solvent', { name: 'Future solvent', carried: 1, noted: 0, bank: 100 });
    expect(preparationNeeds(picked(method), state, prices)).toEqual(method.needs);
  });
  it('food consumption does not demand a bank trip after every bite; low stock restores the refill quantity', () => {
    const state = character();
    const method = { ...trainingMethods.find(m => m.id === 'me-cow')!, needs: [{ type: 'item' as const, name: 'Salmon', count: 10 }] };
    state.owned!.items.set('salmon', { name: 'Salmon', carried: 9, noted: 0, bank: 100 });
    const continuing = preparationNeeds(picked(method), state, prices);
    expect(continuing.find(n => n.type === 'item' && n.name === 'Salmon')).toMatchObject({ count: 9 });
    state.owned!.items.set('salmon', { name: 'Salmon', carried: 1, noted: 0, bank: 100 });
    expect(preparationNeeds(picked(method), state, prices).find(n => n.type === 'item' && n.name === 'Salmon')).toMatchObject({ count: 10 });
    const base: Step = { id: 'S0-01', stage: 0, type: 'skill', title: 'Attack to40', doneWhen: 'Attack40', requires: [], followsMethod: 'attack',
      inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }] } } };
    const a = withTrainingMethod(base, { methodId: method.id, untilLevel: 35, needs: continuing });
    const b = withTrainingMethod(base, { methodId: method.id, untilLevel: 35, needs: continuing.map(n => n.type === 'item' && n.name === 'Salmon' ? { ...n, count: 8 } : n) });
    expect(a.trainingPhase).toBe(b.trainingPhase);
  });
});
