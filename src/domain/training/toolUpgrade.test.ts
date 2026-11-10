import { describe, expect, it } from 'vitest';
import { adviseTraining } from './trainingRouter';
import { toolReplacedAt } from './stages';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';
import { fakePrices } from '../../../tests/funding/helpers';
import { prerequisiteTraining } from '../planning/training';
import { createTacticalResolver } from '../planning/tactical';
import type { PlanningSnapshot } from '../planning/contracts';
import { toInGameTarget } from '../guide/inGameTarget';

// Owner report 2026-11-10: at Woodcutting 31 the app did not advise the Adamant axe. A tool tier keeps serving the skill after the current
// method and after the F2P checkpoint until the next tier unlocks, and the trip to buy it is a walk to the exchange, not a fixed quarter hour.
// Grand Exchange prices of 2026-11-10 (prices.runescape.wiki), the cowhide baseline included.
const prices = fakePrices({ 'Bronze axe': { buy: 88 }, 'Iron axe': { buy: 125 }, 'Steel axe': { buy: 180 }, 'Black axe': { buy: 1064 }, 'Mithril axe': { buy: 200 },
  'Adamant axe': { buy: 517 }, 'Rune axe': { buy: 7390 }, 'Bronze pickaxe': { buy: 110 }, 'Iron pickaxe': { buy: 219 }, 'Steel pickaxe': { buy: 144 },
  'Black pickaxe': { buy: 2547 }, 'Mithril pickaxe': { buy: 453 }, 'Adamant pickaxe': { buy: 1508 }, 'Rune pickaxe': { buy: 19009 },
  Logs: { buy: 19, sell: 18 }, 'Oak logs': { buy: 29, sell: 28 }, 'Willow logs': { buy: 22, sell: 20 }, Cowhide: { buy: 120, sell: 107 } });
const TOOLS = ['Bronze axe', 'Iron axe', 'Steel axe', 'Black axe', 'Mithril axe', 'Adamant axe', 'Rune axe',
  'Bronze pickaxe', 'Iron pickaxe', 'Steel pickaxe', 'Black pickaxe', 'Mithril pickaxe', 'Adamant pickaxe', 'Rune pickaxe'];
// The owner's character from the report, at Draynor Village.
const character = (levels: Record<string, number>, tool: string) => {
  const stats = { attack: 40, strength: 44, defence: 44, hitpoints: 43, woodcutting: 31, firemaking: 30, mining: 18, ...levels };
  const owned = { bankSeen: true, items: new Map(TOOLS.map(n => [n.toLowerCase(), { name: n, carried: n === tool ? 1 : 0, bank: 0, noted: 0 }])) };
  const gear = { equipment: [], inventory: [{ id: 1, name: tool, count: 1 }], coins: 50_000, bankCoins: 0 };
  return { stats, gear, state: buildPlayerState({ mode: 'f2p', connected: true, player: 'Owner', stats, progress: emptyProgress(), questsDone: [], owned, gear, position: { x: 3087, y: 3235, plane: 0 } }) };
};
const advise = (skill: string, level: number, target: number, tool: string) =>
  adviseTraining({ skill, target, state: character({ [skill]: level }, tool).state, mode: 'f2p', style: 'chill', priority: 'balanced', prices });

describe('a better tool tier is weighed over its whole use', () => {
  it('a tier is replaced where the path plans the next one: the last F2P tier is never replaced on a free account', () => {
    expect([toolReplacedAt('Steel axe', 'f2p'), toolReplacedAt('Adamant axe', 'f2p'), toolReplacedAt('Rune axe', 'f2p'), toolReplacedAt('Rune axe', 'members')]).toEqual([11, 41, null, 61]);
    expect(toolReplacedAt('Rune scimitar', 'f2p')).toBeNull();
  });

  it('Woodcutting 31 with a Steel axe: the Adamant axe is advised for the F2P checkpoint 36 too, and the saving stops at the Rune axe', () => {
    const at36 = advise('woodcutting', 31, 36, 'Steel axe'), at60 = advise('woodcutting', 31, 60, 'Steel axe');
    expect(at36.upgrade).toMatchObject({ tool: 'Adamant axe', price: 517 });
    // The same stretch (31 to the Rune axe at 41) whatever the goal: past 41 the Rune axe does the work, before 41 the checkpoint is not its end.
    expect(at60.upgrade?.hours).toBeCloseTo(at36.upgrade!.hours, 6);
    expect(at36.reason).toMatch(/an Adamant axe \(≈ 517 gp\) saves ≈ \d+ min until the next tier, the trip to buy it included/);
  });

  it('a small step up is not worth the walk: a Mithril axe at 31 keeps working', () => {
    expect(advise('woodcutting', 31, 36, 'Mithril axe').upgrade).toBeNull();
  });

  it('the Rune axe at 41 and better pickaxes use the same rule', () => {
    expect(advise('woodcutting', 41, 60, 'Adamant axe').upgrade).toMatchObject({ tool: 'Rune axe' });
    expect(advise('mining', 21, 45, 'Bronze pickaxe').upgrade).toMatchObject({ tool: 'Mithril pickaxe' });
    expect(advise('mining', 31, 45, 'Steel pickaxe').upgrade).toMatchObject({ tool: 'Adamant pickaxe' });
  });

  it('the advised tool is the planner\'s next action and the HUD\'s item, not only a line of text', () => {
    const { stats, gear, state } = character({}, 'Steel axe');
    const snapshot = { scope: { characterId: 'Owner', mode: 'f2p', gameSessionId: 's', snapshotRevision: 1 }, player: state, combat: { stats, gear },
      xp: {}, quests: {}, questPoints: { known: true, value: 20, source: 'game' }, manual: {} } as unknown as PlanningSnapshot;
    const candidate = prerequisiteTraining({ snapshot, goalId: 'Woodcutting', skill: 'woodcutting', target: 36, prices })!;
    const frame = createTacticalResolver({ snapshot, progress: emptyProgress(), prices, window: [], ironman: false, earn: () => null }).resolve(candidate.step!, 'Woodcutting');
    expect(frame.action).toMatchObject({ kind: 'BUY', title: 'Get Adamant axe' });
    expect(toInGameTarget(frame.step)?.checklist?.map(item => item.name)).toContain('Adamant axe');
  });
});
