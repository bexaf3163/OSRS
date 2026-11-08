import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { allSteps, itemById } from '../../data';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';
import { ctxOf, fakePrices, fakeSnap } from '../../../tests/funding/helpers';
import { METHODS } from '../economy/funding/methods';
import { tradeRestriction } from '../market/tradeRestriction';
import { questCatalogue } from './catalogue';
import type { PlanningSnapshot } from './contracts';
import { questWork, runtimeDecision, type RuntimePlanInput } from './runtime';
import { bestEarnRate, earnAction, type EarnRate } from './earn';

const f2pSteps = allSteps.filter(step => !step.membersOnly);

function snapshot(completed: readonly string[] = [], coins = 0): PlanningSnapshot {
  return {
    scope: { characterId: 'Runtime', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
    player: buildPlayerState({ mode: 'f2p', connected: true, player: 'Runtime', stats: { attack: 1, strength: 1, defence: 1, hitpoints: 10 },
      progress: { levels: {} }, questsDone: [...completed], owned: { bankSeen: true, items: new Map() },
      gear: { equipment: [], inventory: [], coins, bankCoins: 0 } }),
    xp: {}, manual: {}, questPoints: { known: true, value: completed.length, source: 'game' },
    quests: Object.fromEntries(questCatalogue.map(q => [q.id, { state: completed.includes(q.id) ? 'COMPLETED' : 'NOT_STARTED', source: 'game' }])),
  };
}

const input = (snap: PlanningSnapshot, over: Partial<RuntimePlanInput> = {}): RuntimePlanInput => ({
  snapshot: snap, intent: { kind: 'auto' }, progress: emptyProgress(), prices: fakePrices({}), steps: f2pSteps,
  detail: id => itemById.get(id), ironman: false, earn: () => null, ...over,
});

describe('the runtime planner over the real catalogue and steps', () => {
  it('commits one quest objective for a fresh character, with one current action and its revision', () => {
    const decision = runtimeDecision(input(snapshot()))!;
    expect(decision).not.toBeNull();
    expect(questCatalogue.some(q => q.id === decision.objectiveId)).toBe(true);
    expect(decision.activeAction.goalId).toBeTruthy();
    expect(decision.characterId).toBe('Runtime');
  });

  it('a quest completed out of order is never the objective again (S87)', () => {
    const first = runtimeDecision(input(snapshot()))!;
    const after = runtimeDecision(input(snapshot([first.objectiveId])))!;
    expect(after.objectiveId).not.toBe(first.objectiveId);
  });

  it('an explicit owner goal is kept as the requested objective', () => {
    const goal = questCatalogue.find(q => !q.members && q.requirements.quests.length === 0 && q.requirements.questPoints === 0)!;
    const decision = runtimeDecision(input(snapshot(), { intent: { kind: 'quest', questId: goal.id } }))!;
    expect([decision.objectiveId, decision.requestedObjectiveId]).toContain(goal.id);
  });

  it('commits nothing once every F2P quest is complete: no skill grind is forced as the F2P objective (S105)', () => {
    expect(runtimeDecision(input(snapshot(questCatalogue.filter(q => !q.members).map(q => q.id))))).toBeNull();
  });

  it('a snapshot from another character is not decided on with the previous decision', () => {
    const first = runtimeDecision(input(snapshot()))!;
    const other = snapshot();
    const moved = { ...other, scope: { ...other.scope, characterId: 'Other' } };
    expect(runtimeDecision(input(moved, { previous: first }))?.characterId).toBe('Other');
  });
});

describe('quest work and travel adapters', () => {
  it('does not prove Demon Slayer or a new combat quest ready merely because its encounter metadata is absent', () => {
    const real = questCatalogue.find(quest => quest.id === 'Demon Slayer')!;
    for (const goal of [real, { ...real, id: 'New unmodelled combat quest' }]) {
      const snap = snapshot(), gear = { equipment: [], inventory: [{ id: 526, name: 'Bones', count: 25 },
        { id: 1929, name: 'Bucket of water', count: 1 }], coins: 1000, bankCoins: 0 };
      snap.player = buildPlayerState({ mode: 'f2p', connected: true, player: 'Runtime', stats: { attack: 1, strength: 1, defence: 1, hitpoints: 10 },
        progress: { levels: {} }, questsDone: [], gear, owned: { bankSeen: true, items: new Map([
          ['bones', { name: 'Bones', carried: 25, bank: 0, noted: 0 }],
          ['bucket of water', { name: 'Bucket of water', carried: 1, bank: 0, noted: 0 }],
        ]) } });
      snap.quests = { [goal.id]: { state: 'NOT_STARTED', source: 'game' } };
      const decision = runtimeDecision(input(snap, { catalogue: [goal], intent: { kind: 'quest', questId: goal.id } }))!;
      expect(decision.activeAction).toMatchObject({ kind: 'VERIFY', title: `Verify combat readiness for ${goal.id}` });
      expect(decision.expectedNext.effects).toEqual([]);
      expect(decision.estimatedRemaining).toBeNull();
    }
  });

  it('does not reassess a past encounter after admitted stage evidence has advanced beyond it', () => {
    const original = questCatalogue.find(quest => quest.id === 'Demon Slayer')!;
    const base = f2pSteps.find(step => step.id === original.stepIds[0])!;
    const fight = { ...base, id: 'synthetic-fight', itemsRequired: [], foes: ['Synthetic unmodelled foe'] };
    const returning = { ...base, id: 'synthetic-return', itemsRequired: [], foes: [] };
    const goal = { ...original, id: 'Synthetic completed encounter', stepIds: [fight.id, returning.id] };
    const snap = snapshot();
    snap.quests = { [goal.id]: { state: 'IN_PROGRESS', stepId: returning.id, source: 'Admitted stage evidence' } };
    const decision = runtimeDecision(input(snap, { catalogue: [goal], steps: [fight, returning], intent: { kind: 'quest', questId: goal.id } }))!;
    expect(decision.activeAction).toMatchObject({ kind: 'QUEST', stepId: returning.id, feasibility: 'READY' });
  });

  it('splits the Wiki length band by the steps still ahead and keeps an unknown length null', () => {
    const quest = questCatalogue.find(q => q.length === 'Very Short' && q.stepIds.length === 1)!;
    const step = f2pSteps.find(s => s.id === quest.stepIds[0])!;
    expect(questWork(step, quest)).toMatchObject({ fast: 5, typical: 10, slow: 20 });
    expect(questWork(step, { ...quest, length: null })).toBeNull();
  });

  it('measures quest travel from the observed position through the walking costs only', () => {
    const at = { x: 3222, y: 3218, plane: 0 };
    const snap = snapshot();
    const placed = { ...snap, player: { ...snap.player, position: { known: true, value: at, source: 'game' } } } as PlanningSnapshot;
    const asked: unknown[] = [];
    runtimeDecision(input(placed, { walk: (from, to) => { asked.push([from, to]); return null; } }));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every(pair => (pair as unknown[])[0] === at)).toBe(true);
  });
});

describe('different characters through the integrated runtime (brief 39 counterfactuals)', () => {
  // Every quest item is counted (zero) after a full bank read, as the plugin reports them; walking is a test cost by distance.
  const names = [...new Set(f2pSteps.flatMap(step => (step.itemsRequired ?? []).flatMap(item => [item.nameEn, ...(item.anyOf ?? [])])))].filter((name): name is string => !!name);
  interface Extra { coins?: number; bank?: Readonly<Record<string, number>>; carried?: Readonly<Record<string, number>>; stats?: Readonly<Record<string, number>> }
  const counted = (at: { x: number; y: number; plane: number }, completed: readonly string[] = [], extra: Extra = {}): PlanningSnapshot => {
    const base = snapshot(completed);
    const owned = { bankSeen: true, items: new Map(names.map(name => [name.toLowerCase(), { name, carried: extra.carried?.[name] ?? 0, bank: extra.bank?.[name] ?? 0, noted: 0 }])) };
    const player = buildPlayerState({ mode: 'f2p', connected: true, player: 'Runtime', stats: { attack: 1, strength: 1, defence: 1, hitpoints: 10, magic: 1, ranged: 1, prayer: 1, mining: 1, smithing: 1, crafting: 1, cooking: 1, woodcutting: 1, firemaking: 1, fishing: 1, runecraft: 1, ...extra.stats }, progress: { levels: {} }, questsDone: [...completed], owned, gear: { equipment: [], inventory: [], coins: extra.coins ?? 0, bankCoins: 0 }, position: at });
    return { ...base, player, bankRead: { kind: 'current' } } as PlanningSnapshot;
  };
  const walk: RuntimePlanInput['walk'] = (from, to) => {
    if (!from) return null;
    const tiles = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    return { fast: tiles / 150, typical: tiles / 100, slow: tiles / 50, source: 'test walk at about running pace' };
  };
  const lumbridge = { x: 3222, y: 3218, plane: 0 };
  // As the app gives it: market prices for every quest item and an earning rate from the Money ranking.
  const prices = fakePrices(Object.fromEntries(names.map(name => [name, { buy: 200, sell: 100 }])));
  const rate = { methodId: 'test', title: 'Test earning', netPerHour: { fast: 60_000, typical: 40_000, slow: 20_000 } };
  const plan = (snap: PlanningSnapshot, over: Partial<RuntimePlanInput> = {}) => {
    const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, rate);
    const decision = runtimeDecision(input(snap, { walk, prices, earn, ...over }));
    return decision ? `${decision.objectiveId} / ${decision.activeAction.id}` : 'no decision';
  };

  it('ranks quests by known minutes rather than route order', () => {
    const decision = runtimeDecision(input(counted(lumbridge), { walk }))!;
    // The first quest in route order is not what decides; the reasons say how the alternatives were weighed.
    const firstQuestStep = f2pSteps.find(step => questCatalogue.some(q => q.stepIds.includes(step.id)))!;
    expect(decision.objectiveId).not.toBe(questCatalogue.find(q => q.stepIds.includes(firstQuestStep.id))!.id);
    expect(decision.why.some(line => /Comparable known costs|Not compared because their time is unknown/.test(line))).toBe(true);
  });

  it('a small price wobble keeps the committed objective; only a material change replans (S66, S101)', () => {
    const snap = counted(lumbridge, ["Cook's Assistant"]);
    const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, rate);
    const first = runtimeDecision(input(snap, { walk, prices, earn }))!;
    const wobble = fakePrices(Object.fromEntries(names.map(name => [name, { buy: 204, sell: 102 }])));
    const after = runtimeDecision(input(snap, { walk, prices: wobble, earn, previous: first }))!;
    expect(after.objectiveId).toBe(first.objectiveId);
    expect(after.revision).toBe(first.revision + 1);
  });

  it('walks every F2P quest to completion with no repeat and no deadlock (S45 route-level harness)', () => {
    const f2p = questCatalogue.filter(q => !q.members).map(q => q.id);
    const done: string[] = [], actions: string[] = [];
    for (let turn = 0; turn < f2p.length + 5; turn++) {
      const base = counted(lumbridge, done);
      // The real quest points of what is done, and the owner's word for Shield of Arrav's partner.
      const points = questCatalogue.filter(q => done.includes(q.id)).reduce((sum, q) => sum + (q.rewards.questPoints ?? 0), 0);
      const snap = { ...base, questPoints: { known: true, value: points, source: 'game' }, manual: { 'Shield of Arrav:partner': true } } as PlanningSnapshot;
      const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, rate);
      const decision = runtimeDecision(input(snap, { walk, prices, earn }));
      if (!decision) break;
      expect(done).not.toContain(decision.objectiveId);
      done.push(decision.objectiveId);
      actions.push(decision.activeAction.id);
    }
    expect([...done].sort()).toEqual([...f2p].sort());
    // S85: Doric's Quest gives the Mining XP The Knight's Sword needs (Mining 10), so it comes first and nothing is ground for it.
    expect(done.indexOf("Doric's Quest")).toBeLessThan(done.indexOf("The Knight's Sword"));
    expect(actions.filter(id => id.includes(':TRAIN:mining'))).toEqual([]);
  });

  it('S45: at every turn the plan is no slower than the proven baseline (next quest in route order, same costs)', () => {
    const first = (id: string) => f2pSteps.findIndex(step => questCatalogue.find(q => q.id === id)!.stepIds.includes(step.id));
    const route = questCatalogue.filter(q => !q.members).map(q => q.id).sort((a, b) => first(a) - first(b));
    const done: string[] = [];
    let turns = 0, compared = 0;
    for (; turns < route.length + 5; turns++) {
      const snap = routeSnapshot(done);
      const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, rate);
      const plan = runtimeDecision(input(snap, { walk, prices, earn }));
      if (!plan) break;
      const next = route.find(id => !done.includes(id))!;
      const baseline = runtimeDecision(input(snap, { walk, prices, earn, intent: { kind: 'quest', questId: next } }));
      if (plan.estimatedRemaining && baseline?.estimatedRemaining) {
        expect(plan.estimatedRemaining.typical, `turn ${turns}: ${plan.objectiveId} vs ${next}`).toBeLessThanOrEqual(baseline.estimatedRemaining.typical + 1e-6);
        compared++;
      } else if (!plan.estimatedRemaining) {
        // Unknown costs (drops, unmodelled fights) give one central unknown answer, never a silent route-order fallback.
        expect(plan.confidence, `turn ${turns}`).not.toBe('HIGH');
        if (plan.alternatives.some(alt => alt.minutes === null)) expect(plan.why.join(' '), `turn ${turns}`).toMatch(/Not compared because their time is unknown/);
      }
      done.push(plan.objectiveId);
    }
    expect(turns).toBe(route.length);
    expect(compared).toBeGreaterThan(0);
  }, 60_000);

  // Measured 2026-11-08 (Node, Idle priority): fresh counted character p50 ≈56 ms, p95 ≈66 ms (beam of 4); 18 quests done p50 ≈15 ms. The bound is a regression
  // guard with margin for a loaded machine (the full parallel suite at Idle priority measured p95 159 ms), not the target.
  it('decision latency is bounded: p50 under 200 ms, p95 under 400 ms for a fresh and a late-route character (brief 28)', () => {
    const late = questCatalogue.filter(q => !q.members).map(q => q.id).slice(0, 18);
    for (const done of [[], late]) {
      const snap = routeSnapshot(done);
      const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, rate);
      const times = Array.from({ length: 40 }, () => {
        const start = performance.now();
        runtimeDecision(input(snap, { walk, prices, earn }));
        return performance.now() - start;
      }).sort((a, b) => a - b);
      const [p50, p95] = [times[20], times[38]];
      if (process.env.PROBE) appendFileSync(process.env.PROBE, `latency done=${done.length} p50=${p50.toFixed(1)} p95=${p95.toFixed(1)} ms\n`);
      expect(p50, `done=${done.length}`).toBeLessThan(200);
      expect(p95, `done=${done.length}`).toBeLessThan(400);
    }
  }, 60_000);

  it('S88: a quest begun outside the guide is verified when its stage is unknown, and planned from its stage when known', () => {
    // The only multi-stage F2P quest; its quest-point gate is met so only the stage evidence decides.
    const quest = questCatalogue.find(q => q.id === 'Dragon Slayer I')!;
    const at = (evidence: object) => {
      const snap = { ...counted(lumbridge), questPoints: { known: true, value: quest.requirements.questPoints ?? 0, source: 'game' } } as PlanningSnapshot;
      snap.quests = { ...snap.quests, [quest.id]: { state: 'IN_PROGRESS', source: 'game', ...evidence } } as PlanningSnapshot['quests'];
      return runtimeDecision(input(snap, { walk, prices, intent: { kind: 'quest', questId: quest.id } }))!;
    };
    const unknown = at({});
    expect(unknown.activeAction.kind).toBe('VERIFY');
    expect(unknown.activeAction).not.toHaveProperty('stepId');
    const stage = quest.stepIds[1];
    const known = at({ stepId: stage });
    expect(known.objectiveId).toBe(quest.id);
    // The known stage is used: no stage check again, and whatever comes next (here a fight check at level 1) is at or after it.
    expect(known.activeAction.title).not.toMatch(/Verify the current stage/);
    if (known.activeAction.stepId) expect(quest.stepIds.indexOf(known.activeAction.stepId)).toBeGreaterThanOrEqual(1);
    expect(unknown.activeAction.title).toMatch(/Verify the current stage/);
  });

  it('S10: resuming at any stage never goes back a mandatory step, and rewards only come with the last step', () => {
    const quest = questCatalogue.find(q => q.id === 'Dragon Slayer I')!;
    const last = quest.stepIds.length - 1;
    for (let stage = 1; stage <= last; stage++) {
      const snap = { ...counted(lumbridge), questPoints: { known: true, value: quest.requirements.questPoints ?? 0, source: 'game' } } as PlanningSnapshot;
      snap.quests = { ...snap.quests, [quest.id]: { state: 'IN_PROGRESS', source: 'game', stepId: quest.stepIds[stage] } } as PlanningSnapshot['quests'];
      const decision = runtimeDecision(input(snap, { walk, prices, intent: { kind: 'quest', questId: quest.id } }))!;
      const at = decision.activeAction.stepId ? quest.stepIds.indexOf(decision.activeAction.stepId) : null;
      if (at !== null && at >= 0) expect(at, `stage ${stage}`).toBeGreaterThanOrEqual(stage);
      const rewards = decision.expectedNext.effects.filter(effect => effect.kind === 'quest' || effect.kind === 'xp');
      if (at !== last) expect(rewards, `stage ${stage}`).toEqual([]);
    }
  });

  it('S16: a few tiles of walking or a little XP inside a level keep the committed objective', () => {
    const earn = (snap: PlanningSnapshot): RuntimePlanInput['earn'] => (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, rate);
    const base = counted(lumbridge);
    const first = runtimeDecision(input(base, { walk, prices, earn: earn(base) }))!;
    const moved = counted({ x: lumbridge.x + 6, y: lumbridge.y - 4, plane: 0 });
    const trained = { ...base, xp: { ...base.xp, attack: { known: true, value: 40, source: 'game' } } } as PlanningSnapshot;
    for (const snap of [moved, trained]) {
      const next = runtimeDecision(input(snap, { walk, prices, earn: earn(snap), previous: first }))!;
      expect(next.objectiveId).toBe(first.objectiveId);
      expect(next.revision).toBe(first.revision + 1);
    }
  });

  it('S03: a fight the readiness engine could not estimate (no live Hitpoints here) is never ready; the quest waits for a review', () => {
    const carried = Object.fromEntries(names.map(name => [name, 30]));
    const snap = counted(lumbridge, [], { coins: 100_000, carried, stats: { attack: 40, strength: 40, defence: 40, hitpoints: undefined as unknown as number } });
    const decision = runtimeDecision(input(snap, { walk, prices, intent: { kind: 'quest', questId: 'Vampyre Slayer' } }))!;
    expect(decision.activeAction.kind).toBe('VERIFY');
    expect(decision.activeAction.title).toBe('Review the combat strategy for Count Draynor');
  });

  it('S42: an owner lock survives noisy level and price updates; clearing it ranks again; a completed lock never falls back', () => {
    const lock = { kind: 'quest', questId: 'Vampyre Slayer' } as const;
    const first = runtimeDecision(input(counted(lumbridge), { walk, prices, intent: lock }))!;
    expect([first.requestedObjectiveId, first.objectiveId]).toEqual(['Vampyre Slayer', 'Vampyre Slayer']);
    const wobble = fakePrices(Object.fromEntries(names.map(name => [name, { buy: 204, sell: 102 }])));
    for (const [snap, market] of [[counted(lumbridge, [], { stats: { attack: 7, mining: 12 } }), prices], [counted(lumbridge), wobble]] as const) {
      const next = runtimeDecision(input(snap, { walk, prices: market, intent: lock, previous: first }))!;
      expect([next.requestedObjectiveId, next.objectiveId]).toEqual(['Vampyre Slayer', 'Vampyre Slayer']);
    }
    expect(runtimeDecision(input(counted(lumbridge), { walk, prices, intent: { kind: 'auto' }, previous: first }))!.requestedObjectiveId).toBeUndefined();
    expect(runtimeDecision(input(counted(lumbridge, ['Vampyre Slayer']), { walk, prices, intent: lock, previous: first }))).toBeNull();
  });

  it('moves on when the chosen quest is completed out of order', () => {
    const first = runtimeDecision(input(counted(lumbridge), { walk }))!;
    const after = runtimeDecision(input(counted(lumbridge, [first.objectiveId]), { walk }))!;
    expect(after.objectiveId).not.toBe(first.objectiveId);
  });

  it('takes a reviewed run-past as proof of survival and evasion, never of a fight', () => {
    // Every quest item is in the bag, so only the capability check can hold a quest back.
    const stocked = counted(lumbridge, [], { coins: 100_000, carried: Object.fromEntries(names.map(name => [name, 30])) });
    const checked = (questId: string) => runtimeDecision(input(stocked, { walk, prices, intent: { kind: 'quest', questId } }))!.activeAction;
    expect(checked('The Restless Ghost')).toMatchObject({ kind: 'QUEST', title: 'The Restless Ghost' });
    expect(checked("The Knight's Sword")).toMatchObject({ kind: 'QUEST', title: "The Knight's Sword" });
    // A real fight is judged on its own numbers: level 1 is not ready for Count Draynor.
    expect(checked('Vampyre Slayer')).toMatchObject({ kind: 'VERIFY', title: expect.stringMatching(/Count Draynor/) });
  });

  it('extra GP gives a different plan', () => {
    expect(plan(counted(lumbridge, [], { coins: 100_000 }))).not.toBe(plan(counted(lumbridge)));
  });
  it('a banked tool changes the next action for the remaining quest', () => {
    // The remaining quest actually needs this tool; unrelated cheaper quests must not determine this counterfactual.
    const done = questCatalogue.filter(quest => quest.id !== 'X Marks the Spot').map(quest => quest.id);
    const stats = { attack: 40, strength: 44, defence: 44, hitpoints: 40, magic: 37, prayer: 15,
      mining: 20, smithing: 29, crafting: 10, cooking: 30, runecraft: 9 };
    const banked = plan(counted(lumbridge, done, { stats, bank: { Spade: 1 } }));
    const unbanked = plan(counted(lumbridge, done, { stats }));
    expect(banked).not.toBe(unbanked);
    expect(banked).toContain(':WITHDRAW:');
    expect(unbanked).toMatch(/:(BUY|EARN|GATHER):/);
  });

  // A counterfactual only matters where the route offers a choice it can change, so each one is checked along the whole
  // F2P route: the base character takes every Decision in turn, and the variant must plan differently somewhere.
  const routeSnapshot = (done: readonly string[], at = lumbridge, extra: Extra = {}): PlanningSnapshot => {
    const points = questCatalogue.filter(q => done.includes(q.id)).reduce((sum, q) => sum + (q.rewards.questPoints ?? 0), 0);
    return { ...counted(at, done, extra), questPoints: { known: true, value: points, source: 'game' }, manual: { 'Shield of Arrav:partner': true } } as PlanningSnapshot;
  };
  const differsAlongTheRoute = (variant: (done: readonly string[]) => [PlanningSnapshot, Partial<RuntimePlanInput>], baseRate: EarnRate | null = rate) => {
    const done: string[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const snap = routeSnapshot(done);
      const [other, over] = variant(done);
      const earn: RuntimePlanInput['earn'] = (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, baseRate);
      if (plan(snap, { earn }) !== plan(other, over)) return true;
      const decision = runtimeDecision(input(snap, { walk, prices, earn }));
      if (!decision) return false;
      done.push(decision.objectiveId);
    }
    return false;
  };
  const runes = [{ id: 563, name: 'Law rune', count: 5 }, { id: 556, name: 'Air rune', count: 20 }, { id: 554, name: 'Fire rune', count: 5 }];

  it('a character elsewhere on the map plans differently somewhere along the route', () => {
    expect(differsAlongTheRoute(done => [routeSnapshot(done, { x: 2964, y: 3378, plane: 0 }), {}])).toBe(true);
  }, 60_000);

  it('an extra Magic level with teleport runes plans differently somewhere along the route', () => {
    const teleports = { levels: { magic: 33 }, carried: runes, bankSeen: true, worn: [], standardSpellbook: true, members: false, homeCooldownSec: null };
    expect(differsAlongTheRoute(done => [routeSnapshot(done, lumbridge, { stats: { magic: 33 } }), { teleports }])).toBe(true);
  }, 60_000);

  it('S86: the Magic level alone, without runes, never turns a teleport on anywhere along the route', () => {
    const teleports = { levels: { magic: 33 }, carried: [], bankSeen: true, worn: [], standardSpellbook: true, members: false, homeCooldownSec: null };
    expect(differsAlongTheRoute(done => [routeSnapshot(done), { teleports }])).toBe(false);
  }, 60_000);

  it('a trade restriction plans differently somewhere along the route', () => {
    // As in the app, the earning rate comes from the Money ranking, which a restriction changes.
    // A market where hides sell best, and hides are among the items a new account cannot sell.
    const flat = Object.fromEntries(METHODS.flatMap(m => m.outputs.map(out => [out.item.name, { buy: 100, sell: 80 }])));
    const market = fakePrices({ ...flat, Cowhide: { buy: 400, sell: 380 } });
    const rateUnder = (state: 'LIFTED' | 'RESTRICTED') => {
      const restriction = tradeRestriction({ questPoints: state === 'LIFTED' ? 50 : 1, totalLevel: state === 'LIFTED' ? 500 : 30 });
      const { cash: _c, mode: _m, target: _t, needItems: _n, ...supply } = ctxOf({ prices: market, snap: fakeSnap({ levels: { attack: 1, hitpoints: 10 }, restriction }) });
      return bestEarnRate(supply, 0);
    };
    const [lifted, restricted] = [rateUnder('LIFTED'), rateUnder('RESTRICTED')];
    expect(restricted).not.toEqual(lifted);
    expect(differsAlongTheRoute(done => {
      const snap = routeSnapshot(done);
      return [snap, { restriction: 'RESTRICTED', earn: (step, gp, _budget, goalId) => earnAction(snap, step, goalId, gp, restricted) }];
    }, lifted)).toBe(true);
  }, 60_000);
});


