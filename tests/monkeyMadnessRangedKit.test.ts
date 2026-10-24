import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import stagesFile from '../src/data/questStages.json';
import { loadoutNeed } from '../src/lib/loadoutPhase';
import { evaluate } from '../src/lib/requirements';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';

const step = stepById.get('S9-04')!;
type Line = { k: string; t: string; pre?: { item: string }[] };
const stages = (stagesFile as unknown as { quests: Record<string, { stages: { do: Line[] }[] }> }).quests;

describe('Monkey Madness I: the Jungle demon is a ranged fight, and the kit says so', () => {
  it('a bow and arrows are required, in the final loadout and checked before the fight', () => {
    const req = new Map((step.itemsRequired ?? []).map(i => [i.nameEn, i]));
    expect(req.get('Maple shortbow')).toMatchObject({ equip: true, anyOf: expect.arrayContaining(['Willow shortbow']) });
    expect(req.get('Mithril arrow')).toMatchObject({ amount: 100, equip: true });
    expect(step.loadouts?.find(l => l.id === 'final')?.take.map(t => t.nameEn)).toEqual(expect.arrayContaining(['Maple shortbow', 'Mithril arrow']));
    const lines = stages['S9-04'].stages.flatMap(s => s.do);
    const prep = lines.find(l => l.k === 'prepareForBattle')!;
    expect(prep.pre?.map(p => p.item)).toEqual(expect.arrayContaining(['Maple shortbow', 'Mithril arrow']));
    expect(lines.find(l => l.k === 'killDemon')!.t).toMatch(/Ranged.*Protect from Magic.*three or more squares/);
  });

  it('the bow and arrows are checked on the final bank visit, and a worn Willow shortbow with Adamant arrows counts', () => {
    const final = { id: 'final', index: step.loadouts!.findIndex(l => l.id === 'final'), confirmed: true };
    expect(loadoutNeed(step, 'Maple shortbow', [], final)).toBe('NOW');
    expect(loadoutNeed(step, 'Mithril arrow', [], final)).toBe('NOW');
    const state = buildPlayerState({
      mode: 'members', connected: true, progress: emptyProgress(), stats: { prayer: 43, ranged: 30 }, questsDone: null,
      gear: { equipment: [{ id: 849, name: 'Willow shortbow', slot: 'weapon' }, { id: 890, name: 'Adamant arrow', slot: 'ammo', count: 100 }], inventory: [], coins: 0, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map() },
    });
    const req = new Map((step.itemsRequired ?? []).map(i => [i.nameEn, i]));
    for (const name of ['Maple shortbow', 'Mithril arrow']) {
      const i = req.get(name)!;
      expect(evaluate({ type: 'equipment', name, anyOf: i.anyOf, count: Number(i.amount) }, state).state, name).toBe('OK');
    }
  });
});
