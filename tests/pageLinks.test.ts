import { describe, expect, it } from 'vitest';
import { hrefTo, stepIdOf } from '../src/domain/pages/pages';
import { parseHash } from '../src/app/router';

describe('page links', () => {
  it('builds the same link shapes the router reads back', () => {
    expect(hrefTo.path()).toBe('#/');
    expect(hrefTo.step('S2-03')).toBe('#/step/S2-03');
    expect(hrefTo.skills()).toBe('#/skills');
    expect(hrefTo.skills('ME')).toBe('#/skills/ME');
    expect(hrefTo.skills('ME', 'defence')).toBe('#/skills/ME/defence');
    expect(hrefTo.skills('ME', 'defence', 40)).toBe('#/skills/ME/defence?goal=40');
    expect(hrefTo.reference()).toBe('#/reference');
    expect(hrefTo.reference('transport')).toBe('#/reference/transport');
    expect(parseHash(hrefTo.step('S2-03'))).toMatchObject({ page: 'path', step: 'S2-03' });
    expect(parseHash(hrefTo.skills('ME', 'defence', 40))).toMatchObject({ page: 'skills', param: 'ME', skill: 'defence', goal: 40 });
    expect(parseHash(hrefTo.reference('plugins'))).toMatchObject({ page: 'reference', param: 'plugins' });
    for (const page of ['quests', 'journal', 'settings', 'shopping', 'gear', 'money'] as const) expect(parseHash(hrefTo[page]())).toMatchObject({ page });
  });

  it('reads the step of a step link only', () => {
    expect(stepIdOf(hrefTo.step('S1-07'))).toBe('S1-07');
    expect(stepIdOf(hrefTo.shopping())).toBeNull();
  });
});
