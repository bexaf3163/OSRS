import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';
import { adviseTraining, methodNeeds, trainingMethods } from './trainingRouter';
import { stagesOf, toolTierAt, withPlannedKit } from './stages';

const player = (skill: string, level: number) =>
  buildPlayerState({
    mode: 'f2p', connected: true, stats: { [skill]: level, hitpoints: 30, attack: 40, strength: 40, defence: 30 }, progress: emptyProgress(),
    questsDone: [], gear: { equipment: [], inventory: [], coins: 100_000, bankCoins: 0 }, owned: { bankSeen: true, items: new Map() },
  } as never);

const stages = (skill: string, level: number, target: number) => {
  const advice = adviseTraining({ skill, target, mode: 'f2p', style: 'chill', priority: 'balanced', state: player(skill, level) } as never);
  return stagesOf(advice.path, skill, 'f2p');
};

describe('the training plan told as stages', () => {
  it('names the tool tier a level opens, members tiers only for members', () => {
    expect(toolTierAt('mining', 21, 'f2p')).toBe('Mithril pickaxe');
    expect(toolTierAt('woodcutting', 61, 'f2p')).toBe('Rune axe');
    expect(toolTierAt('woodcutting', 61, 'members')).toBe('Dragon axe');
    expect(toolTierAt('fishing', 40, 'f2p')).toBeNull();
  });

  it('Mining to 45: each new pickaxe starts a stage, and its rate is rated with that pickaxe', () => {
    const s = stages('mining', 20, 45);
    expect(s.flatMap((x) => x.changes)).toEqual(expect.arrayContaining(['Mithril pickaxe', 'Adamant pickaxe', 'Rune pickaxe']));
    const mids = s.slice(1).map((x) => (x.leg.method.xph![0] + x.leg.method.xph![1]) / 2);
    expect(mids).toEqual([...mids].sort((a, b) => a - b));
  });

  it('Magic to 55: the plan climbs from strikes through bolts to blasts', () => {
    const names = stages('magic', 10, 55).map((x) => x.leg.method.name.split(' on ')[0]);
    const order = ['Fire Strike', 'Wind Bolt', 'Fire Bolt', 'Wind Blast'].map((n) => names.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('a later level with the same kit as now keeps the player\'s own state', () => {
    const state = player('mining', 25);
    expect(withPlannedKit(state, 'mining', 30, 25)).toBe(state);
    expect(withPlannedKit(state, 'mining', 31, 25)).not.toBe(state);
  });
});

describe('the melee kit of a trainer', () => {
  it('buys the best affordable armour and amulet for its opponents, leaving weapon purchases to the shared upgrade evaluator', () => {
    const state = buildPlayerState({
      mode: 'f2p', connected: true, stats: { attack: 30, strength: 30, defence: 30, hitpoints: 35 }, progress: emptyProgress(), questsDone: [],
      gear: { equipment: [{ id: 1321, name: 'Bronze scimitar', slot: 'weapon', count: 1 }], inventory: [], coins: 50_000, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map() },
    } as never);
    const prices = { status: 'live', at: 1, idOf: () => undefined, limitOf: () => undefined, sell: () => null,
      buy: () => ({ price: 500, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] }) };
    const names = methodNeeds(trainingMethods.find((m) => m.id === 'me-monk')!, state, prices as never).flatMap((n) => (n.type === 'item' ? [n.name] : []));
    expect(names).toEqual(expect.arrayContaining(['Bronze scimitar', 'Amulet of strength', 'Adamant platelegs']));
    expect(names.filter((n) => /scimitar|sword|mace|axe/i.test(n))).toEqual(['Bronze scimitar']);
    expect(methodNeeds(trainingMethods.find((m) => m.id === 'me-monk')!, state, null).some((n) => n.type === 'item' && n.name === 'Adamant platelegs')).toBe(false);
  });
});
