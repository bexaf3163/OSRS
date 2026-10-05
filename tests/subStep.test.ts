import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { actionOf, dialogueOf, findSubStep, itemStatus, subStepItems, subStepNpcInfo } from '../src/lib/subStep';
import type { NavTargetPayload } from '../src/services/runeliteBridge';

const ali = stepById.get('S2-10')!;
const nav = (label: string, extra: Partial<NavTargetPayload> = {}): NavTargetPayload => ({ label, x: 0, y: 0, plane: 0, stepId: 'S2-10', ...extra });

describe('the active sub-step', () => {
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
