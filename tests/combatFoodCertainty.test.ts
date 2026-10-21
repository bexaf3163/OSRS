import { describe, expect, it } from 'vitest';
import { combatPlanView, ownedFood } from '../src/lib/combatPlan';
import { combatReadiness } from '../src/lib/combatReadiness';
import { nameKey } from '../src/lib/checklist';
import { planInput } from './combatRoute/fixture';

const inputFor = () => {
  const input = planInput({ stepId: 'S3-08' });
  const food = input.step.itemsRequired!.find(i => i.heals)!;
  for (const name of [food.nameEn, ...(food.anyOf ?? [])]) {
    input.owned!.items.set(nameKey(name), { name, carried: 0, noted: 0, bank: 0 });
  }
  return input;
};
const viewOf = (input: ReturnType<typeof inputFor>) => combatPlanView(input.step, { ...input.ctx, owned: input.owned })!;
const foodOf = (input: ReturnType<typeof inputFor>) => combatReadiness(input.step, viewOf(input), input.ctx.gear!, input.owned!.bankSeen)!.food;

describe('combat food purchase certainty', () => {
  it.each(['absent', 'unreported'] as const)('an %s alternative leaves the deficit unknown despite an opened bank', kind => {
    const input = inputFor();
    if (kind === 'absent') input.owned!.items.delete('lobster');
    else input.owned!.items.get('lobster')!.bank = undefined;
    expect(viewOf(input).buy).toBeNull();
    expect(foodOf(input).toBuy).toBeNull();
  });

  it('does not count stale bank food when this session has not read the bank', () => {
    const input = inputFor();
    input.owned!.bankSeen = false;
    input.owned!.items.get('salmon')!.bank = 1000;
    const held = ownedFood(input.step, input.owned)!;
    expect(held).toMatchObject({ equivalent: 0, bankEq: 0, bankComplete: false });
    expect(viewOf(input).buy).toBeNull();
  });

  it('enough confirmed carried food proves no purchase is needed even with an unread bank', () => {
    const input = inputFor();
    input.owned!.bankSeen = false;
    input.owned!.items.get('salmon')!.carried = 1000;
    expect(viewOf(input).buy).toBe(0);
    expect(foodOf(input).toBuy).toBe(0);
  });

  it('confirmed bank food can cover the next trip without every alternative being known', () => {
    const input = inputFor();
    input.owned!.items.delete('lobster');
    input.owned!.items.get('salmon')!.bank = 26;
    expect(viewOf(input).buy).toBeNull();
    expect(foodOf(input)).toMatchObject({ fromBank: 26, toBuy: 0 });
    expect(foodOf(input).text).toMatch(/^Bank: withdraw 26 Salmon/);
  });

  it('partially sufficient confirmed bank stock does not invent a purchase for the remainder', () => {
    const input = inputFor();
    input.owned!.items.delete('lobster');
    input.owned!.items.get('salmon')!.bank = 13;
    expect(foodOf(input)).toMatchObject({ fromBank: 13, toBuy: null });
    expect(foodOf(input).text).toMatch(/withdraw 13.*check/);
  });

  it('explicit complete zeroes permit a real purchase deficit', () => {
    const input = inputFor();
    const view = viewOf(input);
    expect(view.owned).toMatchObject({ bankComplete: true, equivalent: 0 });
    expect(view.buy).toBe(view.plan);
    expect(foodOf(input)).toMatchObject({ fromBank: 0, toBuy: 26 });
  });
});
