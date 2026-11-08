import { describe, expect, it } from 'vitest';
import { staffCover } from './castingStaff';

const item = (name: string) => ({ name, id: 0, count: 1 });
const runes = ['air', 'fire', 'law'];
describe('one physical casting loadout', () => {
  it('never combines separate carried staves as simultaneous rune sources', () => {
    const input = { carried: [item('Staff of fire'), item('Staff of air')], members: false };
    expect(staffCover('air', input, runes)).toEqual({ staff: 'Staff of air', worn: false });
    expect(staffCover('fire', input, runes)).toBeNull();
    expect(staffCover('law', input, runes)).toBeNull();
    const worn = { ...input, worn: [item('Staff of fire')] };
    expect(staffCover('fire', worn, runes)).toEqual({ staff: 'Staff of fire', worn: true });
    expect(staffCover('air', worn, runes)).toBeNull();
  });
  it('accepts an observed combination staff for both elements, with verified membership', () => {
    const input = { carried: [], worn: [item('Smoke battlestaff')], members: true };
    for (const rune of ['air', 'fire']) expect(staffCover(rune, input, runes)).toEqual({ staff: 'Smoke battlestaff', worn: true });
    expect(staffCover('air', { ...input, members: null }, runes)).toBeNull();
    expect(staffCover('air', { ...input, members: false }, runes)).toBeNull();
  });
  it('does not promise that an unmodelled inventory staff is usable, or that an empty stack is worn', () => {
    expect(staffCover('air', { carried: [item('Smoke battlestaff')], levels: { attack: 1, magic: 1 }, members: true }, runes)).toBeNull();
    expect(staffCover('air', { carried: [], worn: [{ ...item('Staff of air'), count: 0 }], members: false }, runes)).toBeNull();
  });
});
