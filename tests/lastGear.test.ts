import { describe, expect, it } from 'vitest';
import { parseLastGear } from '../src/bridge';

const gear = { equipment: [{ id: 1351, name: 'Bronze axe', slot: 'weapon' }], inventory: [{ id: 995, name: 'Coins', count: 250 }], coins: 250, bankCoins: 1000 };

describe('last known gear (a record to show without a connection)', () => {
  it('is read whole', () => {
    const l = parseLastGear({ at: 1_700_000_000_000, player: 'Mark', gear });
    expect(l?.player).toBe('Mark');
    expect(l?.gear.coins).toBe(250);
    expect(l?.gear.bankCoins).toBe(1000);
    expect(l?.gear.equipment?.[0].name).toBe('Bronze axe');
  });

  it('garbage in the storage — as if nothing was recorded', () => {
    for (const bad of [null, 'x', [], {}, { at: 1, player: 'Mark' }, { at: 'yesterday', player: 'Mark', gear }, { at: 0, player: 'Mark', gear },
      { at: 1, player: '', gear }, { at: 1, player: 'x'.repeat(41), gear }, { at: 1, player: 'Mark', gear: {} }, { at: 1, player: 5, gear }]) {
      expect(parseLastGear(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
