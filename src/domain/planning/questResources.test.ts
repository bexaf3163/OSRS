import { describe, expect, it } from 'vitest';
import { allSteps } from '../../data';
import { questCatalogue, questExecutionSteps } from './catalogue';
import type { QuestFact } from './catalogue';
import type { PlanningSnapshot } from './contracts';
import { observedProjection, projectSuccess } from './decision';
import { forecastQuestResources } from './questResources';
import { buildPlayerState } from '../player/playerState';
import { nameKey } from '../items/itemKey';
import { fakePrices } from '../../../tests/funding/helpers';
import { createQuestModel } from './questModel';
import { createTacticalResolver } from './tactical';
import { emptyProgress } from '../persistence/progress';
import { noTime } from './cost';

function fixture(id: string, quantities: Record<string, number> = {}, cash = 1000) {
  const goal = questCatalogue.find(q => q.id === id)!;
  const steps = goal.stepIds.map(id => allSteps.find(step => step.id === id)!);
  const snapshot: PlanningSnapshot = { scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 },
    xp: {}, manual: {}, quests: { [goal.id]: { state: 'NOT_STARTED', source: 'game' } }, questPoints: { known: true, value: 0, source: 'game' },
    player: buildPlayerState({ mode: 'f2p', connected: true, stats: {}, questsDone: [], progress: { levels: {} },
      gear: { equipment: [], inventory: [], coins: cash, bankCoins: 0 },
      owned: { bankSeen: true, items: new Map(Object.entries(quantities).map(([name, bank]) => [nameKey(name), { name, carried: 0, noted: 0, bank }])) } }) };
  return { goal, steps, snapshot, projection: observedProjection(snapshot), prices: fakePrices({ Clay: { buy: 10 }, 'Copper ore': { buy: 20 }, 'Iron ore': { buy: 30 },
    'Black bead': { buy: 10 }, 'White bead': { buy: 10 }, 'Red bead': { buy: 10 }, 'Yellow bead': { buy: 10 }, 'Ball of wool': { buy: 10 },
    Egg: { buy: 10 }, 'Bucket of milk': { buy: 10 }, 'Pot of flour': { buy: 10 } }),
  ironman: false as boolean | null, detail: () => undefined };
}
const effects = (result: NonNullable<ReturnType<typeof forecastQuestResources>>) => result.changes.map(change => ({ kind: 'resources' as const, afterSuccessOnly: true as const, change }));

describe('reviewed quest resource flows', () => {
  it('keeps Rune Mysteries talisman ownership physical, counts its returned new talisman once, and retires internal exchanges only', () => {
    const input = fixture('Rune Mysteries', { 'Air talisman': 2, 'Research package': 1, Notes: 1, Hammer: 1 });
    const forecast = forecastQuestResources(input)!;
    expect(forecast.procurement.requiredGp).toBe(0);
    const after = projectSuccess(input.projection, effects(forecast));
    expect(after.resources?.items['air talisman']).toEqual({ floor: 3, complete: true });
    expect(after.resources?.items['research package']).toEqual({ floor: 0, complete: false });
    expect(after.resources?.items.notes).toEqual({ floor: 0, complete: false });
    expect(after.resources?.items.hammer).toEqual(input.projection.resources?.items.hammer);
    expect(after.resources?.gp).toEqual(input.projection.resources?.gp);
    expect(input.snapshot.player.owned?.items.get('air talisman')?.bank).toBe(2);
    input.snapshot.quests = { [input.goal.id]: { state: 'IN_PROGRESS', source: 'game', stepId: input.steps[0].id } };
    expect(forecastQuestResources(input)).toBeNull(); // A resumed stage does not receive the whole-quest gift again.
  });

  it('consumes Romeo berries once without promising a leftover potion, and preserves the authored acquisition in a resumed stage', () => {
    const input = fixture('Romeo & Juliet', { 'Cadava berries': 1, 'Cadava potion': 1, Message: 1 });
    const after = projectSuccess(input.projection, effects(forecastQuestResources(input)!));
    expect(after.resources?.items['cadava berries']).toEqual({ floor: 0, complete: true });
    expect(after.resources?.items['cadava potion']).toEqual({ floor: 0, complete: false });
    const started = { [input.goal.id]: { state: 'IN_PROGRESS' as const, source: 'game', stepId: input.steps[0].id } };
    expect(questExecutionSteps(input.steps, [input.goal], started)[0].itemsRequired).toEqual(input.steps[0].itemsRequired);
    expect(questExecutionSteps(input.steps, [input.goal], input.snapshot.quests)[0].itemsRequired?.find(item => item.nameEn === 'Cadava berries')).toMatchObject({ inStep: false, amount: 1 });
    expect(forecastQuestResources({ ...input, snapshot: { ...input.snapshot, quests: started } })).toBeNull();
  });

  it('keeps the X Marks spade, conditional clue reward and unassigned lamp separate from expendable quest objects', () => {
    const input = fixture('X Marks the Spot', { Spade: 1, 'Treasure scroll': 1, 'Mysterious orb': 1, 'Ancient casket': 1,
      'Antique lamp': 0, 'Scroll box (beginner)': 1 });
    const forecast = forecastQuestResources(input)!;
    expect(forecast.procurement.requiredGp).toBe(0);
    const after = projectSuccess(input.projection, effects(forecast));
    expect(after.resources?.items.spade).toEqual({ floor: 1, complete: true });
    expect(after.resources?.items['ancient casket']).toEqual({ floor: 0, complete: false });
    expect(after.resources?.items['antique lamp']).toEqual({ floor: 0, complete: false });
    expect(after.resources?.items['scroll box (beginner)']).toEqual({ floor: 1, complete: false });
    expect(after.xp).toEqual({});
    expect(after.resources?.gp.floor).toBe(1000); // Direct cash belongs to the quest reward model, never duplicated here.
  });

  it('preserves owned escape/puzzle kit without manufacturing extra amulets, spades or assigned lamp XP', () => {
    for (const [id, kit, internal] of [['The Restless Ghost', 'Ghostspeak amulet', "Ghost's skull"],
      ['Ernest the Chicken', 'Spade', 'Oil can']]) {
      const input = fixture(id, { [kit]: 2, [internal]: 1, Hammer: 1, 'Antique lamp': 0 });
      const forecast = forecastQuestResources(input)!;
      expect(forecast.procurement.requiredGp).toBe(0);
      const after = projectSuccess(input.projection, effects(forecast));
      expect(after.resources?.items[nameKey(kit)]).toEqual({ floor: 2, complete: false });
      expect(after.resources?.items[nameKey(internal)]).toEqual({ floor: 0, complete: false });
      expect(after.resources?.items.hammer).toEqual({ floor: 1, complete: true });
      expect(after.resources?.gp).toEqual(input.projection.resources?.gp);
      expect(after.xp).toEqual({});
      expect(input.snapshot.player.owned?.items.get(nameKey(internal))?.bank).toBe(1);
      input.snapshot.quests = { [id]: { state: 'IN_PROGRESS', source: 'game', stepId: input.steps[0].id } };
      expect(forecastQuestResources(input)).toBeNull();
    }
  });

  it('consumes the Cook ingredients without inventing empty-container returns or discarding unrelated known stock and money', () => {
    const input = fixture("Cook's Assistant", { Egg: 1, 'Bucket of milk': 1, 'Pot of flour': 1, Bucket: 2, Pot: 3, Hammer: 1 });
    const result = forecastQuestResources(input)!;
    const after = projectSuccess(input.projection, effects(result));
    expect(after.resources?.items.egg).toEqual({ floor: 0, complete: true });
    expect(after.resources?.items['bucket of milk'].floor).toBe(0);
    expect(after.resources?.items['pot of flour'].floor).toBe(0);
    expect(after.resources?.items.bucket).toEqual({ floor: 2, complete: false });
    expect(after.resources?.items.pot).toEqual({ floor: 3, complete: false });
    expect(after.resources?.items.hammer).toEqual({ floor: 1, complete: true });
    expect(after.resources?.gp).toEqual({ floor: 1000, complete: true });
    expect(input.snapshot.player.owned?.items.get('bucket')?.bank).toBe(2);
  });

  it('spends twelve Doric materials once and credits the start pickaxe only before the quest starts', () => {
    const input = fixture("Doric's Quest", { Clay: 6, 'Copper ore': 4, 'Iron ore': 2, 'Bronze pickaxe': 0 });
    const forecast = forecastQuestResources(input)!;
    expect(forecast).not.toBeNull();
    const after = projectSuccess(input.projection, effects(forecast));
    expect(after.resources?.items.clay.floor).toBe(0);
    expect(after.resources?.items['bronze pickaxe'].floor).toBe(1);
    expect(after.resources?.gp.floor).toBe(1000);
    expect(after.resources?.position).toBeNull(); // No end-point route proof was supplied by this resource-only model.
    expect(input.snapshot.player.owned?.items.get('clay')?.bank).toBe(6);
    input.snapshot.quests = { [input.goal.id]: { state: 'IN_PROGRESS', source: 'game', stepId: input.steps[0].id } };
    const started = forecastQuestResources(input)!;
    expect(started.changes[0].items).toEqual([]);
  });

  it('prices missing materials before consumption and never finances them with the quest reward', () => {
    const input = fixture("Doric's Quest", { Clay: 0, 'Copper ore': 0, 'Iron ore': 0, 'Bronze pickaxe': 0 });
    const consulted: number[] = [];
    const forecast = forecastQuestResources({ ...input, detail: id => { consulted.push(id); return undefined; } })!;
    expect(forecast.procurement.requiredGp).toBe(200);
    const clay = input.steps.flatMap(step => step.itemsRequired ?? []).find(item => item.nameEn === 'Clay')!;
    expect(clay.wikiItemId).toBeDefined();
    expect(consulted).toContain(clay.wikiItemId); // Source routing keeps the authored item identity and its shop/free-source lookup.
    const after = projectSuccess(input.projection, effects(forecast));
    expect(after.resources?.gp.floor).toBe(800);
    expect(after.resources?.items['iron ore'].floor).toBe(0);
    expect(forecastQuestResources({ ...input, projection: { ...input.projection, resources: { ...input.projection.resources!, gp: { floor: 199, complete: true } } } })).toBeNull();
  });

  it('exchanges the physical beads for the accuracy amulet, without fabricating live equipment or quest completion', () => {
    const input = fixture('Imp Catcher', Object.fromEntries(['Black bead', 'White bead', 'Red bead', 'Yellow bead', 'Amulet of accuracy'].map(n => [n, n.endsWith('bead') ? 1 : 0])));
    const after = projectSuccess(input.projection, effects(forecastQuestResources(input)!));
    expect(after.resources?.items['black bead'].floor).toBe(0);
    expect(after.resources?.items['amulet of accuracy'].floor).toBe(1);
    expect(after.completed.has(input.goal.id)).toBe(false);
    expect(input.snapshot.player.equipment).toEqual({});
    expect(input.snapshot.player.owned?.items.get('amulet of accuracy')?.bank).toBe(0);
  });

  it('composes actual procurement, tactical preparation and quest lookahead without consuming or completing anything live', () => {
    const input = fixture('Imp Catcher', { 'Black bead': 0, 'White bead': 0, 'Red bead': 0, 'Yellow bead': 0 });
    const tactical = createTacticalResolver({ ...input, progress: emptyProgress(), window: input.steps, earn: () => null });
    const model = createQuestModel(input.snapshot, [input.goal], input.steps, {
      prepare(step, goal, snapshot, projection) {
        const forecast = forecastQuestResources({ ...input, goal, snapshot, projection });
        return { action: tactical.resolve(step, goal.id).action, minutes: null, capabilities: {}, resources: forecast?.changes ?? null };
      },
      work: () => null, travel: () => null, training: () => null, remainingPreparation: () => noTime(),
    });
    const evaluation = model.evaluate(input.goal.id, input.projection)!;
    expect(evaluation.activeAction.kind).toBe('BUY');
    expect(evaluation.activeAction.expectedEffects).toEqual([]);
    const after = projectSuccess(input.projection, evaluation.effects);
    expect(after.resources?.gp.floor).toBe(960);
    expect(after.resources?.items['black bead'].floor).toBe(0);
    expect(after.resources?.items['amulet of accuracy'].floor).toBe(1);
    expect(after.completed.has('Imp Catcher')).toBe(true); // Search branch only.
    expect(input.snapshot.quests['Imp Catcher'].state).toBe('NOT_STARTED');
    expect(input.snapshot.player.coins.bag).toMatchObject({ value: 1000 });
    expect(tactical.resolve(input.steps[0], input.goal.id).action?.kind).toBe('BUY');
  });

  it('does not rebuy twenty wool after an unknown partial delivery or invent its remaining quantity', () => {
    const input = fixture('Sheep Shearer', { 'Ball of wool': 10, Shears: 1 });
    expect(forecastQuestResources(input)).not.toBeNull();
    input.snapshot.quests = { [input.goal.id]: { state: 'IN_PROGRESS', source: 'game', stepId: input.steps[0].id } };
    expect(forecastQuestResources(input)).toBeNull();
    const model = createQuestModel(input.snapshot, [input.goal], input.steps, {
      prepare: () => { throw new Error('An unknown remaining delivery must be resolved before purchasing or preparing'); },
      work: () => null, travel: () => null, training: () => null, remainingPreparation: () => null,
    });
    expect(model.evaluate(input.goal.id, input.projection)?.activeAction).toMatchObject({ kind: 'VERIFY', expectedEffects: [] });
  });

  it('allows a partial quest with enough verified stock for the maximum hand-in, but treats the eventual leftover as a lower bound', () => {
    const input = fixture('Sheep Shearer', { 'Ball of wool': 20, Hammer: 1 });
    input.snapshot.quests = { [input.goal.id]: { state: 'IN_PROGRESS', source: 'game', stepId: input.steps[0].id } };
    const result = forecastQuestResources(input)!;
    expect(result.procurement.requiredGp).toBe(0);
    const after = projectSuccess(input.projection, effects(result));
    expect(after.resources?.items['ball of wool']).toEqual({ floor: 0, complete: false });
    expect(after.resources?.items.hammer).toEqual({ floor: 1, complete: true });
    const steps = questExecutionSteps(input.steps, [input.goal]);
    const tactical = createTacticalResolver({ ...input, progress: emptyProgress(), window: steps, earn: () => null });
    const model = createQuestModel(input.snapshot, [input.goal], steps, {
      prepare: step => ({ action: tactical.resolve(step, input.goal.id).action, minutes: null, capabilities: {}, resources: result.changes }),
      work: () => null, travel: () => null, training: () => null, remainingPreparation: () => null,
    });
    expect(model.evaluate(input.goal.id, input.projection)?.activeAction.kind).toBe('WITHDRAW'); // Known bank stock, no guessed purchase.
  });

  it('does not use remembered bank wool as delivery proof, but accepts a sufficient observed bag without a bank read', () => {
    const input = fixture('Sheep Shearer', { 'Ball of wool': 20 });
    const quests = { [input.goal.id]: { state: 'IN_PROGRESS' as const, source: 'game', stepId: input.steps[0].id } };
    const remembered = { ...input.snapshot, quests, player: { ...input.snapshot.player,
      owned: { ...input.snapshot.player.owned!, bankSavedAt: 1000 } } };
    expect(forecastQuestResources({ ...input, snapshot: remembered, projection: observedProjection(remembered) })).toBeNull();
    const carried = { ...remembered, player: { ...remembered.player, bankSeen: false,
      owned: { bankSeen: false, items: new Map([['ball of wool', { name: 'Ball of wool', carried: 20, noted: 0 }]]) } } };
    expect(forecastQuestResources({ ...input, snapshot: carried, projection: observedProjection(carried) })?.procurement.requiredGp).toBe(0);
  });

  it('uses owned or purchased finished wool without buying gathering-only tools or the old three optional spares', () => {
    const input = fixture('Sheep Shearer', { 'Ball of wool': 0, Shears: 0 });
    const steps = questExecutionSteps(input.steps, [input.goal]);
    const tactical = createTacticalResolver({ ...input, progress: emptyProgress(), window: steps, earn: () => null });
    const prepared = tactical.resolve(steps[0], input.goal.id);
    expect(prepared.action?.kind).toBe('BUY');
    expect(prepared.plan.lines.some(line => line.name === 'Shears' && line.priority === 'CRITICAL')).toBe(false);
    expect(prepared.plan.lines.find(line => line.name === 'Ball of wool')?.count).toBe(20);
    const forecast = forecastQuestResources(input)!;
    expect(forecast.procurement.purchase).toMatchObject({ gp: -200, items: [{ name: 'Ball of wool', delta: 20 }] });
    expect(projectSuccess(input.projection, effects(forecast)).resources?.items['ball of wool'].floor).toBe(0);
    expect(input.steps[0].itemsRequired?.find(row => row.nameEn === 'Ball of wool')?.amount).toBe('23 (20 to hand in, 3 for the bank)');
  });

  it('refuses unmodelled flows, stale scopes, invalid cursors, missing parts, payments and already completed branches', () => {
    const input = fixture("Doric's Quest", { Clay: 6, 'Copper ore': 4, 'Iron ore': 2 });
    expect(forecastQuestResources({ ...input, goal: { ...input.goal, resourceFlow: null } })).toBeNull();
    expect(forecastQuestResources({ ...input, projection: { ...input.projection, scope: { ...input.snapshot.scope, gameSessionId: 'other' } } })).toBeNull();
    expect(forecastQuestResources({ ...input, steps: [] })).toBeNull();
    expect(forecastQuestResources({ ...input, projection: { ...input.projection, completed: new Set([input.goal.id]) } })).toBeNull();
    const paid = input.steps.map(s => ({ ...s, itemsRequired: [...s.itemsRequired ?? [], { nameEn: 'Coins', amount: 10, howToGet: '' }] }));
    expect(forecastQuestResources({ ...input, steps: paid })).toBeNull();
    for (const stepId of [undefined, 'unknown']) {
      input.snapshot.quests = { [input.goal.id]: { state: 'IN_PROGRESS', source: 'game', stepId } };
      expect(forecastQuestResources(input)).toBeNull();
    }
    const unknown: QuestFact = { ...input.goal, id: 'New content without reviewed flow', resourceFlow: null };
    expect(forecastQuestResources({ ...input, goal: unknown })).toBeNull();
  });
});
