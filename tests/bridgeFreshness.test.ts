import { describe, expect, it } from 'vitest';
import { BridgeFreshness } from '../src/lib/bridgeFreshness';

describe('status and event freshness', () => {
  it('preserves newer gear without dropping an unrelated status fact', () => {
    const clock = new BridgeFreshness();
    const request = clock.capture();
    clock.event('GEAR');
    expect(clock.accepts(request, 'GEAR')).toBe(false);
    expect(clock.accepts(request, 'QUESTS')).toBe(true);
    expect(clock.unchanged(request)).toBe(false);
    expect(clock.accepts(clock.capture(), 'GEAR')).toBe(true);
  });
  it('rejects every old fact after logout, character change or reconnect', () => {
    const clock = new BridgeFreshness();
    clock.event('STATS');
    const old = clock.capture();
    clock.reset();
    expect(clock.accepts(old)).toBe(false);
    expect(clock.accepts(old, 'STATS')).toBe(false);
    expect(clock.accepts(clock.capture(), 'STATS')).toBe(true);
  });
});
