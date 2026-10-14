import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { actionOf, alternativeAt, dialogueOf, findSubStep, instructionSubStep, itemStatus, subStepItems, subStepNpcInfo } from '../src/lib/subStep';
import type { NavTargetPayload } from '../src/services/runeliteBridge';

const ali = stepById.get('S2-10')!;
const nav = (label: string, extra: Partial<NavTargetPayload> = {}): NavTargetPayload => ({ label, x: 0, y: 0, plane: 0, stepId: 'S2-10', ...extra });

describe('the active sub-step', () => {
  it('uses the current quest cursor independently of an earlier navigation target', () => {
    const mountain = stepById.get('S3-04')!;
    const stage = mountain.questStages!.stages.find(s => s.do.some(l => l.k === 'defeatGuardian'))!;
    const lineIndex = stage.do.findIndex(l => l.k === 'defeatGuardian');
    const current = instructionSubStep(mountain, { stepId: mountain.id, stageAt: stage.at, lineIndex, peeking: false });
    expect(current?.title).toMatch(/Ancient Guardian/);
    expect(findSubStep(mountain, { label: 'Talk to Willow (south of Ice Mountain)', x: 0, y: 0, plane: 0, stepId: mountain.id })?.title).toMatch(/Willow/);
    expect(instructionSubStep(mountain, { stepId: 'S2-10', stageAt: stage.at, lineIndex, peeking: false })).toBeNull();
    expect(instructionSubStep(mountain, { stepId: mountain.id, stageAt: -1, lineIndex, peeking: false })).toBeNull();
    expect(instructionSubStep(mountain, { stepId: mountain.id, stageAt: stage.at, lineIndex: 9999, peeking: false })).toBeNull();
    expect(instructionSubStep(mountain, null)).toBeNull();
  });
  it('is found from the label of the arrow target the game follows', () => {
    const s = findSubStep(ali, nav('Lady Keli: use soft clay on the key for a print'))!;
    expect(s.index).toBe(4);
    expect(s.size).toBe(6);
    expect(s.line.k).toBe('talkToKeli');
    expect(s.dialogue[0]).toBe('Heard of you? You\'re famous in Gielinor!');
    expect(s.dialogue).toHaveLength(5);
    expect(s.action.includes('Dialogue')).toBe(false);
  });

  it('is found by its tile when the label was shortened by the plugin', () => {
    const s = findSubStep(ali, nav('something else entirely', { x: 3127, y: 3244, plane: 0 }))!;
    expect(s.line.k).toBe('talkToKeli');
  });

  it('is null for another step, without a target, or on a detour', () => {
    expect(findSubStep(ali, null)).toBeNull();
    expect(findSubStep(ali, nav('Lady Keli: use soft clay on the key for a print', { stepId: 'S2-09' }))).toBeNull();
    expect(findSubStep(ali, nav('Buy a Falador teleport tablet'))).toBeNull();
    expect(findSubStep(stepById.get('S1-01')!, nav('anything', { stepId: 'S1-01' }))).toBeNull();
  });

  it('asks only for the items of that sub-step', () => {
    const furnace = findSubStep(ali, nav('Use the key print and bronze bar on a furnace'))!;
    expect(subStepItems(ali, furnace).map((i) => i.name).sort()).toEqual(['Bronze bar', 'Key print']);
    const keli = findSubStep(ali, nav('Lady Keli: use soft clay on the key for a print'))!;
    expect(subStepItems(ali, keli).map((i) => i.name)).toContain('Soft clay');
    expect(subStepItems(ali, keli).map((i) => i.name)).not.toContain('Bronze bar');
  });

  it('names the NPC of the sub-step for the dossier, with a place from the dictionary', () => {
    const keli = findSubStep(ali, nav('Lady Keli: use soft clay on the key for a print'))!;
    const npc = subStepNpcInfo(ali, keli);
    expect(npc?.nameEn).toMatch(/Keli/);
    expect(npc?.location.length).toBeGreaterThan(0);
    const furnace = findSubStep(ali, nav('Use the key print and bronze bar on a furnace'))!;
    expect(subStepNpcInfo(ali, furnace)).toBeNull();
  });
});

describe('dialogue and action text', () => {
  it('splits the options of a dialogue and cuts quotes and the final dot', () => {
    expect(dialogueOf('Talk to Hassan. Dialogue: “Is there anything I can help you with?” → “Yes”.')).toEqual(['Is there anything I can help you with?', 'Yes']);
    expect(dialogueOf('Walk to the bank.')).toEqual([]);
    expect(actionOf('Talk to Hassan. Dialogue: “A” → “B”.')).toBe('Talk to Hassan.');
  });
});

describe('item status is three-valued', () => {
  const base = { owned: null, equipment: {}, manual: {}, bankSeen: false };
  const bag = (items: { name: string; count: number }[]) => ({ ...base, bagItems: { known: true as const, value: items, source: 'game' as const } });
  it('in the bag is in the bag, wherever else it is tracked', () => {
    expect(itemStatus(bag([{ name: 'Key print', count: 1 }]), 'Key print')).toBe('bag');
  });
  it('a known bag without it and an unopened bank is not checked, never missing', () => {
    expect(itemStatus(bag([{ name: 'Rope', count: 1 }]), 'Key print')).toBe('unknown');
    expect(itemStatus({ ...base, bagItems: { known: false } }, 'Key print')).toBe('unknown');
  });
});

describe('an alternative in the current action', () => {
  it('sets apart only a whole second way, as the plugin does', () => {
    expect(alternativeAt('Defeat the Ancient Guardian or mine 4 pillars (Mining 10)')).toBe(27);
    expect(alternativeAt('Use the rope (bought) or ask Ned')).toBe(21);
    // A restriction after a colon and an "or" inside a bracket are the instruction itself: muting the tail would hide part of it.
    expect(alternativeAt('Kill the Temple Guardian (level 30): melee or ranged only')).toBe(-1);
    expect(alternativeAt('Bring Drezel 50 unnoted essence (rune or pure)')).toBe(-1);
    expect(alternativeAt('Talk to Willow')).toBe(-1);
  });

  it('no quest line of the route loses a restriction to the muted tail', () => {
    const cut: string[] = [];
    for (const s of stepById.values()) {
      for (const st of s.questStages?.stages ?? []) for (const l of st.do) {
        const title = (l.s?.trim() || l.t).trim();
        const at = alternativeAt(title);
        if (at > 0 && /[(:]/.test(title.slice(0, at)) && title.slice(0, at).split('(').length !== title.slice(0, at).split(')').length) cut.push(`${s.id}: ${title}`);
      }
    }
    expect(cut).toEqual([]);
  });
});
