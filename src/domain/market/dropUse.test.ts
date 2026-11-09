import { describe, expect, it } from 'vitest';
import { dropUse } from './dropUse';

describe('what to do with a drop', () => {
  // Owner report 2026-11-09: the app said nothing about the Big bones of frogs and giants, sell or bury.
  it('buries bones toward a Prayer goal above the current level, sells them otherwise', () => {
    expect(dropUse('Big bones', { prayer: 20, prayerGoal: 31, coinsEach: 290 })).toMatchObject({ action: 'bury' });
    expect(dropUse('Big bones', { prayer: 20, prayerGoal: 31, coinsEach: 290 }).text).toMatch(/15 Prayer XP each toward Prayer 31/);
    expect(dropUse('Big bones', { prayer: 31, prayerGoal: 31, coinsEach: 290 })).toMatchObject({ action: 'sell' });
    expect(dropUse('Big bones', { prayer: 20, prayerGoal: null, coinsEach: 290 }).text).toMatch(/about 290 gp each after tax; no Prayer goal needs them/);
  });

  it('buries bones that sell for nothing and leaves other worthless drops', () => {
    expect(dropUse('Big bones', { prayer: 20, prayerGoal: null, coinsEach: null })).toMatchObject({ action: 'bury' });
    expect(dropUse('Cowhide', { prayer: 20, prayerGoal: 31, coinsEach: 100 })).toMatchObject({ action: 'sell' });
    expect(dropUse('Raw beef', { prayer: 20, prayerGoal: null, coinsEach: null })).toMatchObject({ action: 'leave' });
  });
});
