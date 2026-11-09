import type { Step } from '../src/types';
import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { aggregateShopping } from '../src/domain/prep/shopping';
import { RETIRED_STEPS, normalizeProgress } from '../src/domain/persistence/progress';
import { stepOrRetired } from './fixtures/retiredSteps';

// The free-to-play quest route: no Defence grind before Dragon Slayer I, food bought, retired steps gone.

const step = (id: string): Step => stepOrRetired(id);

describe('no Defence grind before Dragon Slayer I', () => {
  it('no step before Dragon Slayer I asks for a Defence level', () => {
    for (const s of allSteps.filter((x) => !x.membersOnly && x.id < 'S5-08')) {
      const defence = (s.inGame?.completionTrigger?.levels ?? []).filter((l) => l.skill === 'defence');
      expect(defence, s.id).toEqual([]);
      expect(s.targets?.some((t) => t.skill === 'defence') ?? false, s.id).toBe(false);
    }
  });

});

describe('lobsters and the lobster pot', () => {
  it('the lobsters are counted once in the shopping list: the voyage step buys them', () => {
    const route = allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09');
    const list = aggregateShopping(route);
    const lobster = list.required.find((l) => l.nameEn === 'Lobster')!;
    expect(lobster.count).toBe(20);
    expect(step('S5-08').itemsRequired!.find((i) => i.nameEn === 'Lobster')!.howToGet).toMatch(/Grand Exchange/);
  });

  it('the one Lobster pot the route needs is the Oracle one', () => {
    const owners = allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09' && x.itemsRequired?.some((i) => i.nameEn === 'Lobster pot')).map((x) => x.id);
    expect(owners).toEqual(['S5-04']);
  });
});

describe('S3-09 and S2-13 are out of the route', () => {
  it('neither step exists, and no step requires or names them', () => {
    expect(stepById.has('S3-09')).toBe(false);
    expect(stepById.has('S2-13')).toBe(false);
    for (const s of allSteps) {
      expect(s.requires, s.id).not.toContain('S3-09');
      expect(JSON.stringify(s), s.id).not.toMatch(/S3-09|S2-13/);
    }
    expect(RETIRED_STEPS).toEqual(['S1-11', 'S2-13', 'S3-09', 'S1-08', 'S1-12', 'S2-04', 'S3-08', 'S4-03', 'S6-01', 'S6-02', 'S6-03', 'S6-04', 'S7-04', 'S8-03', 'S8-04', 'S8-06',
      'S1-01', 'S1-02', 'S1-10', 'S1-13', 'S2-01', 'S3-06', 'S3-07', 'S4-04', 'S4-05', 'S5-02', 'S6-05']);
  });

  it('a save that still holds them loads without them', () => {
    const known = { stepIds: new Set(allSteps.map((s) => s.id)), levelIds: new Set<string>() };
    const n = normalizeProgress({ version: 3, steps: { 'S3-09': 'done', 'S2-13': 'done', 'S3-05': 'done' } }, known)!;
    expect(Object.keys(n.progress.steps)).toEqual(['S3-05']);
  });

  it('the food that was to be fished is bought: Salmon says Grand Exchange, never a step', () => {
    // S3-08 and S4-03 carry the Salmon in the required kit since 2.55.1; it is still bought.
    for (const id of ['S3-08', 'S4-01', 'S4-02', 'S4-03']) {
      const salmon = [...(step(id).itemsRequired ?? []), ...(step(id).itemsRecommended ?? [])].find((i) => i.nameEn === 'Salmon')!;
      expect(salmon.howToGet, id).toMatch(/^Buy on the Grand Exchange/);
    }
  });
});

describe('S5-05: Wormbrain is paid 10,000 gp', () => {
  const lines = () => step('S5-05').questStages!.stages.flatMap((s) => s.do);

  it('the step requires only S5-01, asks for 10,000 coins, and has no spell, no fight and no runes', () => {
    const s = step('S5-05');
    expect(s.requires).toEqual(['S5-01']);
    expect(s.itemsRequired!.map((i) => [i.nameEn, i.amount])).toEqual([['Coins', 10000]]);
    const text = JSON.stringify([s.how, s.quickSteps, s.fields, s.questStages]);
    expect(text).toMatch(/10,000/);
    expect(text).not.toMatch(/Telekinetic|Magic 33|Wind Strike|Fire Strike|Law rune|law rune/);
    expect(lines().find((l) => l.k === 'optionsForLozarPiece')!.s).toBe('Wormbrain (Port Sarim Jail): pay 10,000 gp');
  });

  it('no step up to the finale asks for Magic 33', () => {
    for (const s of allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09')) {
      expect(s.targets?.some((t) => t.skill === 'magic' && t.level >= 33) ?? false, s.id).toBe(false);
      const levels = s.inGame?.completionTrigger?.levels ?? [];
      expect(levels.some((l) => l.skill === 'magic' && l.level >= 33), s.id).toBe(false);
    }
    expect(step('S5-01').fields!.map((f) => f.text).join(' ')).not.toMatch(/Magic 33/);
  });

  it('the bribe is on the shopping list as coins the step itself needs', () => {
    const route = allSteps.filter((x) => !x.membersOnly && x.id <= 'S5-09');
    expect(aggregateShopping(route).coins).toBeGreaterThanOrEqual(10_000);
  });
});
