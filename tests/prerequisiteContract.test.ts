import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import machines from '../src/data/questMachines.json';
import { stepGuide } from '../src/services/runeliteBridge';
import { stepTargets } from '../src/lib/travelSupplies';
import { questItemKeys } from '../src/lib/questItems';

describe('the Fairytale II route milestone', () => {
  it('ends both the walkthrough and game state machine before the rest of the quest', () => {
    const s = stepById.get('S9-03')!;
    const sent = stepGuide(s);
    const machine = machines.quests['S9-03'];
    expect(s.inGame?.completionTrigger).toMatchObject({ type: 'VARBIT_CHANGED', targetValue: 40, atLeast: true });
    expect(s.questStages!.stages.every(st => st.at < 40)).toBe(true);
    expect(Object.keys(machine.stages).every(v => Number(v) < 40)).toBe(true);
    expect(JSON.stringify([s.quickSteps, s.questStages, s.threats, sent, machine])).not.toMatch(/Gorak|Star flower|pickpocketGodfather|killGorak|goToHideout|Queen's secateurs/i);
    expect(s.questStages!.stages.at(-1)!.do.at(-1)!.k).toBe('talkToGodfather');
    expect(s.itemsRequired?.map(i => i.nameEn)).toEqual(['Dramen staff']);
    expect(questItemKeys([s])).not.toContain('gorak claws');
    expect(stepTargets(s).some(t => /Gorak|hideout|star flower/i.test(t.label))).toBe(false);
  });
});
