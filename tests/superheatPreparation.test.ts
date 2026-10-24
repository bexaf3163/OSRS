import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { nameKey } from '../src/lib/checklist';
import { SUPERHEAT_WATCH, superheatNeeds } from '../src/lib/magicPlan';
import { methodNeeds, trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import { methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { stepById } from '../src/data';

const method = trainingMethods.find(m => m.id === 'ma-superheat')!;
function state(stock: Record<string, { carried?: number; bank?: number; noted?: number }> = {}, worn = false, stats: Record<string, number> = { magic: 43, smithing: 15 }, unread = false) {
  return buildPlayerState({ mode: 'f2p', connected: true, stats, progress: emptyProgress(), questsDone: [],
    gear: { equipment: worn ? [{ id: 1387, name: 'Staff of fire', slot: 'weapon', count: 1 }] : [], inventory: [], coins: 0, bankCoins: 0 },
    owned: { bankSeen: !unread, items: new Map(SUPERHEAT_WATCH.map(name => [nameKey(name), { name, carried: stock[name]?.carried ?? 0, noted: stock[name]?.noted ?? 0, ...(!unread ? { bank: stock[name]?.bank ?? 0 } : {}) }])) },
  });
}

describe('Superheat iron starter preparation', () => {
  it('finishes a partially consumed castable bag before requesting the next batch', () => {
    for (const count of [24, 1]) {
      const s = state({ 'Nature rune': { carried: count }, 'Fire rune': { carried: count * 4 }, 'Iron ore': { carried: count } });
      expect(superheatNeeds(s)).toContainEqual({ type: 'item', name: 'Iron ore', count });
      expect(viewMethod(method, s).status).toBe('READY');
    }
    const emptyOre = state({ 'Nature rune': { carried: 24 }, 'Fire rune': { carried: 96 } });
    expect(superheatNeeds(emptyOre)).toContainEqual({ type: 'item', name: 'Iron ore', count: 25 });
    expect(viewMethod(method, emptyOre).status).toBe('PREP');
  });
  it('requires every consumed input, not just the two skill unlocks', () => {
    const s = state();
    expect(superheatNeeds(s)).toEqual(expect.arrayContaining([
      { type: 'item', name: 'Nature rune', count: 25 }, { type: 'item', name: 'Fire rune', count: 100 }, { type: 'item', name: 'Iron ore', count: 25 },
    ]));
    const view = viewMethod(method, s);
    expect(view.status).toBe('PREP');
    expect(view.missing.map(n => n.label)).toEqual(expect.arrayContaining(['Nature rune ×25', 'Fire rune ×100', 'Iron ore ×25']));
  });
  it('substitutes owned fire staff only with an explicit wear requirement', () => {
    const s = state({ 'Staff of fire': { bank: 1 }, 'Nature rune': { carried: 25 }, 'Iron ore': { carried: 25 } });
    expect(methodNeeds(method, s)).toContainEqual({ type: 'item', name: 'Staff of fire', equip: true });
    expect(methodNeeds(method, s).some(n => n.type === 'item' && n.name === 'Fire rune')).toBe(false);
    expect(viewMethod(method, s).missing).toContainEqual(expect.objectContaining({ label: 'Staff of fire', state: 'BANK' }));
  });
  it('accepts a worn fire staff even before its owned row is refreshed', () => {
    const s = state({ 'Nature rune': { carried: 25 }, 'Iron ore': { carried: 25 } }, true);
    expect(viewMethod(method, s).status).toBe('READY');
  });
  it('also accepts the complete no-staff recipe', () => {
    expect(viewMethod(method, state({ 'Nature rune': { carried: 25 }, 'Fire rune': { carried: 100 }, 'Iron ore': { carried: 25 } })).status).toBe('READY');
  });
  it('noted ore is not a castable bag of ore', () => {
    const view = viewMethod(method, state({ 'Nature rune': { carried: 25 }, 'Fire rune': { carried: 100 }, 'Iron ore': { noted: 25 } }));
    expect(view.status).toBe('PREP');
    expect(view.missing.find(n => n.label === 'Iron ore ×25')?.state).toBe('BANK');
  });
  it.each([{ magic: 42, smithing: 15 }, { magic: 43, smithing: 14 }])('does not bypass actual unlocks: %j', stats => {
    expect(viewMethod(method, state({}, false, stats)).status).toBe('LOCKED');
  });
  it('preserves unread skills and inventory as unchecked', () => {
    const view = viewMethod(method, state({}, false, { magic: 43 }, true));
    expect(view.unchecked).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Smithing 15' }), expect.objectContaining({ label: 'Iron ore ×25' })]));
  });
  it('projects resolved inputs and watches the optional staff through the existing method path', () => {
    const step = { ...stepById.get('S6-04')!, followsMethod: 'magic' };
    const projected = withTrainingMethod(step, { methodId: method.id, needs: methodNeeds(method, state({ 'Staff of fire': { bank: 1 } })) });
    expect(projected.itemsRequired).toEqual(expect.arrayContaining([expect.objectContaining({ nameEn: 'Iron ore', amount: 25 }), expect.objectContaining({ nameEn: 'Staff of fire', equip: true })]));
    expect(projected.itemsRequired?.some(n => n.nameEn === 'Fire rune')).toBe(false);
    expect(methodToolNames(step)).toEqual(expect.arrayContaining(SUPERHEAT_WATCH));
    expect(methodToolNames(step).length).toBeLessThanOrEqual(40);
    expect(projected.inGame?.completionTrigger).toEqual(step.inGame?.completionTrigger);
  });
});
