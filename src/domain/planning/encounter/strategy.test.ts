import { describe, expect, it } from 'vitest';
import type { Step } from '../../../types';
import { gearData, gearPieceByName } from '../../combat/gearAdvisor';
import { buildPlayerState } from '../../player/playerState';
import { emptyProgress } from '../../persistence/progress';
import { nameKey } from '../../items/itemKey';
import { fakePrices } from '../../../../tests/funding/helpers';
import type { OwnedItem } from '../../items/checklist';
import type { PlanningSnapshot } from '../contracts';
import { createTacticalResolver, type TacticalInput } from '../tactical';
import { earnAction } from '../earn';
import { trainedCombatStats, fightTrainingTarget } from '../../readiness/stepAssessment';
import { estimateStepFights } from '../../combat/fightEstimate';
import { xpForLevel } from '../../player/xp';
import { runtimeDecision } from '../runtime';
import type { QuestFact } from '../catalogue';
import { itemById } from '../../../data';
import { decisionStep } from '../../../state/decision';
import { resolveActiveActivity } from '../../quests/activeActivity';
import { createReadinessEngine } from '../../readiness/readinessEngine';
import { aggregateShopping } from '../../prep/shopping';
import { shopRows } from '../../economy/shoppingView';
import { toInGameTarget } from '../../guide/inGameTarget';
import { planningWindow } from '../window';
import { prerequisiteTraining } from '../training';
import { chooseEncounter } from './strategy';

const fight: Step = { id: 'S99-01', title: 'A supported quest encounter', stage: 1, type: 'quest', requires: [],
  foes: ['Black Knight'], doneWhen: 'Observed quest stage', mapLocation: { x: 3030, y: 3500, plane: 0, label: 'Encounter' },
  itemsRequired: [{ nameEn: 'Trout', amount: 26, heals: 7, howToGet: '' }] };
function fixture(level = 1, coins = 5000, worn: string[] = [], bank: string[] = [], archer?: { ranged: number; arrows: number; carried?: number; arrow?: string }): TacticalInput {
  const progress = emptyProgress();
  const stats = { attack: level, strength: level, defence: level, hitpoints: Math.max(10, level), magic: level, ranged: archer?.ranged ?? 1, prayer: 1 };
  const equipment = [...worn.map(name => { const p = gearPieceByName(name)!; return { name, id: p.id, slot: p.slot === 'neck' ? 'amulet' : p.slot, count: 1 }; }),
    ...(archer ? [{ name: archer.arrow ?? 'Mithril arrow', id: 888, slot: 'ammo', count: archer.arrows }] : [])];
  const gear = { equipment, inventory: [{ name: 'Trout', id: 333, count: 26 }, ...(archer?.carried ? [{ name: 'Mithril arrow', id: 888, count: archer.carried }] : [])], coins, bankCoins: 0 };
  const owned = { bankSeen: true, items: new Map<string, OwnedItem>([...gearData.items.map(p => [nameKey(p.name), { name: p.name, carried: 0, bank: bank.includes(p.name) ? 1 : 0, noted: 0 }] as const),
    ['trout', { name: 'Trout', carried: 26, bank: 0, noted: 0 }] as const, ['mithril arrow', { name: 'Mithril arrow', carried: archer?.carried ?? 0, bank: 0, noted: 0 }] as const,
    ['bronze arrow', { name: 'Bronze arrow', carried: 0, bank: 0, noted: 0 }] as const]) };
  const snapshot: PlanningSnapshot = { scope: { characterId: 'Combat', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
    player: buildPlayerState({ progress, mode: 'f2p', stats, gear, owned, questsDone: [], connected: true, position: { x: 3164, y: 3486, plane: 0 } }),
    combat: { stats, gear }, xp: {}, quests: {}, questPoints: { known: true, value: 0, source: 'game' }, manual: {} };
  return { snapshot, progress, prices: fakePrices({ Trout: { buy: 10 }, 'Mithril arrow': { buy: 20 }, 'Bronze arrow': { buy: 2 }, 'Willow shortbow': { buy: 40 } }), window: [], ironman: false, earn: () => null,
    walk: () => ({ fast: 1, typical: 2, slow: 3, source: 'Fixture routed walking' }) };
}

describe('complete encounter strategy comparison', () => {
  it('keeps an already strong, adequately supplied player on the quest without buying gear or food', () => {
    const input = fixture(40);
    const before = JSON.stringify(input.snapshot);
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action).toBeNull();
    expect(result.encounter?.reasons[0]).toContain('Current equipment');
    expect(result.step.itemsRequired?.filter(i => i.heals).every(i => Number(i.amount) < 26)).toBe(true);
    expect(JSON.stringify(input.snapshot)).toBe(before);
  });
  it('a bow fight carries the arrows it shoots, as it carries the food', () => {
    const ready = createTacticalResolver(fixture(30, 5000, ['Maple shortbow'], [], { ranged: 50, arrows: 500 })).resolve(fight, 'test');
    expect(ready.action).toBeNull();
    const quiver = ready.step.itemsRequired?.find(i => i.nameEn === 'Mithril arrow');
    expect(quiver).toMatchObject({ equip: true });
    expect(Number(quiver?.amount)).toBeGreaterThan(5);
    expect(Number(quiver?.amount)).toBeLessThan(500);
    // Five arrows do not last the fight: the plan gets the rest before it, and never calls the fight ready.
    const short = createTacticalResolver(fixture(30, 5000, ['Maple shortbow'], [], { ranged: 50, arrows: 5 })).resolve(fight, 'test');
    expect(short.action).toMatchObject({ kind: 'BUY', title: 'Get Mithril arrow' });
    // Bought: the bag's arrows go into the quiver with the worn ones, nothing more is bought.
    const bought = createTacticalResolver(fixture(30, 5000, ['Maple shortbow'], [], { ranged: 50, arrows: 5, carried: Number(quiver?.amount) - 5 })).resolve(fight, 'test');
    expect(bought.action).toMatchObject({ kind: 'EQUIP', title: 'Equip Mithril arrow' });
  });
  it('offers a bow user the bow the Ranged level unlocks, with arrows it fires, when the worn bow is not safe', () => {
    const result = createTacticalResolver(fixture(1, 5000, ['Shortbow'], [], { ranged: 20, arrows: 500, arrow: 'Bronze arrow' })).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'BUY', title: 'Get Willow shortbow' });
    expect(result.encounter?.reasons[0]).toMatch(/^Combat strategy: Willow shortbow \+ (Bronze|Mithril) arrow\./);
    expect(result.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: 'Willow shortbow', equip: true }));
  });
  it('buys a justified affordable upgrade when its complete preparation is faster than training', () => {
    const result = createTacticalResolver(fixture(20)).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'BUY', title: 'Get Mithril scimitar' });
    expect(result.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: 'Mithril scimitar', equip: true }));
    expect(result.action?.executionStep).toBe(result.step);
    expect(result.encounter?.reasons.join(' ')).toContain('Train attack to 26');
    expect(result.preparationMinutes?.typical).toBeLessThan(10);
  });
  it('trains with almost no GP when no supported funding method can finance a useful upgrade', () => {
    const result = createTacticalResolver(fixture(20, 0)).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'TRAIN', id: expect.stringContaining(':TRAIN:attack:') });
    expect(result.step.followsMethod).toBe('attack');
    expect(result.encounter?.reasons[0]).toContain('Train attack to 26');
    expect(result.step.itemsRequired?.some(i => i.nameEn === 'Mithril scimitar')).toBe(false);
  });
  it('withdraws suitable owned equipment instead of rebuying it', () => {
    const input = fixture(20, 0, [], ['Mithril scimitar']);
    const before = JSON.stringify([...input.snapshot.player.owned!.items]);
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'WITHDRAW', title: 'Withdraw Mithril scimitar', gpCost: null, expectedEffects: [] });
    expect(result.plan.lines.find(l => l.name === 'Mithril scimitar')?.where).toBe('BANK');
    expect(JSON.stringify([...input.snapshot.player.owned!.items])).toBe(before);
  });
  it('equips a suitable carried item instead of buying it', () => {
    const input = fixture(20, 0);
    const piece = gearPieceByName('Mithril scimitar')!;
    input.snapshot.player.owned!.items.get('mithril scimitar')!.carried = 1;
    input.snapshot.combat!.gear!.inventory!.push({ name: piece.name, id: piece.id, count: 1 });
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'EQUIP', title: 'Equip Mithril scimitar', expectedEffects: [] });
  });
  it('prefers training to an affordable purchase whose travel makes it slower', () => {
    const input = fixture(20);
    input.walk = (_from, to) => ({ fast: to.x > 3200 ? 100 : 1, typical: to.x > 3200 ? 120 : 2, slow: to.x > 3200 ? 140 : 3, source: 'Fixture routed distant shop' });
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action?.kind).toBe('TRAIN');
    expect(result.encounter?.reasons.join(' ')).toContain('Mithril scimitar');
  });
  it('trains first, then upgrades equipment when the actual unlock is the faster strategy', () => {
    const input = fixture(19);
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'TRAIN', id: expect.stringContaining(':TRAIN:attack:20:') });
    expect(result.encounter?.reasons[0]).toContain('Train attack to 20, then Mithril scimitar');
    expect(input.snapshot.combat?.stats?.strength).toBe(19);
    expect(input.snapshot.player.owned?.items.get('mithril scimitar')?.carried).toBe(0);
  });
  it('does not claim safety or spend money for unknown or unsupported mechanics', () => {
    // Count Draynor in a step without the stake and hammer is not his modelled fight; the unknown foe has no numbers at all.
    for (const foe of ['Count Draynor', 'Synthetic unknown foe']) {
      const result = createTacticalResolver(fixture(40, 100000)).resolve({ ...fight, foes: [foe] }, 'test');
      expect(result.action?.kind).toBe('VERIFY');
      expect(result.encounter).toBeUndefined();
    }
  });
  it('plans a fight with special mechanics from the data instead of a check: levels, kit and food', () => {
    const kit = (names: string[]) => names.map(nameEn => ({ nameEn, amount: 1, howToGet: '' }));
    const carrying = (input: TacticalInput, names: string[]) => {
      for (const name of names) {
        input.snapshot.player.owned!.items.set(nameKey(name), { name, carried: 1, bank: 0, noted: 0 });
        input.snapshot.combat!.gear!.inventory!.push({ name, id: gearPieceByName(name)?.id ?? 1, count: 1 });
      }
      return input;
    };
    const draynor: Step = { ...fight, foes: ['Count Draynor'], itemsRequired: [...fight.itemsRequired!, ...kit(['Garlic', 'Stake', 'Hammer'])] };
    const strong = createTacticalResolver(carrying(fixture(40), ['Garlic', 'Stake', 'Hammer'])).resolve(draynor, 'test');
    expect(strong.action).toBeNull();
    expect(strong.encounter?.reasons[0]).toContain('Current equipment');
    // Too weak to outpace his regeneration: trained first, never sent in and never left with a check.
    const weak = createTacticalResolver(carrying(fixture(5, 0), ['Garlic', 'Stake', 'Hammer'])).resolve(draynor, 'test');
    expect(weak.action?.kind).toBe('TRAIN');
    expect(weak.encounter?.reasons[0]).toMatch(/Combat strategy: Train /);
    // Delrith is fought with Silverlight: no other weapon is bought or trained for.
    const delrith = createTacticalResolver(fixture(10)).resolve({ ...fight, foes: undefined, threats: ['Delrith'] }, 'test');
    expect(delrith.encounter).toBeDefined();
    expect(delrith.encounter!.reasons.join(' ')).not.toMatch(/scimitar|sword|mace|dagger|warhammer|battleaxe/);
    expect(delrith.action?.kind).not.toBe('VERIFY');
    // Elvarg: the Anti-dragon shield stays on in every option, so no kiteshield and no two-handed weapon is proposed.
    const elvarg: Step = { ...fight, foes: undefined, threats: ['Elvarg'], itemsRequired: [{ nameEn: 'Lobster', amount: 20, heals: 12, howToGet: '' }, ...kit(['Anti-dragon shield'])] };
    const dragon = createTacticalResolver(fixture(30, 200_000, ['Anti-dragon shield'])).resolve(elvarg, 'test');
    expect(dragon.encounter?.reasons[0]).toMatch(/Combat strategy: Train attack, strength, defence to \d+, then /);
    expect(dragon.encounter!.reasons.join(' ')).not.toMatch(/kiteshield|sq shield|2h sword|battleaxe|warhammer/);
    expect(dragon.action?.kind).not.toBe('VERIFY');
    // Carried, the shield goes on as the last preparation, after any training or kit: with no money for kit it is the next action.
    const unshielded = createTacticalResolver(carrying(fixture(60, 0, ['Rune scimitar']), ['Anti-dragon shield'])).resolve(elvarg, 'test');
    expect(unshielded.action).toMatchObject({ kind: 'EQUIP', title: expect.stringContaining('Anti-dragon shield') });
  });
  it('replans after actually acquiring and wearing the proposed item', () => {
    const before = createTacticalResolver(fixture(20)).resolve(fight, 'test');
    const after = createTacticalResolver(fixture(20, 0, ['Mithril scimitar'])).resolve(fight, 'test');
    expect(before.action?.kind).toBe('BUY');
    expect(after.action).toBeNull();
    expect(after.encounter?.reasons[0]).toContain('Current equipment');
  });
  it('compares earning plus purchase with training: fast funding wins, slow funding loses', () => {
    const run = (perHour: number) => {
      const input = fixture(20, 100);
      input.earn = (step, total, budget, id) => earnAction(input.snapshot, step, id, total - (budget.liquid.amount ?? 0), {
        methodId: 'fixture', title: 'Supported earning', netPerHour: { fast: perHour, typical: perHour, slow: perHour } });
      return createTacticalResolver(input).resolve(fight, 'test');
    };
    const fast = run(60000), slow = run(100);
    expect(fast.action).toMatchObject({ kind: 'EARN', title: 'Earn 950 gp: Supported earning' });
    expect(fast.action?.completionEvidence[0].predicate).toBe('Liquid GP covers 1050');
    expect(fast.step.itemsRequired).toContainEqual(expect.objectContaining({ nameEn: 'Mithril scimitar' }));
    expect(slow.action?.kind).toBe('TRAIN');
    expect(slow.encounter?.reasons.join(' ')).toContain('Mithril scimitar');
    expect(fast.preparationMinutes!.typical).toBeLessThan(slow.preparationMinutes!.typical);
  });
  it('uses only the selected skill and its damage-earned HP; a one-level-short forecast is not certified', () => {
    const input = fixture(20, 0), stats = input.snapshot.combat!.stats!, gear = input.snapshot.combat!.gear!;
    const xp = { attack: xpForLevel(20), hitpoints: xpForLevel(20) };
    const target = fightTrainingTarget(fight, stats, gear, 'attack', xp)!;
    const future = trainedCombatStats(stats, 'attack', target.level, xp);
    expect(future).toMatchObject({ strength: 20, defence: 20, magic: 20 });
    expect(future.hitpoints).toBeGreaterThanOrEqual(20);
    expect(future.hitpoints).toBeLessThan(target.level);
    expect(estimateStepFights(fight, future, gear).reduce((n, f) => n + f.food.high, 0)).toBeLessThanOrEqual(26);
    const short = trainedCombatStats(stats, 'attack', target.level - 1, xp);
    expect(estimateStepFights(fight, short, gear).reduce((n, f) => n + f.food.high, 0)).toBeGreaterThan(26);
    expect(stats.attack).toBe(20);
  });
  it('preserves Defence-at-1, account trading restrictions and unknown-route evidence', () => {
    const input = fixture(20, 0);
    input.keepDefenceOne = true;
    input.ironman = true;
    input.walk = () => null;
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action?.id).not.toContain(':TRAIN:defence:');
    expect(result.action?.kind).not.toBe('BUY');
    expect(result.preparationMinutes).toBeNull();
    expect(result.encounter?.reasons[0]).toContain('Time comparison incomplete');
  });
  it('carries one chosen action and kit through Decision, preparation, Shopping/Gear activity, Ledger reasons and the bridge', () => {
    const input = fixture(20);
    const goal: QuestFact = { id: 'Fixture encounter', stepIds: [fight.id], members: false,
      requirements: { skills: {}, questPoints: 0, quests: [], text: '', capabilities: ['combat'] },
      rewards: { questPoints: 1, xp: {} }, length: 'Short', source: { url: 'https://oldschool.runescape.wiki/w/Black_Knight', revision: 1, retrievedAt: 'fixture' } };
    input.snapshot.quests = { [goal.id]: { state: 'NOT_STARTED', source: 'game' } };
    const decision = runtimeDecision({ ...input, steps: [fight], catalogue: [goal], intent: { kind: 'quest', questId: goal.id },
      ironman: false, detail: id => itemById.get(id) })!;
    expect(decision.activeAction).toMatchObject({ kind: 'BUY', title: 'Get Mithril scimitar', stepId: fight.id });
    expect(decision.why.join(' ')).toContain('Combat strategy: Mithril scimitar');
    const execution = decisionStep(decision, [fight])!;
    const activity = resolveActiveActivity({ steps: [fight], progress: input.progress, decided: execution, activeStepId: fight.id });
    expect(activity.step).toBe(execution); // The game reporting the same ID must not restore the authored kit.
    const window = planningWindow({ snapshot: input.snapshot, decision, current: execution, catalogue: [goal], steps: [fight] });
    const engine = createReadinessEngine({ steps: [execution], window, state: input.snapshot.player, progress: input.progress, mode: 'f2p', qp: 0, prices: input.prices });
    expect(engine.plan(execution).lines.find(l => l.name === 'Mithril scimitar')).toMatchObject({ where: 'MISSING', equip: true });
    const rows = shopRows(aggregateShopping([activity.step!]), { state: input.snapshot.player, detail: id => itemById.get(id),
      onGe: () => false, gePrice: () => null, priceOf: name => input.prices.buy(name)?.price ?? null, qp: 0 });
    expect(rows.find(r => r.name === 'Mithril scimitar')).toMatchObject({ channel: 'shop', qty: 1 });
    const payload = toInGameTarget(execution)!;
    expect(payload.checklist).toContainEqual(expect.objectContaining({ name: 'Mithril scimitar', equip: true, count: 1 }));
    expect(payload.guide?.items).toContainEqual(expect.objectContaining({ name: 'Mithril scimitar', count: 1 }));
    expect([...(payload.watchItems ?? []), ...(payload.checklist ?? []).map(i => i.name)]).toContain('Mithril scimitar');
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThan(65536);
    expect(fight.itemsRequired?.some(i => i.nameEn === 'Mithril scimitar')).toBe(false);
    expect(input.snapshot.player.owned?.items.get('mithril scimitar')?.carried).toBe(0);
  });
  it('keeps the committed future payment reserve while returning from a virtual training action', () => {
    const input = fixture(20, 3000);
    const goal: QuestFact = { id: 'Encounter', stepIds: [fight.id], members: false,
      requirements: { skills: {}, questPoints: 0, quests: [], text: '', capabilities: ['combat'] }, rewards: { questPoints: 1, xp: {} },
      length: 'Short', source: { url: 'https://oldschool.runescape.wiki/w/Black_Knight', revision: 1, retrievedAt: 'fixture' } };
    const fee: Step = { ...fight, id: 'S99-02', title: 'Required later payment', foes: undefined,
      itemsRequired: [{ nameEn: 'Coins', amount: 2000, howToGet: '' }] };
    const later = { ...goal, id: 'Later', stepIds: [fee.id], requirements: { ...goal.requirements, capabilities: [] } };
    input.snapshot.quests = { Encounter: { state: 'NOT_STARTED', source: 'game' }, Later: { state: 'NOT_STARTED', source: 'game' } };
    const options = { ...input, steps: [fight, fee], catalogue: [goal, later], intent: { kind: 'quest' as const, questId: goal.id }, ironman: false,
      detail: (id: number) => itemById.get(id) };
    const first = runtimeDecision(options)!;
    expect(first.activeAction).toMatchObject({ kind: 'BUY', gpCost: { amount: 1050 } });
    const virtual = prerequisiteTraining({ snapshot: input.snapshot, goalId: goal.id, skill: 'attack', target: 26, prices: input.prices })!.step!;
    const previous = { ...first, followingObjectiveId: later.id,
      activeAction: { ...first.activeAction, kind: 'TRAIN' as const, stepId: virtual.id, executionStep: virtual } };
    const window = planningWindow({ snapshot: input.snapshot, decision: previous, current: virtual, catalogue: [goal, later], steps: [fight, fee] });
    expect(window.map(s => s.id)).toEqual([virtual.id, fight.id, fee.id]);
    expect(createTacticalResolver({ ...input, window }).resolve(fight, goal.id).budget.reserve).toBe(2000);
    const protectedPlan = runtimeDecision({ ...options, previous })!;
    expect(protectedPlan.activeAction.gpCost?.amount ?? 0).toBeLessThanOrEqual(1000);
    expect(protectedPlan.activeAction.title).not.toBe('Get Mithril scimitar'); // 3,000 - 1,050 violates the reserved 2,000 GP payment.
    expect(input.snapshot.player.coins.bag).toMatchObject({ value: 3000 });
  });
  it('ranks an option with fewer unknown parts first: an unrouted purchase beats training whose two trips are unknown', () => {
    const input = fixture(20);
    input.walk = () => null; // No route at all: every option is incomplete, and none may win by what it leaves out.
    const result = createTacticalResolver(input).resolve(fight, 'test');
    expect(result.action).toMatchObject({ kind: 'BUY', title: 'Get Mithril scimitar' });
    expect(result.preparationMinutes).toBeNull();
    expect(result.encounter?.reasons[0]).toContain('Time comparison incomplete');
  });
  it('never counts unknown training time as zero: the unmeasured skill loses to measured ones and to less unmeasured XP', () => {
    const input = fixture(20, 0);
    const resolver = createTacticalResolver(input);
    const candidates = (unknown: readonly string[]) => (skill: string, target: number) => {
      const candidate = prerequisiteTraining({ snapshot: input.snapshot, goalId: 'test', skill, target, prices: input.prices });
      return candidate && unknown.includes(skill) ? { ...candidate, remaining: null } : candidate;
    };
    const choose = (unknown: readonly string[]) => chooseEncounter(input, fight, 'test', step => resolver.resolve(step, 'test'), candidates(unknown), 0)!;
    const measured = choose([]);
    const skill = /Train (\w+) to/.exec(measured.encounter.reasons[0])![1];
    // The fastest measured option loses its time: it must not stay first as a zero-minute detour.
    const partly = choose([skill]);
    expect(partly.encounter.reasons[0]).toContain('Lowest estimated complete time');
    expect(partly.encounter.reasons[0]).not.toContain(`Train ${skill} to`);
    // Nothing is measured: the least XP still to earn comes first, never the quickest kill behind the longest grind.
    const none = choose(['attack', 'strength', 'defence']);
    expect(none.encounter.reasons[0]).toContain('Time comparison incomplete');
    const [, first, level] = /Train ([\w, ]+) to (\d+)/.exec(none.encounter.reasons[0])!;
    const stats = input.snapshot.combat!.stats!;
    const xp = (label: string, to: number) => label.split(', ').reduce((sum, name) => sum + xpForLevel(to) - xpForLevel(stats[name]), 0);
    for (const line of none.encounter.reasons.slice(1)) {
      const other = /^Train ([\w, ]+) to (\d+)/.exec(line);
      if (other) expect(xp(other[1], Number(other[2])), line).toBeGreaterThanOrEqual(xp(first, Number(level)));
    }
  });
  it('offers a weak character even training instead of one skill to an absurd level', () => {
    const weak = fixture(5, 0);
    const result = createTacticalResolver(weak).resolve(fight, 'test');
    const [, skills, level] = /Combat strategy: Train ([\w, ]+) to (\d+)/.exec(result.encounter!.reasons[0])!;
    expect(skills).toBe('attack, strength, defence');
    expect(Number(level)).toBeLessThan(40);
    // Lowest skill first; the single-skill alternatives stay visible but need far higher levels.
    expect(result.action).toMatchObject({ kind: 'TRAIN', id: expect.stringContaining(':TRAIN:attack:') });
    const single = result.encounter!.reasons.flatMap(line => { const m = /^Train (\w+) to (\d+)/.exec(line); return m ? [Number(m[2])] : []; });
    expect(single.every(target => target > Number(level))).toBe(true);
    expect(weak.snapshot.combat?.stats).toMatchObject({ attack: 5, strength: 5, defence: 5 });
    const pure = fixture(5, 0);
    pure.keepDefenceOne = true;
    const kept = createTacticalResolver(pure).resolve(fight, 'test');
    expect(kept.encounter?.reasons.join(' ')).not.toMatch(/defence/);
    expect(kept.action?.id).not.toContain(':TRAIN:defence:');
  });
  it('verifies an unread bank balance rather than silently dropping the otherwise feasible purchase strategies', () => {
    const input = fixture(20, 0);
    input.snapshot.player.coins.bank = { known: false };
    input.snapshot.combat!.gear!.bankCoins = null;
    input.prices = fakePrices(Object.fromEntries([...gearData.items.map(p => [p.name, { buy: 200 }]), ['Trout', { buy: 10 }]]));
    const frame = chooseEncounter(input, fight, 'test', () => { throw Error('No supported training method'); }, () => null, 0)!;
    expect(frame.action).toMatchObject({ kind: 'VERIFY', title: 'Check your bank balance before earning more' });
    expect(frame.preparationMinutes).toBeNull();
    expect(frame.encounter.uncertain).toBe(true);
  });
});
