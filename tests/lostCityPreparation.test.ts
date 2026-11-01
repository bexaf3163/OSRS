import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { preflightItems } from '../src/domain/prep/stepItems';
import { nameKey } from '../src/domain/items/itemKey';
import { buildPlayerState } from '../src/domain/player/playerState';
import { emptyProgress } from '../src/domain/persistence/progress';
import { createReadinessEngine } from '../src/domain/readiness/readinessEngine';

const step = stepById.get('S9-01')!;

describe('Lost City departure versus dungeon acquisition', () => {
  it('does not require the axe the guide explicitly obtains after boarding Entrana', () => {
    // The magic kit and the way out are carried in (no weapons or armour on Entrana); the axe is found there.
    expect(preflightItems(step).map(i => i.nameEn)).toEqual(['Knife', 'Fire rune', 'Air rune', 'Mind rune', 'Lumbridge teleport']);
    expect(step.itemsRequired?.find(i => i.nameEn === 'Bronze axe')).toMatchObject({ inStep: true });
    for (const bankAxe of [0, 1]) {
      const progress = { ...emptyProgress(), steps: { 'S8-04': 'done' as const } };
      const state = buildPlayerState({
        mode: 'members', connected: true, progress, stats: { crafting: 31, woodcutting: 36 }, questsDone: null, gear: null,
        owned: { bankSeen: true, items: new Map([
          [nameKey('Knife'), { name: 'Knife', carried: 1, noted: 0, bank: 0 }],
          [nameKey('Bronze axe'), { name: 'Bronze axe', carried: 0, noted: 0, bank: bankAxe }],
        ]) },
      });
      const engine = createReadinessEngine({ mode: 'members', progress, state, steps: [step], qp: 100 });
      const readiness = engine.readiness(step);
      expect(readiness.requirements.some(r => r.label.includes('axe'))).toBe(false);
      const axe = engine.plan(step, { ahead: 0 }).lines.find(l => l.name === 'Bronze axe');
      expect(axe?.timing).toBe('IN_STEP');
      expect(axe?.priority).toBe('OPTIONAL');
      expect(axe?.action?.kind).not.toBe('BUY');
      expect(axe?.action?.kind).not.toBe('TAKE');
    }
  });

  it('carries Fire Strike runes and an instant teleport: the guide uses a magic strategy and the dungeon has no way out on foot', () => {
    const need = new Map((step.itemsRequired ?? []).map(i => [i.nameEn, i.amount]));
    // Fire Strike uses 3 Fire, 2 Air and 1 Mind per cast.65casts is this guide's preparation allowance, not a measured forecast or Wiki Fire Strike budget.
    expect([need.get('Fire rune'), need.get('Air rune'), need.get('Mind rune')]).toEqual([195, 130, 65]);
    expect(need.get('Lumbridge teleport')).toBe(1);
    expect(step.safespot).toMatch(/south-west.*Fire Strike/);
  });
});
