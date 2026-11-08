import { describe, expect, it } from 'vitest';
import { parsePlanningIntent, readPlanningIntent } from './intent';

describe('explicit planner intent format', () => {
  it('preserves explicit targets and account filters rather than substituting a default checkpoint', () => {
    const goal = { version: 1, intent: { kind: 'training', training: { skill: 'ranged', mode: 'fast', target: 63, freeOnly: true } } };
    expect(parsePlanningIntent(goal)).toEqual(goal);
    expect(readPlanningIntent(JSON.stringify(goal))).toMatchObject({ protected: false, value: goal });
    expect(parsePlanningIntent({ version: 1, intent: { kind: 'quest', questId: 'Dragon Slayer I' } })?.intent.kind).toBe('quest');
  });
  it('keeps missing, damaged and newer saves distinct', () => {
    expect(readPlanningIntent(null)).toEqual({ value: null, protected: false, warning: null });
    expect(readPlanningIntent('{broken')).toMatchObject({ value: null, protected: true });
    expect(readPlanningIntent('{"version":2,"intent":{"kind":"auto"}}')).toMatchObject({ value: null, protected: true, warning: expect.stringContaining('newer') });
    expect(parsePlanningIntent({ version: 1, intent: { kind: 'training', training: { skill: 'ranged', mode: 'fast', target: 100 } } })).toBeNull();
    expect(parsePlanningIntent({ version: 1, intent: { kind: 'quest', questId: '<invalid>' } })).toBeNull();
  });
});
