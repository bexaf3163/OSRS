import { describe, expect, it } from 'vitest';
import { allSteps, stepById, stepsFor } from '../src/data';
import { canWear, gearData } from '../src/services/gearAdvisor';
import { stepReadiness } from '../src/lib/readiness';
import { emptyProgress, normalizeProgress, RETIRED_STEPS, withStep } from '../src/lib/progress';
import { nextStep } from '../src/lib/next-step';
import { isInstancedPoint } from '../src/lib/instances';
import { navigationTarget } from '../src/lib/navigation';
import { travelOptions } from '../src/lib/travel';
import { fairyRingsUnlocked, travelInputOf } from '../src/lib/travelInput';
import { xpForLevel } from '../src/lib/xp';
import type { GearState } from '../src/services/runeliteBridge';
import type { OwnedState } from '../src/lib/checklist';
import type { Step } from '../src/types';

// The route audit fixes: weapon before Attack 40, the quest alone completes Dragon Slayer I, map pieces by identity, instances, fairy rings,
// retired and trimmed grinds, and cash that is cash.

const step = (id: string): Step => stepById.get(id)!;
const names = (list?: { nameEn: string }[]) => (list ?? []).map((i) => i.nameEn);
const gearOf = (coins: number | null, bankCoins: number | null): GearState => ({ equipment: [], inventory: [], coins, bankCoins });
const piece = (name: string) => gearData.items.find((i) => i.name === name)!;
const lv = (attack: number, defence = 1) => ({ attack, strength: 1, defence });
const owned = (items: [string, number, number][], bankSeen = true): OwnedState => ({
  bankSeen, items: new Map(items.map(([name, carried, bank]) => [name.toLowerCase(), { name, carried, noted: 0, bank }])),
});
const ready = (id: string, o: OwnedState | null, g: GearState | null) => {
  // Every earlier step is done, so the answer is about the items and the money of this step.
  let progress = emptyProgress();
  for (const s of allSteps) { if (s.id === id) break; progress = withStep(progress, s.id, 'done'); }
  return stepReadiness({ step: step(id), steps: allSteps, progress, qp: 200, mode: 'members', stats: { attack: 40 }, owned: o, gear: g });
};

describe('S4-03: a weapon that can be wielded, Hill Giants, 50 Big bones', () => {
  it('the step needs the Adamant scimitar and never the Rune scimitar before Attack 40', () => {
    const s = step('S4-03');
    expect(names(s.itemsRequired)).toEqual(['Adamant scimitar']);
    expect([...names(s.itemsRequired), ...names(s.itemsRecommended)]).not.toContain('Rune scimitar');
    expect(s.foes).toEqual(['Hill Giant']);
    expect(s.pacing).toMatchObject({ skill: 'attack', targetLevel: 40, expPerAction: 140 });
    expect(s.inGame!.npcNames).toEqual(['Hill Giant']);
  });

  it('the existing gear rules: at Attack 39 the Adamant scimitar is wearable and the Rune scimitar is not, at 40 it is', () => {
    expect(canWear(piece('Adamant scimitar'), lv(39))).toBe(true);
    expect(canWear(piece('Rune scimitar'), lv(39))).toBe(false);
    expect(canWear(piece('Rune scimitar'), lv(40))).toBe(true);
  });

  it('the completion is Attack 40 and 50 Big bones, and Big bones are not coins', () => {
    expect(step('S4-03').inGame!.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }], items: [{ names: ['Big bones'], count: 50 }] });
    expect(step('S4-03').doneWhen).toMatch(/50\+ Big bones in the bank/);
    // 50 banked bones leave Wormbrain's 10,000 coins missing: bones are not liquid cash until sold.
    const r = ready('S5-05', owned([['Big bones', 0, 50]]), gearOf(0, 0));
    const coins = r.requirements.find((x) => x.kind === 'coins')!;
    expect(coins.state).toBe('MISSING');
  });
});

describe('S5-05 and S5-06 need liquid coins', () => {
  it('the bribe and the ship are item lines of Coins, and banked coins are only "in the bank"', () => {
    expect(step('S5-05').itemsRequired!.map((i) => [i.nameEn, i.amount])).toEqual([['Coins', 10000]]);
    expect(step('S5-06').itemsRequired!.find((i) => i.nameEn === 'Coins')!.amount).toBe(2000);
    const inBag = ready('S5-05', owned([]), gearOf(10_000, 0)).requirements.find((x) => x.kind === 'coins')!;
    const inBank = ready('S5-05', owned([]), gearOf(0, 10_000)).requirements.find((x) => x.kind === 'coins')!;
    expect(inBag.state).toBe('OK');
    expect(inBank.state).toBe('BANK');
  });

  it('unknown is not missing: no game data leaves the coins unknown and the step unknown', () => {
    const r = ready('S5-05', null, null);
    expect(r.requirements.find((x) => x.kind === 'coins')!.state).toBe('UNKNOWN');
    expect(r.status).toBe('UNKNOWN');
    const unseen = ready('S5-06', owned([], false), gearOf(5, null));
    expect(unseen.requirements.find((x) => x.kind === 'coins')!.state).not.toBe('MISSING');
  });
});

describe('S5-09: the quest completes Dragon Slayer I, the platebody is optional', () => {
  it('no item in the completion, no mandatory platebody, and the platebody cannot be worn below Defence 40', () => {
    const s = step('S5-09');
    expect(s.inGame!.completionTrigger).toEqual({ type: 'QUEST_COMPLETED', questName: 'Dragon Slayer I' });
    expect(s.itemsRequired).toBeUndefined();
    expect(names(s.itemsRecommended)).toEqual(['Rune platebody']);
    expect(s.doneWhen).toMatch(/optional/);
    expect(canWear(piece('Rune platebody'), lv(40, 33), new Set(['Dragon Slayer I']))).toBe(false);
    expect(canWear(piece('Rune platebody'), lv(40, 40), new Set(['Dragon Slayer I']))).toBe(true);
  });

  it('without the platebody the step has nothing missing', () => {
    const r = ready('S5-09', owned([]), gearOf(0, 0));
    expect(r.requirements.filter((x) => x.kind === 'item')).toEqual([]);
  });
});

describe('S5-03, S5-04, S5-05: each piece by its own identity', () => {
  const piece3 = { S5_03: 1535, S5_04: 1537, S5_05: 1536 } as const;
  const trig = (id: string) => step(id).inGame!.completionTrigger!;

  it('three different item IDs, plus the joined map as a separate state', () => {
    const ids = ['S5-03', 'S5-04', 'S5-05'].map((id) => trig(id).items![0].id);
    expect(ids).toEqual([piece3.S5_03, piece3.S5_04, piece3.S5_05]);
    expect(new Set(ids).size).toBe(3);
    for (const id of ['S5-03', 'S5-04', 'S5-05']) {
      expect(trig(id).items![0].names).toEqual(['Map part']);
      expect(trig(id).items![1]).toEqual({ names: ['Crandor map'], count: 1 });
      expect(trig(id).anyOf).toBe(true);
    }
  });
});

describe('S1-09: the boots are the proof of the Stronghold', () => {
  it('either pair of boots completes it, no four-chest triggers and no 10,000 coins', () => {
    const t = step('S1-09').inGame!.completionTrigger!;
    expect(t).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Fighting boots', 'Fancy boots'], count: 1 }] });
    expect(JSON.stringify(t)).not.toMatch(/Coins|chest/i);
  });
});

describe('S7-05: no fairy ring before the route unlocks them', () => {
  const lumbridge = { x: 3213, y: 3237, plane: 0 };
  const hazelmere = { x: 2677, y: 3087, plane: 0 };
  const run = (fairyRings?: boolean | null) =>
    travelOptions({ from: lumbridge, to: hazelmere, levels: {}, carried: [{ id: 772, name: 'Dramen staff' }], bankSeen: true, members: true, ...(fairyRings === undefined ? {} : { fairyRings }) });

  it('locked: no fairy ring option at all, so CLS is never returned', () => {
    expect(run(false).some((o) => o.id === 'fairy' || o.legs.some((l) => l.kind === 'fairy'))).toBe(false);
  });

  it('unlocked: the ring may be offered, ready', () => {
    const fairy = run(true).find((o) => o.id === 'fairy');
    expect(fairy).toBeDefined();
    expect(fairy!.title).toMatch(/CLS/);
    expect(fairy!.availability).toBe('ready');
  });

  it('unknown stays possible, not locked', () => {
    const fairy = run().find((o) => o.id === 'fairy');
    expect(fairy?.availability).toBe('maybe');
  });

  it('the route unlocks the rings at S9-03, and the stage text no longer sends the player to CLS', () => {
    expect(fairyRingsUnlocked(emptyProgress())).toBe(false);
    expect(fairyRingsUnlocked(withStep(emptyProgress(), 'S9-03', 'done'))).toBe(true);
    const lines = step('S7-05').questStages!.stages.flatMap((s) => s.do);
    const hazelmere = lines.find((l) => /Hazelmere/.test(l.t) && /island east of Yanille/.test(l.t))!;
    expect(hazelmere.s).not.toMatch(/CLS/);
    expect(hazelmere.t).not.toMatch(/CLS or/);
    const input = travelInputOf({ from: lumbridge, to: hazelmere.at ? { x: hazelmere.at[0], y: hazelmere.at[1], plane: 0 } : lumbridge, levels: {}, stats: null, gear: null, owned: null, mode: 'members', fairyRings: false });
    expect(input.fairyRings).toBe(false);
  });
});

describe('S1-07: instance coordinates are not world-map targets', () => {
  const points = () => {
    const s = step('S1-07');
    const out: { x: number; y: number; plane: number }[] = [];
    for (const st of s.questStages!.stages) for (const l of st.do) if (l.at) out.push({ x: l.at[0], y: l.at[1], plane: l.at[2] });
    if (s.mapLocation && !Array.isArray(s.mapLocation)) out.push({ x: s.mapLocation.x, y: s.mapLocation.y, plane: s.mapLocation.plane });
    return out;
  };

  it('the manor points are recognised as instanced, the overworld is not', () => {
    const inst = points().filter(isInstancedPoint);
    expect(inst.length).toBeGreaterThan(5);
    expect(isInstancedPoint({ x: 1615, y: 4829 })).toBe(true);
    expect(isInstancedPoint({ x: 3213, y: 3428 })).toBe(false);
  });

  it('no way is planned to or from an instanced point', () => {
    for (const p of points().filter(isInstancedPoint)) {
      expect(travelOptions({ from: { x: 3213, y: 3237, plane: 0 }, to: p, levels: {}, carried: [], bankSeen: true })).toEqual([]);
      expect(travelOptions({ from: p, to: { x: 3213, y: 3237, plane: 0 }, levels: {}, carried: [], bankSeen: true })).toEqual([]);
    }
  });

  it('the navigation target of an instanced step point is flagged, so the world map does not draw it', () => {
    const nav = navigationTarget({ ...step('S1-07'), inGame: { worldPoint: { x: 1615, y: 4829, plane: 0, label: 'Manor' } } } as Step);
    expect(nav).toMatchObject({ x: 1615, y: 4829, instanced: true });
  });
});

describe('retired and trimmed grinds', () => {
  it('S1-11 is retired through the existing mechanism: a fresh route skips it, an old save loads without it', () => {
    expect(stepById.has('S1-11')).toBe(false);
    expect(RETIRED_STEPS).toContain('S1-11');
    for (const s of allSteps) expect(s.requires, s.id).not.toContain('S1-11');
    const f2p = stepsFor('f2p');
    let p = emptyProgress();
    for (const s of f2p) { if (s.id === 'S1-12') break; p = withStep(p, s.id, 'done'); }
    expect(nextStep(f2p, p, 0)!.id).toBe('S1-12');
    const known = { stepIds: new Set(allSteps.map((s) => s.id)), levelIds: new Set<string>() };
    const n = normalizeProgress({ version: 3, steps: { 'S1-11': 'done', 'S1-12': 'done', 'S4-03': 'done' } }, known)!;
    expect(Object.keys(n.progress.steps).sort()).toEqual(['S1-12', 'S4-03']);
  });

  it('S1-12 is Mining 10 and needs no ore: Doric\'s copper and iron come from S2-01', () => {
    const s = step('S1-12');
    expect(s.inGame!.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'mining', level: 10 }] });
    expect(s.pacing).toMatchObject({ skill: 'mining', targetLevel: 10, targetExp: xpForLevel(10) });
    expect(s.title).toBe('Mining to 10');
    expect(JSON.stringify(s.fields)).not.toMatch(/4 copper|2 iron/);
    const shop = step('S2-01').itemsRequired!;
    expect(shop.find((i) => i.nameEn === 'Copper ore')).toMatchObject({ amount: 4 });
    expect(shop.find((i) => i.nameEn === 'Iron ore')).toMatchObject({ amount: 2 });
    expect(step('S2-01').inGame!.completionTrigger!.items).toEqual(expect.arrayContaining([{ names: ['Copper ore'], count: 4 }, { names: ['Iron ore'], count: 2 }]));
    for (const i of step('S3-01').itemsRequired!.filter((x) => x.nameEn === 'Copper ore' || x.nameEn === 'Iron ore')) expect(i.howToGet).toMatch(/S2-01/);
  });

  it('S1-13 is 12,000 gp of coins; hides are not counted', () => {
    const s = step('S1-13');
    expect(s.moneyGoal).toBe(12_000);
    expect(s.inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 12000 }] });
    expect(JSON.stringify(s.inGame!.completionTrigger)).not.toMatch(/Cowhide/);
  });

  it('S3-06 is coins only: ore and the scimitar are other steps', () => {
    expect(step('S3-06').inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 2500 }] });
  });

  it('S4-04 has no fishing leftovers', () => {
    expect(JSON.stringify(step('S4-04'))).not.toMatch(/feather|fly fishing|fishing rod|Barbarian Village/i);
    expect(names(step('S4-04').itemsRequired)).toEqual(['Lobster']);
  });

  it('S5-08: the shield and the food are required, the upgrade and the potions are advice', () => {
    const s = step('S5-08');
    expect(names(s.itemsRequired)).toEqual(['Anti-dragon shield', 'Lobster']);
    expect(names(s.itemsRecommended)).toEqual(expect.arrayContaining(['Rune sword', 'Strength potion(4)', 'Energy potion(4)']));
  });

  it('S8-03 is Agility 40: Graceful is not a condition', () => {
    const s = step('S8-03');
    expect(s.inGame!.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'agility', level: 40 }] });
    expect(s.doneWhen).not.toMatch(/at least 2/);
  });
});

describe('F2P and members filtering still hold', () => {
  it('the F2P route has no members step, the members route keeps the members steps, and the retired ones are in neither', () => {
    const f2p = stepsFor('f2p').map((s) => s.id);
    const members = stepsFor('members').map((s) => s.id);
    expect(f2p.some((id) => step(id).membersOnly)).toBe(false);
    expect(members).toContain('S8-03');
    expect(f2p).toContain('S4-03');
    for (const id of RETIRED_STEPS) {
      expect(f2p).not.toContain(id);
      expect(members).not.toContain(id);
    }
  });
});
