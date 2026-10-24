// T03: a members tool tier (Dragon pickaxe kept from an old membership) is not "a pickaxe" on a free-to-play account, at any level; a
// members account and an unknown mode keep counting it. The plugin applies the same rule to the world it is on (ToolLevelTest).
import { describe, expect, it } from 'vitest';
import { parseOwned } from '../src/lib/checklist';
import { buildPlayerState, heldOf, unusableTools } from '../src/lib/playerState';
import { PICKAXES, toolUse, usableAt } from '../src/lib/toolTiers';

const complete = (have: Record<string, number>) => PICKAXES.map((name) => {
  const n = have[name] ?? 0;
  return { name, carried: n, noted: 0, bank: 0, exactCarried: n, exactNoted: 0, exactBank: 0 };
});
const state = (mode: 'f2p' | 'members', have: Record<string, number>) => buildPlayerState({
  mode, stats: { mining: 70 }, progress: { levels: {} }, owned: parseOwned({ bankSeen: true, items: complete(have) }), gear: null, questsDone: null,
});

describe('members tool tiers', () => {
  it('the tier table knows which tiers are members items', () => {
    expect(toolUse('Dragon pickaxe')).toMatchObject({ members: true, level: 61 });
    expect(toolUse('Rune pickaxe')).toMatchObject({ members: false });
    expect(usableAt('Dragon axe', () => 99, false)).toBe(false);
    expect(usableAt('Dragon axe', () => 99, true)).toBe(true);
    expect(usableAt('Dragon axe', () => 99)).toBe(true);
  });

  it('on a free-to-play account a Dragon pickaxe alone is not the tool, and says why', () => {
    const s = state('f2p', { 'Dragon pickaxe': 1 });
    expect(heldOf(s, 'Bronze pickaxe').presence).toBe('MISSING');
    expect(unusableTools(s, 'Bronze pickaxe')).toEqual(['Dragon pickaxe (members only)']);
  });

  it('a usable tier beside it still counts; a members account counts the Dragon pickaxe', () => {
    expect(heldOf(state('f2p', { 'Dragon pickaxe': 1, 'Rune pickaxe': 1 }), 'Bronze pickaxe')).toMatchObject({ presence: 'PRESENT', total: 1 });
    expect(heldOf(state('members', { 'Dragon pickaxe': 1 }), 'Bronze pickaxe')).toMatchObject({ presence: 'PRESENT', total: 1 });
  });
});
