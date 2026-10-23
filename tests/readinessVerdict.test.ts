import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { buildPrepPlan, type PrepPlan } from '../src/lib/prepPlan';
import { buildPlayerState } from '../src/lib/playerState';
import { planOneTrip } from '../src/lib/oneTrip';
import { readinessOf } from '../src/lib/readiness';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { combatPlanView, foodReservations, ownedFood } from '../src/lib/combatPlan';
import { combatReadiness } from '../src/lib/combatReadiness';
import { bankFreshness, readinessVerdict, PERCENT_NOTE } from '../src/lib/readinessVerdict';
import { gearById } from '../src/services/gearAdvisor';
import type { GearState } from '../src/services/runeliteBridge';
import type { Step } from '../src/types';

// The owner's example (spec 2026-10-17): S3-08 with iron armour and a Mithril scimitar, the level 12 and level 27 Minotaurs judged separately, then
// the same verdict for any step: what is with you, what is in the bank, what to get, what is not known.

const s308 = stepById.get('S3-08')!;
const id = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const IRON = ['Mithril scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'];
const gearOf = (names: string[], inventory: { id: number; name: string; count?: number }[] = []): GearState =>
  ({ equipment: names.map((n) => ({ id: id(n), name: n })), inventory, coins: 0, bankCoins: 5000 });
const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2000 };

function owned(items: Record<string, [number, number]>, bankSeen = true, bankSavedAt?: number): OwnedState {
  const map = new Map<string, OwnedItem>();
  // Complete tracked-food snapshots report zero for absent alternatives rather than omitting them.
  const food = s308.itemsRequired!.find(i => i.heals)!;
  for (const n of [food.nameEn, ...(food.anyOf ?? [])]) map.set(nameKey(n), { name: n, carried: 0, noted: 0, bank: bankSeen ? 0 : undefined });
  for (const [n, [carried, bank]] of Object.entries(items)) map.set(nameKey(n), { name: n, carried, noted: 0, bank });
  return { bankSeen, ...(bankSavedAt ? { bankSavedAt } : {}), items: map };
}

const combatOf = (o: OwnedState, gear = gearOf(IRON)) => {
  const v = combatPlanView(s308, { stats, xp, gear, owned: o });
  return combatReadiness(s308, v, gear, o.bankSeen);
};

describe('S3-08 Minotaurs: the kit, the version and the food for the next trip', () => {
  it('iron armour and a Mithril scimitar with no food: both versions compared, the weapon fits, food is the thing to get', () => {
    const c = combatOf(owned({ Salmon: [0, 0] }))!;
    expect(c.foe).toBe('Minotaur (level 12)');
    expect(c.variant).toMatch(/^Minotaur \(level 12\) suits your current kit best: 238 kills, about \d+ Salmon in all, /);
    expect(c.variant).toMatch(/\. Minotaur \(level 27\): 108 kills, about \d+ Salmon in all, /);
    expect(c.weapon).toEqual({ ok: true, text: expect.stringMatching(/^Mithril scimitar: suitable for training Strength and Attack, a hit every 2\.4 s\.$/) });
    expect(c.armour.empty).toEqual([]);
    expect(c.armour.text).toMatch(/^Armour: Iron full helm, Iron platebody, Iron plateskirt and Iron kiteshield\./);
    expect(c.food).toMatchObject({ trip: 26, carried: 0, bank: 0, short: 26, fromBank: 0, toBuy: 26 });
    expect(c.food.text).toMatch(/^Buy about 26 Salmon \(or food that heals as much\) for the next trip of 26/);
  });

  it('food only in the bank: withdraw it, nothing to buy', () => {
    const c = combatOf(owned({ Salmon: [0, 40] }))!;
    expect(c.food).toMatchObject({ short: 26, fromBank: 26, toBuy: 0 });
    expect(c.food.text).toBe('Bank: withdraw 26 Salmon (or food that heals as much) for the next trip of 26.');
  });

  it('other food counts by healing, not by pieces: 20 Lobsters cover 26 Salmon, 20 Cooked meat do not', () => {
    expect(combatOf(owned({ Lobster: [20, 0] }))!.food.short).toBe(0);
    const meat = { ...s308, itemsRequired: s308.itemsRequired!.map((i) => (i.heals ? { ...i, anyOf: [...(i.anyOf ?? []), 'Cooked meat'] } : i)) };
    const o = owned({ 'Cooked meat': [20, 0] });
    expect(ownedFood(meat, o)).toMatchObject({ carriedEq: Math.floor((20 * 3) / 9) });
  });

  it('with only a little food owned, the version that fits it is suggested instead of a purchase', () => {
    const c = combatOf(owned({ Salmon: [5, 0] }))!;
    expect(c.food.short).toBeGreaterThan(0);
    // Both versions need more than 5 a trip at Defence 1, so the best one stays, and the food is what to get.
    expect(c.variant).toMatch(/suits your current kit best/);
  });

  it('no armour on the body: said as a caution, the food counts what is worn', () => {
    const c = combatOf(owned({ Salmon: [30, 0] }), gearOf(['Mithril scimitar', 'Iron full helm', 'Iron kiteshield']))!;
    expect(c.armour.empty).toEqual(['body armour', 'leg armour']);
    expect(c.cautions[0]).toBe('Your armour leaves Minotaur (level 12) riskier: no body armour and leg armour worn.');
  });

  it('no weapon worn or a bow on a melee step: the weapon is the problem', () => {
    const v = combatPlanView(s308, { stats, xp, gear: gearOf(IRON), owned: owned({}) });
    const none = combatReadiness(s308, v, gearOf(IRON.slice(1)), true)!;
    expect(none.weapon.ok).toBe(false);
    const bow: GearState = { ...gearOf(IRON.slice(1)), equipment: [{ id: 841, name: 'Shortbow', slot: 'weapon' }, ...gearOf(IRON.slice(1)).equipment!] };
    expect(combatReadiness(s308, v, bow, true)!.weapon).toEqual({ ok: null, text: 'Shortbow: the app has no stats for it, so its fit is not checked.' });
  });

  it('a quest ingredient that is also food is kept for its quest and not counted', () => {
    const fight = { id: 'X1', itemsRequired: [{ nameEn: 'Trout', amount: 10, howToGet: '', heals: 7, anyOf: ['Cooked meat'] }] } as unknown as Step;
    const quest = { id: 'X2', itemsRequired: [{ nameEn: 'Cooked meat', amount: 2, howToGet: '' }] } as unknown as Step;
    const r = foodReservations(fight, [fight, quest]);
    expect(r.get('cooked meat')).toEqual({ count: 2, stepId: 'X2' });
    const f = ownedFood(fight, owned({ Trout: [10, 0], 'Cooked meat': [3, 0] }), r)!;
    expect(f.reserved).toEqual(['2 Cooked meat for X2']);
    expect(f.text).toBe('10 Trout, 1 Cooked meat');
  });
});

// The general verdict on small hand-made steps.
const item = (nameEn: string, amount: number, extra: Record<string, unknown> = {}) => ({ nameEn, amount, howToGet: '', ...extra });
const mk = (sid: string, items: ReturnType<typeof item>[], extra: Record<string, unknown> = {}): Step =>
  ({ id: sid, stage: 1, type: 'quest', title: sid, requires: [], itemsRequired: items, ...extra } as unknown as Step);
const stateOf = (o: OwnedState | null, opts: { stats?: Record<string, number> } = {}) => buildPlayerState({
  mode: 'f2p', stats: opts.stats ?? null, progress: { levels: {} }, owned: o,
  gear: o ? { equipment: [], inventory: [], coins: 100, bankCoins: o.bankSeen ? 0 : null } : null, questsDone: null, connected: o !== null,
});
function planFor(step: Step, o: OwnedState | null, list: Step[] = [step], opts: { stats?: Record<string, number> } = {}): PrepPlan {
  const st = stateOf(o, opts);
  const progress = emptyProgress();
  return buildPrepPlan({
    step, steps: list, progress, state: st, trip: planOneTrip(list, progress, step.id, st),
    readiness: readinessOf(step, { steps: list, progress, qp: 0, mode: 'f2p', state: st }), detail: () => undefined,
  });
}
const FOOD = new Set(['trout', 'salmon', 'lobster']);
const isFood = (n: string) => FOOD.has(n.toLowerCase());
const verdict = (step: Step, o: OwnedState | null, extra: Partial<Parameters<typeof readinessVerdict>[0]> = {}) =>
  readinessVerdict({ plan: planFor(step, o), connected: o !== null, owned: o, isFood, now: 10_000_000_000, ...extra });

describe('the readiness verdict', () => {
  const guardian = mk('G1', [item('Bronze pickaxe', 1), item('Trout', 10, { heals: 7 })]);

  it('everything with you: Ready, with no cautions', () => {
    const v = verdict(guardian, owned({ 'Bronze pickaxe': [1, 0], Trout: [10, 0] }));
    expect(v.level).toBe('READY');
    expect(v.headline).toBe('Ready: everything this step needs is with you.');
    expect(v.reasons.filter((r) => r.state !== 'ok')).toEqual([]);
  });

  it('owned but in the bank: withdraw it first, the items named', () => {
    const v = verdict(guardian, owned({ 'Bronze pickaxe': [1, 0], Trout: [0, 12] }));
    expect(v.level).toBe('PREP_NEEDED');
    expect(v.headline).toBe('Bank: withdraw Trout ×10 — you already own it.');
    expect(v.reasons.find((r) => r.group === 'safety')).toMatchObject({ state: 'bank', text: 'Trout ×10: take 10 from the bank.' });
  });

  it('missing food: bring food before going, said as food', () => {
    const v = verdict(guardian, owned({ 'Bronze pickaxe': [1, 0], Trout: [2, 0] }));
    expect(v.level).toBe('PREP_NEEDED');
    expect(v.headline).toMatch(/^Preparation needed: bring food before going — Trout ×8/);
  });

  it('the bank never opened: unknown is not missing and not ready', () => {
    const v = verdict(guardian, owned({ 'Bronze pickaxe': [1, 0] }, false));
    expect(v.level).toBe('UNKNOWN');
    expect(v.headline).toBe('Bank contents have not been checked; visit a bank to assess owned supplies.');
    expect(v.bank.state).toBe('never');
    expect(v.reasons.find((r) => r.text.startsWith('Trout'))).toMatchObject({ group: 'unknown', state: 'unknown' });
  });

  it('no game at all: cannot assess, never ready', () => {
    const v = verdict(guardian, null);
    expect(v.level).toBe('UNKNOWN');
    expect(v.headline).toMatch(/^Cannot assess yet: connect RuneLite/);
    expect(v.bank.state).toBe('offline');
  });

  it('a bank copy from an earlier session is said to be one when the advice leans on it', () => {
    const o = owned({ 'Bronze pickaxe': [1, 0], Trout: [0, 12] }, true, 10_000_000_000 - 3 * 86_400_000);
    const v = verdict(guardian, o);
    expect(v.bank).toMatchObject({ state: 'saved', text: 'Bank as last seen 3 days ago (an earlier session); open a bank to refresh it.' });
    expect(v.cautions).toContain(v.bank.text);
  });

  it('food eaten after an earlier ready check: the same step is no longer ready', () => {
    expect(verdict(guardian, owned({ 'Bronze pickaxe': [1, 0], Trout: [10, 0] })).level).toBe('READY');
    expect(verdict(guardian, owned({ 'Bronze pickaxe': [1, 0], Trout: [4, 0] })).level).toBe('PREP_NEEDED');
  });

  it('a level the step needs: requirements not met, whatever the bag holds', () => {
    const hard = mk('G2', [item('Bronze pickaxe', 1)], { requirements: [{ type: 'skill', skill: 'mining', min: 10 }] });
    const v = readinessVerdict({ plan: planFor(hard, owned({ 'Bronze pickaxe': [1, 0] }), [hard], { stats: { mining: 5 } }), connected: true, owned: owned({ 'Bronze pickaxe': [1, 0] }), isFood });
    expect(v.level).toBe('NOT_MET');
    expect(v.headline).toMatch(/^Requirements not met: /);
    expect(v.reasons[0].group).toBe('access');
  });

  it('a fight: the food line comes from the kit check (by healing), with the bank named first', () => {
    const c = combatOf(owned({ Salmon: [0, 40] }))!;
    const fight = mk('F1', [item('Salmon', 20, { heals: 9 })], { type: 'combat' });
    const v = readinessVerdict({ plan: planFor(fight, owned({ Salmon: [0, 40] })), connected: true, owned: owned({ Salmon: [0, 40] }), isFood, combat: c });
    expect(v.level).toBe('PREP_NEEDED');
    expect(v.headline).toBe('Bank: withdraw 26 Salmon — you already own it.');
    expect(v.reasons.filter((r) => r.text.startsWith('Salmon ×'))).toEqual([]);
    expect(v.reasons.some((r) => r.group === 'equipment' && r.text.startsWith('Mithril scimitar: suitable'))).toBe(true);
  });

  it('a fight with the food on you: ready for the named version', () => {
    const c = combatOf(owned({ Salmon: [26, 0] }))!;
    const fight = mk('F1', [item('Salmon', 20, { heals: 9 })], { type: 'combat' });
    const v = readinessVerdict({ plan: planFor(fight, owned({ Salmon: [26, 0] })), connected: true, owned: owned({ Salmon: [26, 0] }), isFood, combat: c });
    expect(v.level).toBe('READY');
    expect(v.headline).toBe('Ready: your kit and food suit Minotaur (level 12).');
  });

  it('the percent is explained, never as survival', () => {
    expect(PERCENT_NOTE).toMatch(/not a chance of surviving/);
    expect(bankFreshness(true, owned({}, true)).state).toBe('live');
  });
});

describe('tools by level: a tier the player cannot use does not do the job', () => {
  const mine = mk('M1', [item('Bronze pickaxe', 1)], { type: 'skill' });
  const row = (stats: Record<string, number> | undefined, o: OwnedState) => {
    const st = stateOf(o, { stats });
    return readinessOf(mine, { steps: [mine], progress: emptyProgress(), qp: 0, mode: 'f2p', state: st }).requirements.find((r) => r.item === 'Bronze pickaxe')!;
  };

  it('a Rune pickaxe at Mining 10 is not a pickaxe for the step, and the row says why', () => {
    const r = row({ mining: 10 }, owned({ 'Rune pickaxe': [1, 0], 'Bronze pickaxe': [0, 0], 'Iron pickaxe': [0, 0], 'Steel pickaxe': [0, 0] }));
    expect(r.state).toBe('MISSING');
    expect(r.detail).toContain('Rune pickaxe (needs Mining 41): too high for your level yet');
  });

  it('at Mining 41 it is, and with the level unknown it counts (unknown is not missing)', () => {
    expect(row({ mining: 41 }, owned({ 'Rune pickaxe': [1, 0] })).state).toBe('OK');
    expect(row(undefined, owned({ 'Rune pickaxe': [1, 0] })).state).toBe('OK');
  });

  it('a usable lower tier still counts beside an unusable higher one', () => {
    expect(row({ mining: 10 }, owned({ 'Rune pickaxe': [1, 0], 'Iron pickaxe': [0, 1] })).state).toBe('BANK');
  });

  it('Fishing 1 with a harpoon but no net: the net is still missing (method-specific tools are not tiers)', () => {
    const fish = mk('F2', [item('Small fishing net', 1)], { type: 'skill' });
    const st = stateOf(owned({ Harpoon: [1, 0], 'Small fishing net': [0, 0] }), { stats: { fishing: 1 } });
    const r = readinessOf(fish, { steps: [fish], progress: emptyProgress(), qp: 0, mode: 'f2p', state: st }).requirements.find((x) => x.item === 'Small fishing net')!;
    expect(r.state).toBe('MISSING');
  });
});

describe('the verdict in the snapshot and the cleanup beside it', () => {
  it('the plan carries the verdict only when the app gives one: an older plugin ignores the field', async () => {
    const { planPayload } = await import('../src/lib/prepEnvelope');
    const p = planFor(mk('G1', [item('Trout', 10, { heals: 7 })]), owned({ Trout: [0, 12] }));
    expect('readiness' in planPayload(p)).toBe(false);
    const withIt = planPayload(p, { readiness: { status: 'PREP_NEEDED', headline: 'Bank: withdraw Trout ×10 — you already own it.' } });
    expect(withIt.readiness).toEqual({ status: 'PREP_NEEDED', headline: 'Bank: withdraw Trout ×10 — you already own it.' });
  });

  it('cleanup never offers what the open fight needs: the weapon and the food stay, only the stray ore is advice', async () => {
    const { cleanupAdvice, emptyCleanupPrefs } = await import('../src/lib/cleanup');
    const r = cleanupAdvice({
      bag: [{ id: 1329, name: 'Mithril scimitar', count: 1 }, { id: 329, name: 'Salmon', count: 26 }, { id: 440, name: 'Iron ore', count: 10 }],
      openSteps: [s308], bankSeen: true, account: 'normal', restriction: 'LIFTED', price: () => 50, tradeable: () => true, prefs: emptyCleanupPrefs(),
    });
    expect(r.recs.map((x) => x.name)).toEqual(['Iron ore']);
    expect(r.keeps.map((x) => x.name).sort()).toEqual(['Mithril scimitar', 'Salmon']);
  });
});

describe('a shield the fight needs, displaced by a two-handed weapon', () => {
  it('Elvarg: the Anti-dragon shield is carried, but a 2h sword is worn, so it protects nothing', () => {
    const ship = mk('S5-08', [item('Anti-dragon shield', 1)]);
    const o = owned({ 'Anti-dragon shield': [1, 0] });
    const base = { plan: planFor(ship, o), connected: true, owned: o, isFood };
    expect(readinessVerdict(base).level).toBe('READY');
    const v = readinessVerdict({ ...base, worn: { weapon: 'Iron 2h sword', twoHanded: true } });
    expect(v.level).toBe('PREP_NEEDED');
    expect(v.headline).toBe('Preparation needed: Iron 2h sword is two-handed: it leaves no room for the Anti-dragon shield.');
    expect(readinessVerdict({ ...base, worn: { weapon: 'Mithril scimitar', twoHanded: false } }).level).toBe('READY');
  });
});

describe('a quest fight in the verdict', () => {
  const fight = mk('Q1', [item('Trout', 5, { heals: 7 })]);
  const o = owned({ Trout: [5, 0] });
  const base = { plan: planFor(fight, o), connected: true, owned: o, isFood };

  it('carried food below the high end of the estimate is a caution, not a block', () => {
    const v = readinessVerdict({ ...base, fights: [{ line: 'Ithoi the Navigator: about 79 s …', foodHigh: 9, foodName: 'Trout', foe: 'Ithoi the Navigator' }], carriedFood: 5 });
    expect(v.level).toBe('READY_CAUTIONS');
    expect(v.cautions[0]).toBe('Ithoi the Navigator may take up to 9 Trout with your kit (an estimate); you carry 5.');
    expect(v.reasons.find((r) => r.text.startsWith('Ithoi'))).toMatchObject({ group: 'safety', state: 'caution' });
  });

  it('enough food: the fight line is there, the verdict stays Ready', () => {
    const v = readinessVerdict({ ...base, fights: [{ line: 'Count Draynor: about 54 s …', foodHigh: 2, foodName: 'Trout', foe: 'Count Draynor' }], carriedFood: 5 });
    expect(v.level).toBe('READY');
    expect(v.reasons.find((r) => r.text.startsWith('Count Draynor'))).toMatchObject({ state: 'ok' });
  });
});

describe('a quest fight that cannot be judged is never Ready (combat audit, 2.66.0)', () => {
  const fight = mk('Q2', [item('Trout', 5, { heals: 7 })]);
  const o = owned({ Trout: [5, 0] });
  const base = { plan: planFor(fight, o), connected: true, owned: o, isFood };
  const ithoi = { line: 'Ithoi the Navigator: about 79 s …', foodHigh: 9, foodName: 'Trout', foe: 'Ithoi the Navigator', name: 'Ithoi the Navigator' };

  it('food the fight needs, with the bag not read: not checked, not fine', () => {
    const v = readinessVerdict({ ...base, fights: [ithoi], carriedFood: null });
    expect(v.level).toBe('UNKNOWN');
    expect(v.reasons.find((r) => r.text.startsWith('Ithoi'))).toMatchObject({ group: 'unknown', state: 'unknown' });
    expect(v.reasons.find((r) => r.text.startsWith('Ithoi'))!.text).toMatch(/food in your bag has not been read/);
  });

  it('no estimate because the levels or the worn gear were not read: not assessed, not Ready', () => {
    const v = readinessVerdict({ ...base, fights: [], fightNames: [{ name: 'Ithoi the Navigator', known: true }], carriedFood: 5 });
    expect(v.level).toBe('UNKNOWN');
    expect(v.headline).toMatch(/Ithoi the Navigator: this fight is not assessed yet/);
  });

  it('an opponent the app has no numbers for: a caution to prepare as written, not a silent Ready', () => {
    const v = readinessVerdict({ ...base, fights: [], fightNames: [{ name: 'Gorak', known: false }], carriedFood: 5 });
    expect(v.level).toBe('READY_CAUTIONS');
    expect(v.cautions).toContain('Gorak: the app has no combat numbers for it; prepare as the walkthrough says.');
  });

  it('an estimated fight is not reported twice, and a fight that needs no food does not wait for the bag', () => {
    const v = readinessVerdict({ ...base, fights: [ithoi], fightNames: [{ name: 'Ithoi the Navigator', known: true }], carriedFood: 9 });
    expect(v.level).toBe('READY');
    expect(v.reasons.filter((r) => r.text.startsWith('Ithoi')).length).toBe(1);
    const cows = readinessVerdict({ ...base, fights: [{ ...ithoi, line: 'Cow: about 10 s …', foodHigh: 0, foe: 'Cow', name: 'Cow' }], carriedFood: null });
    expect(cows.level).toBe('READY');
  });
});
