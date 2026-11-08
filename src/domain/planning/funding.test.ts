import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../player/playerState';
import { viewOf } from '../economy/funding/plan';
import type { FundingPlanState, SubStep } from '../economy/funding/plan';
import { buildSnapshot } from '../economy/funding/snapshot';
import { methodById } from '../economy/funding/methods';
import { evaluate } from '../economy/funding/evaluate';
import { fakePrices } from '../../../tests/funding/helpers';
import { fundingAction, fundingKit } from './funding';
import type { FundingActionInput } from './funding';
import { createTacticalResolver } from './tactical';
import { emptyProgress } from '../persistence/progress';

function fixture(kind: SubStep['kind'] = 'perform'): FundingActionInput {
  const player = buildPlayerState({ mode: 'f2p', player: 'Fixture', connected: true, stats: { mining: 40 },
    progress: { levels: {} }, questsDone: [], owned: { bankSeen: true, items: new Map() },
    gear: { equipment: [], inventory: [], coins: 2000, bankCoins: 0 } });
  const snap = buildSnapshot({ state: player, window: [], questPoints: 0, ironman: false, sellOverride: 'lifted' });
  const method = methodById('collect-iron-al-kharid')!;
  const plan: FundingPlanState = { v: 1, id: 'earn:fixture@1', version: 1, character: 'fixture', optionId: 'earn:fixture',
    kind: 'EARN', methodId: method.id, title: method.title, sourceStepId: 'S1-01', target: { required: 3000, gap: 1000, liquidAtStart: 2000, completeAtStart: true },
    reserved: [], status: 'ACTIVE', startedAt: 1, updatedAt: 1, active: 0,
    subSteps: [{ id: 'perform', kind, text: 'Collect the required output.', done: false, detect: { type: 'manual' }, place: method.spot }],
    baseline: { bagCoins: 2000, bag: {}, totalCoins: 2000 }, workSeconds: 0, lastTickAt: 1, expectedNet: 1500 };
  return { snapshot: { scope: { characterId: 'main:fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
    player, quests: {}, xp: {}, manual: {}, questPoints: { known: true, value: 0, source: 'game' } },
    goalId: 'quest', plan, view: viewOf(plan, snap), evaluation: evaluate(method, { snap, prices: fakePrices({ 'Iron ore': { sell: 100, volume: 100_000 } }), cash: 2000,
      now: 1, mode: 'earn', target: 1000, reach: () => 10, exchange: method.bank }),
    ironman: false, preparation: { ready: true, action: null } };
}

describe('funding local machine as a canonical action', () => {
  it('prepares the evaluated current batch with the chosen tool through the normal tactical engine', () => {
    const input = fixture(), base = input.evaluation!;
    const evaluation = { ...base, method: { ...base.method, requirements: [{ kind: 'item' as const, role: 'tool' as const, any: [{ id: 0, name: 'Synthetic funding tool' }] }],
      inputs: [{ item: { id: 0, name: 'Synthetic funding input' }, qty: 1 }] },
      preparation: { units: 6, tools: [{ name: 'Synthetic funding tool', owned: true, unknown: false, cost: 0 }], inputs: [{ name: 'Synthetic funding input', qty: 6, owned: 6, missing: 0 }] } };
    const kit = fundingKit(evaluation, input.plan.sourceStepId, input.snapshot);
    expect(kit.unresolved).toEqual([]);
    expect(kit.step.itemsRequired).toEqual(expect.arrayContaining([expect.objectContaining({ nameEn: 'Synthetic funding tool', amount: 1 }),
      expect.objectContaining({ nameEn: 'Synthetic funding input', amount: 6 })]));
    expect(kit.step.inGame?.completionTrigger).toBeUndefined();
    input.snapshot.player.owned!.items = new Map(['Synthetic funding tool', 'Synthetic funding input'].map(name => [name.toLowerCase(), { name, carried: 0, noted: 0, bank: 0 }]));
    const resolver = createTacticalResolver({ snapshot: input.snapshot, progress: emptyProgress(), prices: fakePrices({ 'Synthetic funding tool': { buy: 10 }, 'Synthetic funding input': { buy: 40 } }),
      window: [kit.step], ironman: false, earn: () => null });
    // Saved/evaluated ownership is not current physical possession. The normal allocator still asks to acquire the absent funding tool.
    const action = resolver.resolve(kit.step, input.goalId).action!;
    expect(action.kind, JSON.stringify(action)).toBe('BUY');
    expect(action).toMatchObject({ goalId: input.goalId, stepId: kit.step.id, expectedEffects: [] });
    expect(input.snapshot.player.owned!.items.get('synthetic funding tool')?.carried).toBe(0);
  });
  it('refuses incomplete method projections, unsupported equipment and unresolved trip payments', () => {
    const input = fixture(), base = input.evaluation!;
    const kit = fundingKit({ ...base, method: { ...base.method, requirements: [{ kind: 'fare', coins: 10, reason: 'Gate' },
      { kind: 'item', role: 'gear', any: [{ id: 1179, name: 'Black kiteshield' }] }], inputs: [{ item: { id: 1511, name: 'Logs' }, qty: 1 }] },
      preparation: { units: 0, tools: [], inputs: [] } }, input.plan.sourceStepId, input.snapshot);
    expect(kit.unresolved.length).toBeGreaterThan(0);
    expect(fundingAction({ ...input, preparation: { ready: true, action: null, unresolved: kit.unresolved } })?.kind).toBe('VERIFY');
  });
  it('reserves one executable batch and its fare, respects observed waivers and never invents started-quest access', () => {
    const input = fixture(), base = input.evaluation!;
    const evaluation = { ...base, method: { ...base.method, requirements: [{ kind: 'fare' as const, coins: 10, reason: 'Toll', unlessQuest: 'Prince Ali Rescue' },
      { kind: 'quest' as const, quest: 'Shield of Arrav', state: 'started' as const }], inputs: [{ item: { id: 995, name: 'Coins' }, qty: 2 }] },
      preparation: { units: 6, tools: [], inputs: [] } };
    expect(fundingKit(evaluation, input.plan.sourceStepId, input.snapshot)).toMatchObject({ unresolved: ['Observed started-quest access for Shield of Arrav'],
      step: { itemsRequired: [expect.objectContaining({ nameEn: 'Coins', amount: 22 })] } });
    input.snapshot.player = { ...input.snapshot.player, quests: { known: true, source: 'game', value: ['Prince Ali Rescue'] } };
    input.snapshot.quests = { 'Shield of Arrav': { state: 'IN_PROGRESS', source: 'game' } };
    expect(fundingKit(evaluation, input.plan.sourceStepId, input.snapshot)).toMatchObject({ unresolved: [],
      step: { itemsRequired: [expect.objectContaining({ nameEn: 'Coins', amount: 12 })] } });
    expect(input.snapshot.player.coins.bag).toMatchObject({ value: 2000 });
  });
  it('reuses current phase content and keeps estimated earnings out of observed and projected GP', () => {
    const input = fixture(), before = structuredClone(input.plan);
    const result = fundingAction(input)!;
    expect(result).toMatchObject({ kind: 'EARN', title: input.view.action, stepId: input.plan.sourceStepId, feasibility: 'READY', expectedEffects: [], gpCost: null });
    const { x, y, plane } = input.plan.subSteps[0].place!;
    expect(result.destination).toEqual({ x, y, plane });
    expect(result.completionEvidence[0].snapshotRevision).toBe(1);
    expect(input.plan).toEqual(before);
    expect(input.snapshot.player.coins.bag).toMatchObject({ value: 2000 });
    const sale = fixture('sell');
    expect(fundingAction(sale)).toMatchObject({ kind: 'EARN', expectedEffects: [], time: null });
  });
  it('refuses stale phase/version views and another or disconnected character', () => {
    const input = fixture();
    expect(fundingAction({ ...input, view: { ...input.view, version: 0 } })).toBeNull();
    expect(fundingAction({ ...input, view: { ...input.view, stepIndex: 2 } })).toBeNull();
    expect(fundingAction({ ...input, plan: { ...input.plan, character: 'Another' } })).toBeNull();
    expect(fundingAction({ ...input, snapshot: { ...input.snapshot, player: { ...input.snapshot.player, connected: false } } })).toBeNull();
  });
  it('does not restart paused or completed plans or credit another repeated trip', () => {
    const input = fixture();
    expect(fundingAction({ ...input, plan: { ...input.plan, status: 'PAUSED' }, view: { ...input.view, status: 'PAUSED' } })).toMatchObject({ kind: 'MANUAL_WAIT' });
    expect(fundingAction({ ...input, plan: { ...input.plan, status: 'DONE' }, view: { ...input.view, status: 'DONE' } })).toBeNull();
    expect(fundingAction({ ...input, plan: { ...input.plan, trips: 2 } })?.id).not.toBe(fundingAction(input)?.id);
  });
  it('requires current account, requirement and method evidence rather than trusting saved eligibility', () => {
    const input = fixture();
    expect(fundingAction({ ...input, ironman: null })?.kind).toBe('VERIFY');
    expect(fundingAction({ ...input, ironman: true })?.kind).toBe('MANUAL_WAIT');
    expect(fundingAction({ ...input, evaluation: null })?.kind).toBe('VERIFY');
    expect(fundingAction({ ...input, evaluation: { ...input.evaluation!, checks: [{ text: 'Mining level unread', status: 'unknown' }] } })).toMatchObject({ kind: 'VERIFY', title: 'Mining level unread' });
    expect(fundingAction({ ...input, evaluation: { ...input.evaluation!, eligible: false } })?.kind).toBe('MANUAL_WAIT');
  });
  it('checks every manual condition and uses the shared funding kit before work', () => {
    const input = fixture();
    input.evaluation = { ...input.evaluation!, method: { ...input.evaluation!.method,
      requirements: [{ kind: 'check', text: 'First condition' }, { kind: 'check', text: 'Second condition' }] } };
    input.snapshot.manual = { [`funding:${input.plan.methodId}:requirement:0`]: true };
    expect(fundingAction(input)).toMatchObject({ kind: 'MANUAL_WAIT', title: 'Second condition' });
    input.snapshot.manual = { ...input.snapshot.manual, [`funding:${input.plan.methodId}:requirement:1`]: true };
    expect(fundingAction({ ...input, preparation: { ready: false, action: null } })?.kind).toBe('VERIFY');
    const withdrawal = { ...fundingAction(input)!, kind: 'WITHDRAW' as const, title: 'Withdraw the funding tool' };
    expect(fundingAction({ ...input, preparation: { ready: false, action: withdrawal } })).toBe(withdrawal);
    input.evaluation.method = { ...input.evaluation.method, requirements: [{ kind: 'check', hard: false, text: 'Optional shortcut' }] };
    expect(fundingAction(input)?.kind).toBe('EARN');
  });
  it('keeps self-supply and owner confirmation separate from a sale or automatic completion', () => {
    const input = fixture();
    expect(fundingAction({ ...input, plan: { ...input.plan, kind: 'SELF_GATHER' }, ironman: true })?.kind).toBe('GATHER');
    expect(fundingAction(fixture('prepare'))?.kind).toBe('MANUAL_WAIT');
    expect(fundingAction(fixture('resume'))?.kind).toBe('VERIFY');
  });
});
