import { describe, expect, it } from 'vitest';
import { adviseTraining, methodNeeds, preparationNeeds, trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { gearData } from '../src/services/gearAdvisor';
import { FOODS } from '../src/lib/foodAdvice';
import type { PriceView } from '../src/lib/funding/quotes';
import type { MethodView, TrainingMethod } from '../src/lib/trainingRouter';
import { withTrainingMethod } from '../src/lib/methodStep';
import type { Step } from '../src/types';
import { methodRate } from '../src/lib/methodRates';
import { toInGameTarget } from '../src/services/runeliteBridge';
import { combatUpgrades } from '../src/lib/combatRates';

const quote = { price: 1, basis: 'side' as const, confidence: 'HIGH' as const, ageMinutes: 0, volumePerHour: null, notes: [] };
const prices: PriceView = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, buy: () => quote, sell: () => quote };
const character = (magic = false, defence = 1, magicLevel = 13, hitpoints = 24) => buildPlayerState({ mode: 'f2p', connected: true, player: 'Kit Test', progress: emptyProgress(), questsDone: [],
  stats: { attack: 30, strength: 21, defence, hitpoints, magic: magicLevel },
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
    const label = viewMethod(advice.best!.method, state, prices).method.name;
    expect(label).toContain('Hill Giant');
    expect(label).not.toContain('Cow');
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
  it.each(['Staff of air', 'Staff of fire'])('an evaluated %s purchase prepares its own rune recipe without discarding access or food', staff => {
    const state = character(true), before = structuredClone(state);
    const method: TrainingMethod = { ...trainingMethods.find(m => m.kit === 'strike-spell')!, rateSource: 'model', needs: [
      { type: 'skill', skill: 'magic', min: 1 }, { type: 'quest', quest: 'Future access quest' },
      { type: 'item', name: 'Air rune', count: 20 }, { type: 'item', name: 'Mind rune', count: 20 },
      { type: 'item', name: 'Staff of fire', equip: true }, { type: 'item', name: 'Law rune', count: 1 },
      { type: 'item', name: 'Future access key', count: 1 }, { type: 'item', name: 'Trout', count: 5, refill: 5 },
    ] };
    const needs = preparationNeeds({ ...picked(method), upgrade: { tool: staff, price: 100, hours: 1 } }, state, prices);
    expect(needs).toContainEqual({ type: 'item', name: staff, count: 1, equip: true });
    expect(needs).toContainEqual({ type: 'item', name: 'Mind rune', count: 20 });
    expect(needs).toContainEqual({ type: 'quest', quest: 'Future access quest' });
    expect(needs).toContainEqual({ type: 'item', name: 'Law rune', count: 1 });
    expect(needs).toContainEqual({ type: 'item', name: 'Future access key', count: 1 });
    expect(needs.filter(n => n.type === 'item' && FOODS.some(food => food.name === n.name))).toHaveLength(1);
    expect(needs.some(n => n.type === 'item' && n.name === 'Fire rune')).toBe(false);
    if (staff === 'Staff of air') expect(needs.some(n => n.type === 'item' && n.name === 'Air rune')).toBe(false);
    else expect(needs).toContainEqual({ type: 'item', name: 'Air rune', count: 40 });
    expect(state).toEqual(before);
  });
  it('a worthwhile Magic weapon purchase reaches preparation through the existing upgrade evaluator', () => {
    const state = character(true);
    state.equipment = {}; state.equipmentItems = [];
    state.owned!.items.set('staff of fire', { name: 'Staff of fire', carried: 0, noted: 0, bank: 0 });
    const before = structuredClone(state);
    const method = trainingMethods.find(m => m.kit === 'strike-spell')!;
    const advice = adviseTraining({ skill: 'magic', target: 40, mode: 'f2p', state, style: 'efficient', priority: 'balanced', methods: [method], prices });
    expect(advice.upgrade?.tool).toMatch(/^Staff of (air|water|earth|fire)$/);
    expect(preparationNeeds(advice, state, prices)).toContainEqual({ type: 'item', name: advice.upgrade!.tool, count: 1, equip: true });
    expect(advice.upgrade?.kitCost).toBe(5);
    expect(state).toEqual(before);
  });
  it('owned verified Magic clothing joins the same kit and the recovery model uses the prepared outfit', () => {
    const state = character(true);
    state.equipment = { ...state.equipment, head: 'Iron full helm', body: 'Iron platebody' };
    const clothes = ['Blue wizard hat', 'Blue wizard robe', 'Amulet of magic'];
    for (const name of clothes) state.owned!.items.set(name.toLowerCase(), { name, carried: 0, noted: 0, bank: 1 });
    const before = structuredClone(state);
    const method = trainingMethods.find(m => m.kit === 'strike-spell')!;
    const needs = preparationNeeds(picked(method), state, prices);
    for (const name of clothes) expect(needs).toContainEqual({ type: 'item', name, count: 1, equip: true });
    const planned = methodRate(method, 'magic', state, { prices });
    const prepared = structuredClone(state);
    for (const need of planned!.needs ?? []) {
      const piece = need.type === 'item' && need.equip ? gearData.items.find(piece => piece.name === need.name) : null;
      if (piece) prepared.equipment[piece.slot] = piece.name;
    }
    const worn = methodRate(method, 'magic', prepared, { prices });
    expect(planned).not.toBeNull();
    expect(planned!.xph).toEqual(worn!.xph);
    expect(planned!.costPerHour).toBe(worn!.costPerHour);
    expect(state).toEqual(before);
  });
  it('unread clothing is not a confirmed improvement and F2P clothing does not override a Members outfit', () => {
    const state = character(true), method = trainingMethods.find(m => m.kit === 'strike-spell')!;
    const name = 'Blue wizard robe';
    state.owned!.items.set(name.toLowerCase(), { name, carried: 0, noted: 0 });
    expect(preparationNeeds(picked(method), state, prices).some(n => n.type === 'item' && n.name === name)).toBe(false);
    state.owned!.items.set(name.toLowerCase(), { name, carried: 0, noted: 0, bank: 1 });
    state.mode = 'members';
    expect(preparationNeeds(picked(method), state, prices).some(n => n.type === 'item' && n.name === name)).toBe(false);
  });
  it('worthwhile paid Magic clothing uses the existing equipment evaluator and its complete physical recovery kit', () => {
    // A counterfactual trained defensive profile proves reuse for a future trainer, not a novice Giant recommendation.
    const state = character(true, 99, 3, 99);
    state.equipment = { ...state.equipment, weapon: 'Staff of air', head: 'Iron full helm', body: 'Iron platebody' };
    state.equipmentItems = [{ name: 'Staff of air', count: 1 }, { name: 'Iron full helm', count: 1 }, { name: 'Iron platebody', count: 1 }];
    state.owned!.items.set('staff of fire', { name: 'Staff of fire', carried: 0, noted: 0, bank: 0 });
    const before = structuredClone(state), method = { ...trainingMethods.find(m => m.kit === 'strike-spell')!, id: 'future-magic-trainer', npcNames: ['Hill Giant'] };
    const advice = adviseTraining({ skill: 'magic', target: 40, mode: 'f2p', state, style: 'efficient', priority: 'balanced', methods: [method], prices });
    expect(advice.upgrade?.tool).toMatch(/^(Black robe|Blue wizard robe)$/);
    expect(advice.upgrade?.needs?.some(n => n.type === 'item' && FOODS.some(food => food.name === n.name))).toBe(true);
    expect(preparationNeeds(advice, state, prices)).toContainEqual({ type: 'item', name: advice.upgrade!.tool, count: 1, equip: true });
    expect(state).toEqual(before);
  });
  it('does not sell a clothing change merely for a larger Magic bonus when the full trainer model rejects it', () => {
    const state = character(true, 33);
    state.equipment = { ...state.equipment, head: 'Iron full helm', body: 'Iron platebody' };
    const method = trainingMethods.find(m => m.kit === 'strike-spell')!;
    expect(combatUpgrades(method, 'magic', state, { prices }).some(offer => /^(Black robe|Blue wizard robe)$/.test(offer.tool))).toBe(false);
  });
  it('current preparation alternatives take precedence over a broad skill catalogue within the existing watch bound', () => {
    const aliases = Array.from({ length: 30 }, (_, index) => `Future equivalent ${index}`);
    const step: Step = { id: 'S0-06', stage: 0, type: 'skill', title: 'Future Magic preparation', doneWhen: 'Magic40', requires: [], followsMethod: 'magic',
      itemsRequired: [{ nameEn: 'Future material', amount: 1, howToGet: '', anyOf: aliases }],
      inGame: { goal: 'Prepare the current recipe', completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'magic', level: 40 }] } } };
    const target = toInGameTarget(step)!;
    for (const name of aliases) expect(target.watchItems).toContain(name);
    expect(target.watchItems!.length).toBeLessThanOrEqual(40);
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
