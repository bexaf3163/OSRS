import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../../src/data';
import { armourItems, armourOptions, armourReady } from '../../src/lib/combatRoute/armour';
import { evaluatePlans } from '../../src/lib/combatRoute/plans';
import { currentPhase, resolvePick, withCombatPlan } from '../../src/lib/combatRoute/pick';
import { gearById } from '../../src/services/gearAdvisor';
import { buildPlayerState } from '../../src/lib/playerState';
import { emptyProgress } from '../../src/lib/progress';
import { evaluatePreflight, preflightItems } from '../../src/lib/checklist';
import { createReadinessEngine } from '../../src/lib/readinessEngine';
import { bankWithdrawalsOf, planPayload } from '../../src/lib/prepEnvelope';
import { toInGameTarget } from '../../src/services/runeliteBridge';
import { buildPriceView } from '../../src/lib/funding/quotes';
import { ownedOf, planInput } from './fixture';

const step = stepById.get('S4-03')!;
const kit = [1165, 1125, 1077, 1195];
const progress = emptyProgress();
const piece = (id: number) => { const p = gearById.get(id)!; return { id, name: p.name, slot: p.slot }; };
function input(defence = 10, equipment = [1331], stock: Record<string, [number, number]> = {}) {
  const stats = { attack: 30, strength: 21, defence, hitpoints: 24 };
  const base = planInput({ stats, xp: { attack: 13363, strength: 2000, defence: defence >= 10 ? 1154 : 0 } });
  const gear = { equipment: equipment.map(piece), inventory: [], coins: 10000, bankCoins: 0 };
  const names = kit.flatMap(id => armourOptions(id, 'crush', 'f2p').map(p => p.name));
  const owned = ownedOf({ ...Object.fromEntries(names.map(n => [n, [0, 0] as [number, number]])), ...stock });
  const state = buildPlayerState({ mode: 'f2p', stats, progress, questsDone: [], gear, owned, connected: true });
  return { ...base, step, steps: allSteps, owned, state, ctx: { ...base.ctx, gear } };
}
function projected(i = input()) {
  const report = evaluatePlans(i)!;
  const pick = resolvePick(report, 'route', { xp: i.ctx.xp!, state: i.state, held: () => 0 })!;
  return { report, pick, step: withCombatPlan(step, pick) };
}
function engine(i: ReturnType<typeof input>, s: typeof step, prices?: ReturnType<typeof buildPriceView>) {
  return createReadinessEngine({ mode: 'f2p', progress, qp: 43, steps: [s], state: i.state, prices });
}

describe('structured Black armour preparation on the real route', () => {
  it('trains Defence before equipment in every normal plan, preserving the original completion trigger', () => {
    const i = input(1);
    const report = evaluatePlans(i)!;
    for (const plan of report.plans) {
      expect(plan.phases[0]).toMatchObject({ kind: 'defence', foe: { name: 'Cow' }, goals: [{ skill: 'defence', exp: 1154 }] });
      expect(plan.phases[1]).toMatchObject({ kind: 'armour', armour: kit });
      expect(plan.phases[1].kills).toBe(0);
    }
    const pick = resolvePick(report, 'route', { state: i.state, xp: i.ctx.xp!, held: () => 0 })!;
    expect(pick.kind).toBe('defence');
    expect(pick.steps[0]).toMatch(/Defensive until Defence 10/);
    expect(pick.steps[1]).toMatch(/Black full helm.*10 Defence|10 Defence.*Black full helm/);
    expect(withCombatPlan(step, pick).inGame?.completionTrigger).toEqual(step.inGame?.completionTrigger);
    expect(step.inGame?.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }] });
  });
  it('respects Defence 1 builds and does not force preparation after the Attack goal is reached', () => {
    const i = input(1);
    const pure = evaluatePlans({ ...i, keepDefenceOne: true })!;
    expect(pure.plans.every(p => p.phases.every(ph => ph.kind !== 'armour'))).toBe(true);
    expect(pure.plans.find(p => p.key === pure.recommended)!.phases.every(p => p.kind !== 'defence')).toBe(true);
    const done = evaluatePlans({ ...i, ctx: { ...i.ctx, stats: { ...i.ctx.stats, attack: 40 }, xp: { ...i.ctx.xp, attack: 37224 } } });
    expect(done).toBeNull();
  });
  it('cannot finish the equipment phase from bag, bank, notes, low Defence or unread gear', () => {
    const stock = Object.fromEntries(kit.map(id => [piece(id).name, [1, 0] as [number, number]]));
    const i = input(10, [1331], stock);
    const { report, pick, step: s } = projected(i);
    expect(pick.kind).toBe('armour');
    expect(pick.kit?.map(p => p.wikiItemId)).toEqual(kit);
    expect(s.requirements).toContainEqual({ type: 'skill', skill: 'defence', min: 10 });
    const plan = report.plans[0];
    expect(currentPhase(plan, { state: i.state, xp: i.ctx.xp!, held: () => 1 })).toBe(0);
    expect(armourReady(kit, 'crush', { ...i.state, equipmentKnown: false })).toBe(false);
    expect(armourReady(kit, 'crush', input(1, [1331, ...kit]).state)).toBe(false);
    const e = engine(i, s);
    expect(e.readiness(s).requirements.filter(r => r.kind === 'item').every(r => r.state === 'BANK')).toBe(true);
    expect(e.prep(s).tasks.every(t => t.kind === 'equip' && t.label.startsWith('Equip ') && !t.action)).toBe(true);
    expect(engine({ ...i, state: { ...i.state, connected: false, equipmentKnown: false, equipment: {}, owned: null } }, s).openTasks(s.id)).toContain('equip:Black full helm');
    const prep = e.plan(s, { ahead: 0 });
    expect(prep.now).toHaveLength(4);
    expect(prep.have).toHaveLength(0);
    expect(prep.score.verdict).toBe('NOT_READY');
    expect(prep.now.every(l => l.equip && l.where === 'INVENTORY' && l.action?.label === `Equip ${l.name}`)).toBe(true);
    expect(bankWithdrawalsOf(prep)).toEqual([]);
    expect(planPayload(prep).lines.every(l => l.equip)).toBe(true);
    const target = toInGameTarget(s)!;
    expect(target.checklist?.every(l => l.equip)).toBe(true);
    expect(target.goal).toMatch(/10 Defence required/);
    expect(evaluatePreflight(preflightItems(s), i.owned, i.ctx.stats, i.ctx.gear!.equipment).rows.every(r => r.state === 'NOT_EQUIPPED')).toBe(true);
    expect(armourReady(kit, 'crush', input(10, [1331], Object.fromEntries(kit.map(id => [piece(id).name, [0, 1] as [number, number]]))).state)).toBe(false);
  });
  it('accepts usable owned equivalents, counts confirmed worn gear and never buys an unused tier', () => {
    const worn = [1331, 1159, 1121, 1085, 1197]; // Mithril helm/body/skirt and kiteshield.
    const i = input(20, worn);
    expect(armourReady(kit, 'crush', i.state)).toBe(true);
    const items = armourItems(kit, 'crush', i.state);
    expect(items.map(p => p.wikiItemId)).toEqual(worn.slice(1));
    const s = { ...step, foes: [], itemsRequired: items };
    expect(engine(i, s).plan(s, { ahead: 0 }).have).toHaveLength(4);
    const low = input(10, [1331], { 'Mithril platebody': [0, 1] });
    expect(armourItems([1125], 'crush', low.state)[0].wikiItemId).toBe(1125);
    expect(armourItems([1125], 'crush', low.state)[0].anyOf).not.toContain('Mithril platebody');
    const high = input(20, [1331], { 'Mithril platebody': [0, 1] });
    expect(armourItems([1125], 'crush', high.state)[0].wikiItemId).toBe(1121);
  });
  it('keeps unread alternative ownership unknown and does not invent a purchase deficit', () => {
    const i = input(20);
    i.state.owned!.items.delete('mithril platebody');
    const { step: s } = projected(i);
    const row = engine(i, s).plan(s, { ahead: 0 }).lines.find(l => l.name === 'Black platebody')!;
    expect(row).toMatchObject({ where: 'UNKNOWN', toGet: null, action: { kind: 'CONNECT' } });
    expect(engine(i, s).trip(s.id, 0).lines.find(l => l.line.nameEn === 'Black platebody')?.status).toBe('UNKNOWN');
    const target = toInGameTarget(s)!;
    const watched = [...target.watchItems!, ...target.checklist!.map(i => i.name)];
    for (const item of s.itemsRequired!) for (const n of [item.nameEn, ...(item.anyOf ?? [])]) expect(watched).toContain(n);
  });
  it('uses shared quotes to choose the cheaper equivalent and prices the same units for the HUD', () => {
    const now = 1_800_000_000_000;
    const prices = buildPriceView({ now, mapping: new Map([[1077, { name: 'Black platelegs' }], [1089, { name: 'Black plateskirt' }]]), baked: new Map(),
      board: { at: now, hourAt: null, status: 'live', quotes: new Map([1077, 1089].map(id => [id, { id, high: { price: id === 1077 ? 2000 : 1000, at: now }, low: { price: 900, at: now }, hour: null }])) } });
    const i = input();
    const selected = armourItems([1077], 'crush', i.state, prices);
    expect(selected[0].wikiItemId).toBe(1089);
    const s = { ...step, foes: [], itemsRequired: selected };
    const prep = engine(i, s, prices).plan(s, { ahead: 0 });
    expect(prep.lines[0].marketPrice).toMatchObject({ unit: 1000, total: 1000, state: 'current' });
    expect(planPayload(prep).lines[0].price).toBe(prep.lines[0].marketPrice!.text);
  });
});
