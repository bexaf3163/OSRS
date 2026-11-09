import { describe, expect, it, vi } from 'vitest';
import type { Step } from '../../types';
import { emptyProgress } from '../persistence/progress';
import { buildPlayerState } from '../player/playerState';
import { nameKey } from '../items/itemKey';
import type { CandidateAction, PlanningSnapshot } from './contracts';
import { createTacticalResolver } from './tactical';
import { fightTrainingTarget } from '../readiness/stepAssessment';
import { fakePrices } from '../../../tests/funding/helpers';
import { gearPieceByName } from '../combat/gearAdvisor';
import { stepById } from '../../data';

const step = (id: string, items: Step['itemsRequired'] = []): Step => ({ id, title: id, type: 'quest', stage: 1, requires: [], itemsRequired: items, doneWhen: 'Observed quest completion' });
const item = (name: string, amount = 1) => ({ nameEn: name, amount, howToGet: '' });
function fixture(stock: Record<string, [number, number]>, levels: Record<string, number> = { mining: 10 }, coins = 5000) {
  const progress = emptyProgress();
  const snapshot: PlanningSnapshot = { scope: { characterId: 'fixture', gameSessionId: 'login', snapshotRevision: 1, mode: 'f2p' },
    player: buildPlayerState({ progress, mode: 'f2p', stats: levels, questsDone: [],
      owned: { bankSeen: true, items: new Map(Object.entries(stock).map(([name, [carried, bank]]) => [nameKey(name), { name, carried, bank, noted: 0 }])) },
      gear: { equipment: [], inventory: [], coins, bankCoins: 0 } }), xp: {}, quests: {}, manual: {}, questPoints: { known: true, value: 0, source: 'game' } };
  return { snapshot, progress, prices: fakePrices({}), window: [] as Step[], ironman: false, earn: vi.fn(() => null) };
}

describe('reused tactical preparation through observed state transitions', () => {
  it('equips carried mandatory protection, verifies unread wearing, and retains the encounter check after observed equipment changes', () => {
    const input = fixture({ 'Anti-dragon shield': [1, 0] });
    const encounter = { ...step('S99-12', [item('Anti-dragon shield')]), foes: ['Elvarg'] };
    const carried = createTacticalResolver(input).resolve(encounter, 'synthetic encounter');
    expect(carried.action).toMatchObject({ kind: 'EQUIP', title: 'Equip Anti-dragon shield before the fight', expectedEffects: [] });
    expect(carried.plan.safety?.[0]).toMatchObject({ worn: true, equipped: false });
    const unread = { ...input, snapshot: { ...input.snapshot, player: { ...input.snapshot.player, equipmentKnown: false } } };
    expect(createTacticalResolver(unread).resolve(encounter, 'synthetic encounter').action).toMatchObject({ kind: 'VERIFY', title: 'Check your worn protection' });
    const gear = { equipment: [{ name: 'Anti-dragon shield', id: 1540, slot: 'shield' }], inventory: [], coins: 5000, bankCoins: 0 };
    input.snapshot.player = buildPlayerState({ mode: 'f2p', connected: true, progress: input.progress, stats: { mining: 10 }, questsDone: [], gear,
      owned: { bankSeen: true, items: new Map([['anti-dragon shield', { name: 'Anti-dragon shield', carried: 0, bank: 0, noted: 0 }]]) } });
    const worn = createTacticalResolver(input).resolve(encounter, 'synthetic encounter');
    expect(worn.plan.safety?.[0].equipped).toBe(true);
    expect(worn.action).toMatchObject({ kind: 'VERIFY', title: 'Review the combat strategy for Elvarg' });
    expect(carried.plan.safety?.[0].equipped).toBe(false); // Old frames never acquire future equipment proof.
  });
  it('uses bank stock, then observed carried stock, without recording a purchase or withdrawal itself', () => {
    const quest = step('S1-01', [item('Bucket')]);
    const banked = fixture({ Bucket: [0, 1] });
    const frame = createTacticalResolver(banked).resolve(quest, 'quest');
    expect(frame.action?.kind).toBe('WITHDRAW');
    expect(frame.action?.expectedEffects).toEqual([]);
    expect(frame.preparationMinutes).toBeNull();
    expect(banked.snapshot.player.owned?.items.get('bucket')?.bank).toBe(1);
    const carried = createTacticalResolver(fixture({ Bucket: [1, 0] })).resolve(quest, 'quest');
    expect(carried.action).toBeNull();
    expect(carried.preparationMinutes?.typical).toBe(0);
  });
  it('caches by candidate identity rather than conflating different targets sharing one virtual step ID', () => {
    const resolver = createTacticalResolver(fixture({ Bucket: [1, 0] }));
    const small = step('S0-01', [item('Bucket')]), large = step('S0-01', [item('Bucket', 2)]);
    const first = resolver.resolve(small, 'quest');
    expect(first.action).toBeNull();
    expect(resolver.resolve(large, 'quest').action).not.toBeNull();
    expect(resolver.resolve(small, 'quest')).toBe(first);
  });
  it('reuses the training engine and carries the training kit through the parent quest detour', () => {
    const quest = { ...step('S1-01'), requirements: [{ type: 'skill' as const, skill: 'mining', min: 10 }] };
    const frame = createTacticalResolver(fixture({ 'Bronze pickaxe': [1, 0] }, { mining: 1 })).resolve(quest, 'quest');
    expect(frame.action?.kind).toBe('TRAIN');
    expect(frame.action?.feasibility).toBe('READY');
    expect(frame.step.followsMethod).toBe('mining');
    expect(frame.plan.stepId).toBe(frame.step.id);
    expect(frame.readiness.stepId).toBe(frame.step.id);
    expect(frame.step.id).not.toBe(quest.id);
  });
  it('reserves only the committed three-action window and does not force carrying future payments now', () => {
    const current = step('S1-01');
    const pay = (id: string, amount: number) => step(id, [item('Coins', amount)]);
    const input = fixture({});
    input.window = [current, pay('S1-02', 100), pay('S1-03', 200), pay('S1-04', 400)];
    const frame = createTacticalResolver(input).resolve(current, 'quest');
    expect(frame.budget.reserve).toBe(300);
    expect(frame.budget.spendable).toBe(4700);
    expect(frame.plan.stepIds).toEqual(['S1-01', 'S1-02', 'S1-03']);
    expect(frame.action).toBeNull();
  });

  it('retains repeated historical IDs as distinct committed successor phases', () => {
    const input = fixture({ 'Iron arrow': [100, 0], Hammer: [1, 0] });
    const current = step('S0-01', [item('Iron arrow', 100), item('Hammer')]);
    const next = step('S0-01', [item('Iron arrow', 200), item('Hammer')]);
    input.window = [current, next];
    const frame = createTacticalResolver(input).resolve(current, 'training');
    expect(frame.plan.stepIds).toEqual(['S0-01', 'S0-01']);
    expect(frame.plan.lines.filter(line => line.name === 'Iron arrow').map(line => [line.timing, line.count])).toEqual([['NOW', 100], ['SOON', 200]]);
    expect(frame.action).toBeNull();
  });
  it('does not declare a new unsupported foe or a special quest strategy ready from an empty checklist', () => {
    for (const name of ['Synthetic unmodelled foe', 'Lesser demon', 'Ancient Guardian']) {
      const fight = { ...step('S1-01'), foes: [name] };
      const frame = createTacticalResolver(fixture({})).resolve(fight, 'quest');
      expect(frame.action).toMatchObject({ kind: 'VERIFY', title: `Review the combat strategy for ${name}` });
    }
  });
  it('requires actual combat observations and reuses the normal fight model once the real kit is checked', () => {
    const stats = { attack: 40, strength: 40, defence: 40, hitpoints: 40, magic: 25 };
    const input = fixture({ Trout: [20, 0] }, stats);
    const fight = { ...step('S1-01', [{ ...item('Trout', 10), heals: 7 }]), foes: ['Black Knight'] };
    expect(createTacticalResolver(input).resolve(fight, 'quest').action?.kind).toBe('VERIFY');
    const gear = { equipment: ['Rune scimitar', 'Iron full helm', 'Iron platebody', 'Iron platelegs', 'Iron kiteshield'].map(name => {
      const piece = gearPieceByName(name)!;
      return { id: piece.id, name, slot: piece.slot };
    }), inventory: [{ id: 333, name: 'Trout', count: 20 }], coins: 5000, bankCoins: 0 };
    input.snapshot.player = buildPlayerState({ mode: 'f2p', connected: true, stats, gear, owned: input.snapshot.player.owned,
      progress: input.progress, questsDone: [] });
    input.snapshot.combat = { stats, gear };
    expect(createTacticalResolver(input).resolve(fight, 'quest').action).toBeNull();
    for (const name of ['Count Draynor', 'Elvarg']) {
      expect(createTacticalResolver(input).resolve({ ...fight, foes: [name] }, 'quest').action).toMatchObject({ kind: 'VERIFY',
        title: name === 'Elvarg' ? 'Check how to equip Anti-dragon shield' : `Review the combat strategy for ${name}` });
    }
  });
  // Owner 2026-11-09: a quest fight the levels cannot take yet switches the plan to kit, money or training, not to a check.
  it('buys the kit the coins cover, earns for kit they do not, then trains toward the level that takes an unsafe fight', () => {
    const stats = { attack: 1, strength: 1, defence: 1, hitpoints: 10, magic: 1 };
    const fight = { ...step('S1-01', [{ ...item('Trout', 10), heals: 7 }]), foes: ['Black Knight'] };
    const at = (coins: number, earned: CandidateAction | null) => {
      const input = { ...fixture({ Trout: [20, 0] }, stats, coins), earn: vi.fn(() => earned) };
      const gear = { equipment: [], inventory: [{ id: 333, name: 'Trout', count: 20 }], coins, bankCoins: 0 };
      input.snapshot.player = buildPlayerState({ mode: 'f2p', connected: true, gear, stats, owned: input.snapshot.player.owned,
        progress: input.progress, questsDone: [] });
      input.snapshot.combat = { stats, gear };
      return { input, gear, action: createTacticalResolver(input).resolve(fight, 'quest').action };
    };
    expect(at(5000, null).action).toMatchObject({ kind: 'BUY', title: expect.stringMatching(/^Buy .+ for this fight: /) });
    const earn = { kind: 'EARN', title: 'Earn' } as CandidateAction;
    const short = at(0, earn);
    expect(short.action).toBe(earn);
    expect(short.input.earn).toHaveBeenCalledWith(fight, expect.any(Number), expect.anything(), 'quest');
    const { gear, action } = at(0, null);
    const target = fightTrainingTarget(fight, stats, gear)!;
    expect(target).toMatchObject({ skill: 'attack', level: expect.any(Number) });
    expect(action).toMatchObject({ kind: 'TRAIN', id: expect.stringContaining(':TRAIN:attack:') });
    const trained = { ...stats, attack: target.level, strength: target.level, defence: target.level, hitpoints: Math.max(10, target.level) };
    expect(fightTrainingTarget(fight, trained, gear)).toBeNull();
  });

  it('inherits the validated current-stage scope instead of asking to rebuy ingredients already used', () => {
    const input = fixture({}), quest = stepById.get('S3-04')!;
    input.snapshot.questPoints = { known: true, value: 16, source: 'game' };
    input.snapshot.instruction = { stepId: quest.id, stageAt: 40, lineIndex: 0, peeking: false };
    const frame = createTacticalResolver(input).resolve(quest, 'Below Ice Mountain');
    expect(frame.plan.lines.some(line => ['Beer', 'Bread', 'Cooked meat', 'Knife'].includes(line.name))).toBe(false);
    expect(frame.action).toBeNull();
    expect(quest.itemsRequired?.some(item => item.nameEn === 'Beer')).toBe(true);
  });
});
