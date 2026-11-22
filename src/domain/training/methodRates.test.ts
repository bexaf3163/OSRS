import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';
import { scopedRateKeyOf } from './methodRates';
import { trainingItemScope } from './trainingRouter';

const stateOf = (levels: Record<string, number>, items: Record<string, number>, quests: string[] = []) => buildPlayerState({
  mode: 'members', connected: true, player: 'P', stats: { attack: 40, strength: 40, defence: 40, hitpoints: 40, ranged: 40, magic: 40, prayer: 40, crafting: 20, woodcutting: 20, ...levels },
  progress: emptyProgress(), questsDone: quests, owned: { bankSeen: true, items: new Map(Object.entries(items).map(([k, n]) => [k.toLowerCase(), { carried: n, noted: 0, bank: 0 }])) },
  gear: { equipment: [], inventory: [], coins: 0, bankCoins: 1000 },
} as never);

describe('scopedRateKeyOf', () => {
  const crafting = trainingItemScope('crafting');
  const key = (levels: Record<string, number>, items: Record<string, number>, quests?: string[]) => scopedRateKeyOf(stateOf(levels, items, quests), crafting);

  it('ignores items, levels and quests Crafting training never reads', () => {
    expect(key({}, { 'Leather': 5, 'Logs': 1 }, ['Cook\'s Assistant'])).toBe(key({ woodcutting: 30 }, { 'Leather': 5, 'Logs': 9 }));
  });

  it('keeps what Crafting reads: its materials, its own and combat levels, and quests an engine checks', () => {
    const base = key({}, { 'Leather': 5 });
    expect(key({}, { 'Leather': 6 })).not.toBe(base);
    expect(key({ crafting: 21 }, { 'Leather': 5 })).not.toBe(base);
    expect(key({ attack: 41 }, { 'Leather': 5 })).not.toBe(base);
    expect(key({}, { 'Leather': 5 }, ['Dragon Slayer I'])).not.toBe(base);
  });
});
