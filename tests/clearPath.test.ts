import { describe, expect, it } from 'vitest';
import reference from '../src/data/reference.json';
import { linkStatus, LINK_LABEL, targetStatus, TARGET_LABEL } from '../src/lib/linkState';

describe('link and target vocabulary', () => {
  it('connected and in game, waiting for the character, offline and off are different states', () => {
    expect(linkStatus('online', true)).toBe('connected');
    expect(linkStatus('online', false)).toBe('waiting-character');
    expect(linkStatus('offline', false)).toBe('offline');
    expect(linkStatus('connecting', false)).toBe('connecting');
    expect(linkStatus('off', false)).toBe('disabled');
    expect(new Set(Object.values(LINK_LABEL)).size).toBe(5);
  });

  it('a saved target is shown in the game only while the link is up', () => {
    expect(targetStatus(false, 'online')).toBe('none');
    expect(targetStatus(true, 'online')).toBe('live');
    for (const s of ['offline', 'connecting', 'off'] as const) expect(targetStatus(true, s)).toBe('saved');
    expect(TARGET_LABEL.saved).not.toMatch(/Shown in the game/);
  });
});

describe('reference advice matches the route', () => {
  it('the "what to do" list does not tell the player to fish and cook for food', () => {
    const text = JSON.stringify(reference);
    expect(text).not.toMatch(/Go fishing and cook/);
    expect(text).toMatch(/this route buys its food/);
  });
});
