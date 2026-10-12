import { describe, expect, it } from 'vitest';
import { allSteps, stagesFor, stepById, stepsFor } from '../src/data';
import questStages from '../src/data/questStages.json';
import { alchMargin } from '../src/lib/alchemy';
import { carryoverOf, routeTrigger } from '../src/lib/carryover';
import { DAERO_SMALL, daeroAdvice } from '../src/lib/daero';
import { blockersOf, nextStep, stepState, suggestedBefore } from '../src/lib/next-step';
import { emptyProgress } from '../src/lib/progress';
import { alternativesOf, PICKAXES, toolFamilyOf } from '../src/lib/toolTiers';
import { xpForLevel } from '../src/lib/xp';

// The route model of 2.49: dependencies, optional branches, carryover, loadouts, tool tiers, Daero, alchemy and the S3-04 rework.

const step = (id: string) => stepById.get(id)!;
const quests = (questStages as unknown as { quests: Record<string, { stages: { at: number; items?: { name: string }[]; do: { k: string; t: string; s?: string; mh?: number; hl?: { on?: string[] }; pre?: { item: string }[] }[] }[] }> }).quests;

describe('the step graph', () => {
  const ids = new Set(allSteps.map((s) => s.id));

  it('every dependency exists, the order is the array order, and nothing requires itself', () => {
    for (const s of allSteps) {
      for (const r of [...s.requires, ...(s.softRequires ?? [])]) {
        expect(ids.has(r), `${s.id} -> ${r}`).toBe(true);
        expect(r, s.id).not.toBe(s.id);
      }
    }
    expect(new Set(allSteps.map((s) => s.id)).size).toBe(allSteps.length);
    const stagesInOrder = allSteps.map((s) => s.stage);
    expect(stagesInOrder).toEqual([...stagesInOrder].sort((a, b) => a - b));
  });

  it('a step only requires steps that come before it in the list, and there is no cycle', () => {
    const at = new Map(allSteps.map((s, i) => [s.id, i]));
    for (const s of allSteps) {
      for (const r of [...s.requires, ...(s.softRequires ?? [])]) expect(at.get(r)!, `${s.id} -> ${r}`).toBeLessThan(at.get(s.id)!);
    }
  });

  it('an optional step is never a hard requirement: a later step suggests it with softRequires', () => {
    const optional = new Set(allSteps.filter((s) => s.optional).map((s) => s.id));
    for (const s of allSteps) {
      // A Bond branch step may require another optional step of the same branch (they are skipped together).
      if (s.bondBranch) continue;
      for (const r of s.requires) expect(optional.has(r), `${s.id} requires the optional ${r}`).toBe(false);
    }
  });

  it('S3-06 is suggested after the optional Shield of Arrav but never blocked by it', () => {
    const p = emptyProgress();
    expect(step('S3-05').optional).toBe(true);
    expect(step('S3-06').softRequires).toEqual(['S3-05']);
    expect(step('S3-06').requires).not.toContain('S3-05');
    for (const id of step('S3-06').requires) p.steps[id] = 'done';
    expect(blockersOf(step('S3-06'), p, 99)).toBeNull();
    expect(suggestedBefore(step('S3-06'), p)).toEqual(['S3-05']);
    p.steps['S3-05'] = 'skipped';
    expect(suggestedBefore(step('S3-06'), p)).toEqual([]);
    expect(stepState(p, 'S3-05')).toBe('skipped');
    expect(stepState(p, 'S3-06')).toBe('open');
  });

  it('the Bond branch (stage 6) is only optional steps and the Bond, and Members mode drops all of it', () => {
    const bond = allSteps.filter((s) => s.bondBranch);
    expect(bond.length).toBeGreaterThan(0);
    expect(bond.every((s) => s.stage === 6)).toBe(true);
    expect(allSteps.filter((s) => s.stage === 6).every((s) => s.bondBranch)).toBe(true);
    const members = stepsFor('members');
    expect(members.some((s) => s.bondBranch)).toBe(false);
    expect(stagesFor('members').map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
    const memberIds = new Set(members.map((s) => s.id));
    for (const s of members) for (const r of s.requires) expect(memberIds.has(r), `${s.id} -> ${r}`).toBe(true);
  });

  it('in Members mode the first members quest is next once the F2P quests are done: stage 6 never blocks it', () => {
    const p = emptyProgress();
    const f2p = stepsFor('members').filter((s) => s.stage <= 5);
    for (const s of f2p) p.steps[s.id] = 'done';
    const qp = 46;
    expect(nextStep(stepsFor('members'), p, qp)?.id).toBe('S7-01');
  });
});

describe('carryover: what a step keeps for a later step', () => {
  const withCarry = allSteps.filter((s) => s.carryover?.length);

  it('the five early steps carry what Prince Ali Rescue and Black Knights\' Fortress need', () => {
    expect(withCarry.map((s) => s.id).sort()).toEqual(['S1-03', 'S1-04', 'S1-08', 'S1-12', 'S2-11']);
  });

  it('the consuming step exists, comes later and mentions the item and points back', () => {
    const at = new Map(allSteps.map((s, i) => [s.id, i]));
    for (const s of withCarry) {
      for (const c of carryoverOf(s)) {
        const user = step(c.forStep);
        expect(user, `${s.id} -> ${c.forStep}`).toBeDefined();
        expect(at.get(user.id)!).toBeGreaterThan(at.get(s.id)!);
        // The consumer names the item (the ore is listed as the Bronze bar it is smelted into, and its text says so).
        expect(JSON.stringify(user).toLowerCase().includes(c.item.toLowerCase().replace(/ ore$/, '')), `${user.id} does not mention ${c.item}`).toBe(true);
        expect(JSON.stringify(user).includes(s.id), `${user.id} does not point back to ${s.id}`).toBe(true);
        expect(c.count).toBeGreaterThan(0);
      }
    }
  });

  it('the game trigger of a carrying quest step gets the kept items on top, and an anyOf trigger is left alone', () => {
    const t = routeTrigger(step('S1-04'))!;
    expect(t.type).toBe('QUEST_COMPLETED');
    expect(t.items).toEqual(expect.arrayContaining([{ names: ['Ball of wool'], count: 3 }]));
    const own = step('S1-04').inGame!.completionTrigger!;
    expect(own.items ?? []).toHaveLength(0);
    const anyOf = { inGame: { completionTrigger: { type: 'QUEST_COMPLETED' as const, questName: 'X', anyOf: [{ type: 'QUEST_COMPLETED' as const, questName: 'Y' }] } }, carryover: step('S1-04').carryover };
    expect(routeTrigger(anyOf as never)).toBe(anyOf.inGame.completionTrigger);
  });
});

describe('loadouts: a quest that changes what you may carry', () => {
  it('the Waterfall tomb takes no runes, and the runes belong to the dungeon loadout', () => {
    const s = step('S7-01');
    const tomb = s.loadouts!.find((l) => l.id === 'tomb')!;
    const dungeon = s.loadouts!.find((l) => l.id === 'dungeon')!;
    expect(tomb.leave).toEqual(expect.arrayContaining(['runes', 'weapons']));
    expect(tomb.take.some((t) => /rune/i.test(t.nameEn))).toBe(false);
    for (const r of ['Air rune', 'Water rune', 'Earth rune', 'Rope']) expect(dungeon.take.map((t) => t.nameEn), r).toContain(r);
    const ids = new Set(s.loadouts!.map((l) => l.id));
    for (const i of [...s.itemsRequired, ...(s.itemsRecommended ?? [])]) if (i.phase) expect(ids.has(i.phase), `${i.nameEn} phase`).toBe(true);
    expect(s.itemsRequired.find((i) => i.nameEn === 'Air rune')!.phase).toBe('dungeon');
  });

  it('Monkey Madness I is prepared before the first step: gold bar, wool, lockpick, food, prayer, and the Daero choice', () => {
    const s = step('S9-04');
    const names = s.itemsRequired.map((i) => i.nameEn);
    expect(names).toEqual(expect.arrayContaining(['Gold bar', 'Ball of wool', 'Lockpick']));
    expect(s.rewardChoice).toBe('daero');
    expect(s.requires).toContain('S8-06');
    expect(s.requirements!.some((r) => r.type === 'skill' && r.skill === 'prayer' && r.min === 43)).toBe(true);
    expect(s.loadouts!.length).toBeGreaterThanOrEqual(3);
    expect(step('S8-06').inGame!.completionTrigger!.levels).toEqual([{ skill: 'prayer', level: 43 }]);
  });
});

describe('tool tiers', () => {
  it('a bronze pickaxe in a step means any pickaxe', () => {
    expect(toolFamilyOf('Bronze pickaxe')).toBe(PICKAXES);
    expect(toolFamilyOf('Rune pickaxe')).toBeNull();
    expect(alternativesOf('Bronze pickaxe')).toContain('Rune pickaxe');
    expect(alternativesOf('Bronze pickaxe')).not.toContain('Bronze pickaxe');
    expect(alternativesOf('Trout', ['Salmon', 'Trout'])).toEqual(['Salmon']);
  });
});

describe('Daero\'s training and High Level Alchemy', () => {
  const need = xpForLevel(60);

  it('Attack and Defence while 60 is far, Strength and Hitpoints when the smaller share is enough or nothing is missing', () => {
    expect(daeroAdvice(50, xpForLevel(50)).pick).toBe('ATTACK_DEFENCE');
    expect(daeroAdvice(undefined, undefined).pick).toBe('ATTACK_DEFENCE');
    expect(daeroAdvice(60, undefined).pick).toBe('STRENGTH_HITPOINTS');
    expect(daeroAdvice(58, need - DAERO_SMALL).pick).toBe('STRENGTH_HITPOINTS');
    expect(daeroAdvice(58, need - DAERO_SMALL - 1).pick).toBe('ATTACK_DEFENCE');
    expect(daeroAdvice(58, need - DAERO_SMALL - 1).missing).toBe(DAERO_SMALL + 1);
  });

  it('a margin is the alchemy value minus the item and the Nature rune; an unknown price is not a profit', () => {
    expect(alchMargin(1000, 700, 100)).toEqual({ profit: 200, worth: true });
    expect(alchMargin(1000, 920, 100)).toEqual({ profit: -20, worth: false });
    expect(alchMargin(1000, undefined, 100)).toBeNull();
    expect(alchMargin(undefined, 700, 100)).toBeNull();
    expect(alchMargin(1000, 700, undefined)).toBeNull();
  });
});

describe('S3-04 Below Ice Mountain: the Structural pillar method', () => {
  const quest = quests['S3-04'];
  const lines = quest.stages.flatMap((st) => st.do.map((d) => ({ at: st.at, ...d })));
  const fight = lines.find((l) => l.k === 'defeatGuardian')!;

  it('the recommended way is mining four Structural pillars, never ore', () => {
    expect(fight.t).toMatch(/four Structural pillars/);
    expect(fight.t).toMatch(/not ore rocks/);
    expect(fight.s).toMatch(/mine 4 Structural pillars/i);
    const text = JSON.stringify(step('S3-04')).toLowerCase();
    expect(text).not.toMatch(/mine (an? )?(ore|rock)/);
  });

  it('the pre-flight asks for a pickaxe of any tier and food, and Mining 10 is a requirement', () => {
    expect(fight.pre!.map((p) => p.item)).toEqual(['Bronze pickaxe', 'Trout']);
    const items = quest.stages.find((st) => st.at === 35)!.items!.map((i) => i.name);
    expect(items).toEqual(expect.arrayContaining(['Bronze pickaxe', 'Trout']));
    expect(step('S3-04').requirements!.some((r) => r.type === 'skill' && r.skill === 'mining' && r.min === 10)).toBe(true);
    expect(step('S3-04').itemsRequired.map((i) => i.nameEn)).toContain('Bronze pickaxe');
  });

  it('the Guardian\'s biggest hit is known to the health warning, and the pillar is highlighted', () => {
    expect(fight.mh).toBe(7);
    expect(fight.hl!.on).toEqual(['Structural pillar']);
    expect(step('S3-04').inGame!.objectNames).toContain('Structural pillar');
  });

  it('the quest is complete only when the game says so', () => {
    expect(step('S3-04').inGame!.completionTrigger).toEqual({ type: 'QUEST_COMPLETED', questName: 'Below Ice Mountain' });
  });

  it('the safespot is a fallback after the recommended method, and the order in the text says so', () => {
    expect(fight.t.indexOf('Recommended')).toBeLessThan(fight.t.indexOf('Fallback'));
    expect(fight.t).toMatch(/east side/);
  });
});
