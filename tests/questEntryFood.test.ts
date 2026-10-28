import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { itemPreflight } from '../src/lib/preflight';
import { entryFoodStep } from '../src/lib/loadoutPhase';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { aggregateShopping } from '../src/lib/shopping';
import { shopRows } from '../src/lib/shoppingView';
import { protectionsFor } from '../src/lib/funding/snapshot';
import { bankWithdrawalsOf } from '../src/lib/prepEnvelope';
import { toInGameTarget } from '../src/services/runeliteBridge';
import type { OwnedState } from '../src/lib/checklist';

const step = stepById.get('S9-01')!;
const cursor = (stageAt = 2, lineIndex = 0) => ({ stepId: step.id, stageAt, lineIndex, peeking: false });
function engine(stageAt = 2, lineIndex = 0, magic: number | null = 13, connected = true, bankKnown = true) {
  const progress = { ...emptyProgress(), steps: { 'S8-04': 'done' as const } };
  const owned: OwnedState = { bankSeen: bankKnown, items: new Map([
    ...(step.itemsRequired ?? []).map(item => [item.nameEn.toLowerCase(), { name: item.nameEn, carried: item.inStep ? 0 : Number(item.amount), noted: 0, ...(bankKnown ? { bank: 0 } : {}) }] as const),
    ...['Tuna', 'Trout', 'Salmon', 'Lobster'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, ...(bankKnown ? { bank: name === 'Salmon' ? 5 : 0 } : {}) }] as const),
  ]) };
  const state = buildPlayerState({ mode: 'members', connected, progress, stats: { crafting: 31, woodcutting: 36, hitpoints: 31, ...(magic !== null ? { magic } : {}) }, owned, gear: null, questsDone: null });
  return createReadinessEngine({ steps: [step], state, mode: 'members', qp: 100, progress, questInstruction: cursor(stageAt, lineIndex) });
}

describe('confirmed quest entry food through the existing readiness engine', () => {
  it('shares the banked alternative with preparation, Shopping and funding protection', () => {
    const e = engine();
    expect(e.readiness(step).requirements.find(req => req.item === 'Tuna')).toMatchObject({ state: 'BANK' });
    const plan = e.plan(step, { ahead: 0 });
    expect(plan.now.find(line => line.name === 'Tuna')?.action?.label).toContain('5 Salmon');
    expect(bankWithdrawalsOf(plan)).toContainEqual({ itemId: 329, itemName: 'Salmon', quantity: 5 });
    const rows = shopRows(aggregateShopping(e.ctx.steps), { state: e.ctx.state, onGe: () => true, detail: () => undefined, gePrice: () => 50 });
    expect(rows.find(row => row.name === 'Tuna')).toMatchObject({ channel: 'bank', action: 'Take 5 Salmon at the bank' });
    expect(protectionsFor(e.ctx.steps, e.ctx.state).get('salmon')?.qty).toBeGreaterThanOrEqual(5);
    expect(step.itemsRequired?.some(item => item.nameEn === 'Tuna')).toBe(false);
    expect(step.itemsRecommended?.some(item => item.nameEn === 'Tuna')).toBe(true);
  });

  it.each([[0, 0], [2, 2], [3, 2]])('does not keep an entry purchase active at %s.%s', (stage, line) => {
    const e = engine(stage, line);
    expect(e.ctx.steps[0]).toBe(step);
    expect(e.plan(step, { ahead: 0 }).now.some(item => item.name === 'Tuna')).toBe(false);
    expect(aggregateShopping(e.ctx.steps).required.some(item => item.nameEn === 'Tuna')).toBe(false);
  });

  it('does not turn unread alternatives into a purchase shortage', () => {
    const e = engine(2, 0, 13, true, false);
    expect(e.readiness(step).requirements.find(req => req.item === 'Tuna')).toMatchObject({ state: 'UNKNOWN' });
  });

  it('checks the chosen Fire Strike strategy and preserves an unknown Magic level', () => {
    expect(engine(2, 0, 12).readiness(step).requirements.find(req => req.stat?.skill === 'magic')).toMatchObject({ state: 'MISSING' });
    expect(engine(2, 0, 13).readiness(step).requirements.find(req => req.stat?.skill === 'magic')).toMatchObject({ state: 'OK' });
    expect(engine(2, 0, null).readiness(step).requirements.find(req => req.stat?.skill === 'magic')).toMatchObject({ state: 'UNKNOWN' });
  });

  it('rejects previews, mismatched cursors and disconnected proof without replacing declared food budgets', () => {
    expect(entryFoodStep(step, { ...cursor(), peeking: true })).toBe(step);
    expect(entryFoodStep(step, { ...cursor(), stepId: 'other' })).toBe(step);
    expect(entryFoodStep(step, cursor(999, 0))).toBe(step);
    expect(engine(2, 0, 13, false).ctx.steps[0]).toBe(step);
    const declared = { ...step, itemsRequired: [...(step.itemsRequired ?? []), { nameEn: 'Salmon', amount: 20, heals: 9, howToGet: 'Bank' }] };
    expect(entryFoodStep(declared, cursor())).toBe(declared);
  });

  it('watches optional food and every declared entry alternative in the game', () => {
    expect(toInGameTarget(step)?.watchItems).toEqual(expect.arrayContaining(['Tuna', 'Trout', 'Salmon', 'Lobster']));
  });
  it('names physical alternative withdrawals and known food notes without claiming an unread bank', () => {
    const pre = { pre: [{ item: 'Tuna', id: 361, n: 4, alt: ['Salmon'] }] };
    const from = { x: 3047, y: 3236, plane: 0 };
    expect(itemPreflight(pre, { carried: [], bank: [{ id: 329, name: 'Salmon', count: 5 }], from })).toMatchObject({ via: 'bank', instruction: 'Take 5 Salmon from the bank' });
    expect(itemPreflight(pre, { carried: [{ id: 362, name: 'Tuna', count: 4, noted: true }], bank: null, from })).toMatchObject({ via: 'bank', have: 0, instruction: 'Withdraw or unnote 4 Tuna from the bank' });
    expect(itemPreflight(pre, { carried: [], bank: [{ id: 329, name: 'Salmon', count: 5 }], bankCurrent: false, from })?.via).toBe('check-bank');
  });

});
