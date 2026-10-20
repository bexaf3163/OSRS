import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { currentLoadoutStep, loadoutNeed, loadoutPhase } from '../src/lib/loadoutPhase';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { stageScope } from '../src/lib/stageScope';

const waterfall = stepById.get('S7-01')!;
const cursor = (stageAt: number, lineIndex: number) => ({ stepId: waterfall.id, stageAt, lineIndex, peeking: false });

describe('confirmed bank-to-bank quest phases', () => {
  it('distinguishes three phases even when two share the same coarse quest stage', () => {
    expect(loadoutPhase(waterfall, cursor(3, 0))).toMatchObject({ id: 'start', confirmed: true });
    expect(loadoutPhase(waterfall, cursor(3, 4))).toMatchObject({ id: 'tomb', confirmed: true });
    expect(loadoutPhase(waterfall, cursor(3, 7))).toMatchObject({ id: 'dungeon', confirmed: true });
    expect(loadoutPhase(waterfall, cursor(5, 0))).toMatchObject({ id: 'dungeon', confirmed: true });
  });
  it('does not claim a live phase from a manual peek, foreign cursor, invalid line or missing metadata', () => {
    for (const instruction of [null, { ...cursor(3, 7), peeking: true }, { ...cursor(3, 7), stepId: 'S9-04' }, cursor(3, 999), cursor(999, 0)]) {
      expect(loadoutPhase(waterfall, instruction)).toMatchObject({ id: 'start', confirmed: false });
    }
    const monkey = stepById.get('S9-04')!;
    expect(loadoutPhase(monkey, { ...cursor(5, 0), stepId: monkey.id })?.confirmed).toBe(false);
    expect(loadoutPhase({ ...waterfall, loadouts: waterfall.loadouts!.map(l => l.id === 'tomb' ? { ...l, fromLine: 'doesNotExist' } : l) }, cursor(5, 0))?.confirmed).toBe(false);
    expect(stageScope(waterfall, { ...cursor(5, 0), peeking: true })).toBeNull();
  });
  it('readiness excludes later supplies and retains shared tools when they become needed again', () => {
    expect(currentLoadoutStep(waterfall).itemsRequired?.map(i => i.nameEn)).toEqual(['Rope']);
    const tomb = currentLoadoutStep(waterfall, cursor(3, 4));
    expect(tomb.itemsRequired?.map(i => i.nameEn)).toEqual(["Glarial's pebble"]);
    expect(tomb.itemsRequired?.[0].inStep).toBe(false);
    const dungeon = currentLoadoutStep(waterfall, cursor(5, 0));
    expect(dungeon.itemsRequired?.map(i => i.nameEn)).toEqual(['Rope', 'Air rune', 'Earth rune', 'Water rune']);
    expect(loadoutNeed(waterfall, 'Unclassified item', [], loadoutPhase(waterfall, cursor(5, 0)))).toBe('NOW');
    // Source data and full-quest Shopping/watch requirements remain intact.
    expect(waterfall.itemsRequired?.length).toBe(5);
  });
  it('moves rune preparation from later to now in the shared engine without counting later-phase bag slots', () => {
    const progress = emptyProgress();
    const names = ['Rope', 'Air rune', 'Earth rune', 'Water rune', "Glarial's pebble"];
    const state = buildPlayerState({ mode: 'members', progress, stats: null, gear: null, questsDone: null, connected: true, owned: {
      bankSeen: true, items: new Map(names.map(name => [name.toLowerCase(), { name, carried: name.includes('pebble') ? 1 : 0, noted: 0, bank: 0 }])),
    } });
    const at = (stageAt: number, lineIndex: number) => createReadinessEngine({ mode: 'members', qp: 200, progress, steps: [waterfall], state, questInstruction: cursor(stageAt, lineIndex) });
    const tomb = at(3, 4);
    expect(tomb.readiness(waterfall).requirements.filter(r => r.kind === 'item').map(r => r.item)).toEqual(["Glarial's pebble"]);
    const plan = tomb.plan(waterfall, { ahead: 0 });
    expect(plan.lines.find(l => l.name === 'Air rune')?.timing).toBe('LATER');
    expect(plan.slots.adding).toBe(0);
    const dungeon = at(5, 0);
    expect(dungeon.plan(waterfall, { ahead: 0 }).now.find(l => l.name === 'Air rune')?.count).toBe(6);
    expect(dungeon.plan(waterfall, { ahead: 0 }).lines.some(l => l.name.includes('pebble'))).toBe(false);
    expect(dungeon.readiness(waterfall).problems.some(r => r.item === 'Air rune')).toBe(true);
    const missingState = { ...state, owned: { bankSeen: true, items: new Map(names.map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }])) } };
    const missing = createReadinessEngine({ mode: 'members', qp: 200, progress, steps: [waterfall], state: missingState, questInstruction: cursor(3, 4) });
    expect(missing.readiness(waterfall).problems.find(r => r.item?.includes('pebble'))?.detail).toContain('Golrie');
    expect(missing.readiness(waterfall).problems.find(r => r.item?.includes('pebble'))?.action?.label).not.toContain('shopping');
    expect(missing.plan(waterfall, { ahead: 0 }).now.find(l => l.name.includes('pebble'))?.action?.kind).toBe('GATHER');
  });
});
