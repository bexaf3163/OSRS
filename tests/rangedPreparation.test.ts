import { describe, expect, it } from 'vitest';
import { allSteps, stepById, stepsFor } from '../src/data';
import goalsData from '../src/data/goals.json';
import { emptyProgress } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { nameKey } from '../src/lib/checklist';
import { pickMethods, samePicks } from '../src/lib/methodPick';
import { GOAL_REACHED, methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { toInGameTarget, type GearItem } from '../src/services/runeliteBridge';
import { methodNeeds, trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import { market } from './funding/market';
import type { Market } from '../src/lib/methodRates';
import type { PriceView } from '../src/lib/funding/quotes';

const base = stepById.get('S6-01')!;
function scenario(level: number, equipment: GearItem[] = [], stock: Record<string, { carried?: number; bank?: number }> = {}, defence: number | null = 1, complete = true, trade: Market = {}, chosenMethod?: string, dressed = true) {
  if (dressed) equipment = [
    ...[['Leather cowl', 'head'], ['Leather body', 'body'], ['Leather chaps', 'legs'], ['Leather vambraces', 'hands'], ['Leather boots', 'feet']]
      .filter(([, slot]) => !equipment.some(e => e.slot === slot))
      .map(([name, slot], i) => ({ id: 50000 + i, name, slot, count: 1 })),
    ...equipment,
  ];
  const progress = emptyProgress();
  for (const s of allSteps) { if (s.id === base.id) break; progress.steps[s.id] = 'done'; }
  const names = [...new Set([...methodToolNames(base), ...Object.keys(stock)])].filter(n => complete || n === 'Shortbow' || n === 'Bronze arrow');
  const owned = { bankSeen: true, items: new Map(names.map(name => [nameKey(name), { name, carried: stock[name]?.carried ?? equipment.filter(e => e.name === name).reduce((n, e) => n + (e.count ?? 1), 0), noted: 0, bank: stock[name]?.bank ?? 0 }])) };
  const stats = { ranged: level, hitpoints: Math.max(30, level), ...(defence === null ? {} : { defence }) };
  const gear = { equipment, inventory: [], coins: 0, bankCoins: 0 };
  const state = buildPlayerState({ mode: 'f2p', stats, progress, owned, gear, questsDone: ['The Corsair Curse'], connected: true });
  const picks = pickMethods([base], state, 'f2p', 'chill', 'balanced', trade);
  const pick = chosenMethod ? { methodId: chosenMethod, needs: methodNeeds(trainingMethods.find(m => m.id === chosenMethod)!, state) } : picks[base.id];
  const step = withTrainingMethod(base, pick);
  const engine = createReadinessEngine({ ...contextOf({ step, steps: allSteps.map(s => s.id === step.id ? step : s), progress, mode: 'f2p', qp: 44, gear, owned, stats }), state });
  return { state, picks, pick, step, engine, payload: toInGameTarget(step)! };
}
const piece = (name: string, count = 1): GearItem => ({ id: name.includes('arrow') ? 882 : 841, name, count, slot: name.includes('arrow') ? 'ammo' : 'weapon' });

describe('S6-01 actual ranged preparation', () => {
  it('keeps training with a usable worn stack and replenishes only when the stack is low', () => {
    for (const count of [100, 99, 20]) {
      const s = scenario(1, [piece('Shortbow'), piece('Bronze arrow', count)]);
      expect(s.step.itemsRequired?.find(r => r.nameEn === 'Bronze arrow')?.amount).toBe(20);
      expect(s.engine.readiness(s.step).status).toBe('READY');
    }
    const low = scenario(1, [piece('Shortbow'), piece('Bronze arrow', 19)]);
    expect(low.step.itemsRequired?.find(r => r.nameEn === 'Bronze arrow')?.amount).toBe(100);
    expect(low.engine.readiness(low.step).status).not.toBe('READY');
  });
  it('banked food remains withdrawal preparation when a player selects the frog plan', () => {
    const m = trainingMethods.find(m => m.id === 'ra-frog')!;
    const s = scenario(26, [piece('Shortbow'), piece('Bronze arrow', 100)], { Salmon: { bank: 10 } }, 1, true, {}, m.id);
    expect(s.engine.plan(s.step).lines.find(r => r.name === 'Salmon')?.where).toBe('BANK');
    expect(viewMethod(m, s.state).status).not.toBe('LOCKED');
    const absentFood = scenario(26, [piece('Shortbow'), piece('Bronze arrow', 100)], {}, 1, true, {}, m.id);
    expect(absentFood.engine.plan(absentFood.step).lines.find(r => r.name === 'Salmon')?.where).not.toBe('BANK');
  });
  it.each([[1, 'ra-lumb', 'Seagull'], [20, 'ra-monk', 'Monk'], [26, 'ra-monk', 'Monk'], [39, 'ra-monk', 'Monk']] as const)(
    'Ranged%s gets its current trainer, kit and unchanged goal', (level, id, npc) => {
      const s = scenario(level);
      expect(s.pick).toMatchObject({ methodId: id });
      expect(s.payload.npcNames).toEqual([npc]);
      expect(s.payload.npcNames?.some(n => /Ogress/.test(n))).toBe(false);
      expect(s.payload.checklist).toEqual(expect.arrayContaining([expect.objectContaining({ name: level >= 30 ? 'Maple shortbow' : level >= 20 ? 'Willow shortbow' : 'Shortbow', equip: true }), expect.objectContaining({ name: 'Bronze arrow', count: 100, equip: true })]));
      expect(s.payload.completionTrigger).toEqual(base.inGame!.completionTrigger);
    });
  it('with exchange prices the Big bones count: at Ranged 26 the frogs pay for their bank trips and beat the monks', () => {
    // The recorded market has no arrow prices: an exchange that also prices the arrows the training breaks.
    const base = market();
    const priced: PriceView = { ...base, buy: (n) => (/ arrow$/i.test(n) ? { price: 3, basis: 'side', confidence: 'HIGH', ageMinutes: 0, volumePerHour: null, notes: [] } : base.buy(n)) };
    const s = scenario(26, [], {}, 1, true, { prices: priced, restriction: 'LIFTED' });
    expect(s.pick).toMatchObject({ methodId: 'ra-frog' });
    expect(s.payload.npcNames).toEqual(['Giant frog']);
    const equipped = scenario(26, [piece('Shortbow'), piece('Bronze arrow', 100)], { Salmon: { bank: 10 } }, 1, true, { prices: base, restriction: 'UNKNOWN' });
    expect(equipped.pick).toMatchObject({ methodId: 'ra-frog' });
    expect(equipped.payload.npcNames).toEqual(['Giant frog']);
    // Without an exchange arrow price the free shop's price counts (Lowe's, 1 gp): the cost stays known and the same choice is made.
    expect(scenario(26, [], {}, 1, true, { prices: base, restriction: 'LIFTED' }).pick).toMatchObject({ methodId: 'ra-frog' });
  });
  it('recognizes a usable owned bow and compatible banked ammunition before buying replacements', () => {
    const s = scenario(30, [piece('Maple shortbow')], { 'Adamant arrow': { bank: 100 }, Salmon: { bank: 10 } });
    expect(s.step.itemsRequired?.some(r => r.nameEn === 'Maple shortbow')).toBe(true);
    const line = s.engine.plan(s.step).lines.find(r => r.name === 'Adamant arrow')!;
    expect(line.action?.kind).toBe('TAKE');
    expect(s.engine.plan(s.step).now.some(r => r.action?.kind === 'BUY')).toBe(false);
  });
  it('does not accept ammo a basic bow cannot shoot or a bow above the player level', () => {
    const s = scenario(1, [piece('Shortbow')], { 'Maple shortbow': { bank: 1 }, 'Adamant arrow': { bank: 100 } });
    expect(s.step.itemsRequired?.find(r => r.nameEn.includes('arrow'))?.nameEn).toBe('Bronze arrow');
    expect(s.step.itemsRequired?.find(r => r.nameEn === 'Shortbow')?.anyOf ?? []).not.toContain('Maple shortbow');
    expect(s.engine.readiness(s.step).status).not.toBe('READY');
  });
  it('accepts an owned ordinary longbow without inventing another unlock or requiring a shortbow purchase', () => {
    const s = scenario(20, [piece('Willow longbow'), piece('Mithril arrow', 100)]);
    expect(s.step.itemsRequired?.find(r => r.equip && !r.nameEn.includes('arrow'))?.nameEn).toBe('Willow longbow');
    expect(s.engine.readiness(s.step).status).toBe('READY');
  });
  it('mixed partial arrow types do not pretend to be one equipable full stack', () => {
    const s = scenario(1, [piece('Shortbow'), piece('Iron arrow', 19)], { 'Bronze arrow': { carried: 81 } });
    const ammo = s.step.itemsRequired?.find(r => r.nameEn.includes('arrow'))!;
    expect(ammo.nameEn).toBe('Bronze arrow');
    expect(ammo.anyOf).toBeUndefined();
    expect(s.engine.readiness(s.step).requirements.find(r => r.item === 'Bronze arrow')?.state).toBe('PARTIAL');
  });
  it('unreported compatible stock holds preparation as unknown instead of authorizing a purchase', () => {
    const s = scenario(1, [piece('Shortbow')], {}, 1, false);
    expect(s.step.itemsRequired?.some(r => r.nameEn === 'Iron arrow')).toBe(true);
    expect(s.engine.readiness(s.step).requirements.some(r => r.kind === 'item' && r.state === 'UNKNOWN')).toBe(true);
    expect(s.engine.plan(s.step).now.some(r => r.action?.kind === 'BUY')).toBe(false);
  });
  it('Flesh Crawlers retain their actual Defence guard and cannot keep the old ogress arrow', () => {
    const s = scenario(40, [], {}, 40);
    const m = trainingMethods.find(m => m.id === 'ra-crawler')!;
    expect(viewMethod(m, s.state).status).not.toBe('LOCKED');
    expect(viewMethod(m, scenario(40, [], {}, 39).state).status).toBe('LOCKED');
    const chosen = withTrainingMethod(base, { methodId: m.id, needs: methodNeeds(m, s.state) });
    expect(chosen.requirements).toContainEqual({ type: 'skill', skill: 'defence', min: 40 });
    expect(toInGameTarget(chosen)?.worldPoint).toBeUndefined();
    expect(toInGameTarget(chosen)?.npcNames).toEqual(['Flesh Crawler']);
    const unknown = scenario(40, [], {}, null);
    expect(unknown.pick).not.toMatchObject({ methodId: 'ra-crawler' });
    expect(viewMethod(trainingMethods.find(m => m.id === 'ra-crawler')!, unknown.state).unchecked.some(n => n.kind === 'skill')).toBe(true);
  });
  it('finishes the optional checkpoint at Ranged 40 without keeping a farming kit active', () => {
    expect(base.inGame?.completionTrigger?.levels).toEqual([{ skill: 'ranged', level: 40 }]);
    expect(goalsData.rows.find(r => r.id === 'ranged')?.values[5]).toMatchObject({ min: 40, raw: '40', kind: 'optional' });
    const s = scenario(40);
    expect(s.pick).toBe(GOAL_REACHED);
    expect(s.step.itemsRequired ?? []).toHaveLength(0);
  });
  it('kit picks are stable by content and watch every supported supply within the existing bound', () => {
    const s = scenario(1);
    expect(samePicks(s.picks, JSON.parse(JSON.stringify(s.picks)))).toBe(true);
    expect(s.payload.watchItems!.length).toBeLessThanOrEqual(40);
    expect(s.payload.watchItems).toEqual(expect.arrayContaining(['Maple longbow', 'Adamant arrow', 'Salmon']));
  });
  it('does not impose the F2P starter kit on an unmodelled Members loadout', () => {
    const s = scenario(40);
    const view = viewMethod(trainingMethods.find(m => m.id === 'ra-frog')!, { ...s.state, mode: 'members' });
    expect(view.missing.some(n => /bow|arrow/i.test(n.label))).toBe(false);
    expect(view.unchecked.some(n => n.label === 'Members ranged loadout')).toBe(true);
    expect(stepsFor('members').some(s => s.id === base.id)).toBe(false);
  });
});
