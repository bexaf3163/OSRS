import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { AXES, PICKAXES } from '../src/lib/toolTiers';
import { methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { preflightItems, nameKey, type OwnedState } from '../src/lib/checklist';
import { emptyProgress } from '../src/lib/progress';
import { stepReadiness } from '../src/lib/readiness';
import { toInGameTarget } from '../src/services/runeliteBridge';
import type { Step } from '../src/types';

function training(skill: 'mining' | 'woodcutting'): Step {
  return { ...stepById.get('S6-02')!, id: `TEST-${skill}`, followsMethod: skill, requires: [],
    requirements: [], itemsRecommended: [],
    inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill, level: 60 }] } },
  };
}

function toolRow(skill: 'mining' | 'woodcutting', level: number, item: string | null, where: 'carried' | 'bank' | 'noted' = 'carried', complete = true) {
  const base = training(skill);
  const step = withTrainingMethod(base, skill === 'mining' ? 'mi-ore' : 'wc-tree');
  const family = skill === 'mining' ? PICKAXES : AXES;
  const owned: OwnedState = { bankSeen: true, items: new Map(family.filter(n => complete || n === family[0]).map(name => [nameKey(name), {
    name, carried: name === item && where === 'carried' ? 1 : 0,
    noted: name === item && where === 'noted' ? 1 : 0,
    bank: name === item && where === 'bank' ? 1 : 0,
  }])) };
  const readiness = stepReadiness({ step, steps: [step], progress: emptyProgress(), qp: 100, mode: 'f2p',
    stats: { [skill]: level, attack: 1 }, owned, gear: null });
  return readiness.requirements.find(r => r.kind === 'item' && r.label.includes(family[0]));
}

describe('generic training tool requirements', () => {
  it.each([
    ['mining', 'mi-ore', 'Bronze pickaxe', 1265, PICKAXES],
    ['woodcutting', 'wc-tree', 'Bronze axe', 1351, AXES],
  ] as const)('%s projects a usable tool family instead of discarding the need', (skill, pick, name, id, family) => {
    const step = withTrainingMethod(training(skill), pick);
    expect(step.itemsRequired).toHaveLength(1);
    expect(step.itemsRequired![0]).toMatchObject({ nameEn: name, amount: 1, wikiItemId: id });
    expect(preflightItems(step)[0].alt).toEqual(family.slice(1));
    const payload = toInGameTarget(step)!;
    expect(payload.checklist).toEqual([expect.objectContaining({ name, count: 1, alt: family.slice(1) })]);
    expect(payload.watchItems).toEqual(expect.arrayContaining([...family]));
    expect(methodToolNames(step)).toEqual(expect.arrayContaining([...family]));
  });
  it.each(['mining', 'woodcutting'] as const)('%s rejects a tier above the known use level', skill => {
    expect(toolRow(skill, 10, skill === 'mining' ? 'Rune pickaxe' : 'Rune axe')?.state).toBe('MISSING');
  });
  it.each(['mining', 'woodcutting'] as const)('%s accepts a usable carried tier without imposing its Attack wield requirement', skill => {
    expect(toolRow(skill, 41, skill === 'mining' ? 'Rune pickaxe' : 'Rune axe')?.state).toBe('OK');
  });
  it('banked and noted tools require preparation rather than declaring departure ready', () => {
    expect(toolRow('mining', 41, 'Rune pickaxe', 'bank')?.state).toBe('BANK');
    expect(toolRow('woodcutting', 41, 'Rune axe', 'noted')?.state).toBe('BANK');
  });
  it('unreported alternatives remain unknown even when the bronze tool is confirmed absent', () => {
    expect(toolRow('mining', 41, null, 'carried', false)?.state).toBe('UNKNOWN');
  });
  it('a method from another skill cannot replace the authored step requirements or destination', () => {
    const step = training('woodcutting');
    expect(withTrainingMethod(step, 'fi-fly')).toBe(step);
  });
});
