import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { shortLine, SHORT_MAX } from '../src/lib/shortText';
import { stagePayload, stepGuide } from '../src/services/runeliteBridge';
import raw from '../src/data/questStages.json';

const quests = (raw as unknown as { quests: Record<string, import('../src/types').QuestStages> }).quests;

describe('short text for the game', () => {
  it('"Dialogue: ..." is dropped and the first sentence is taken', () => {
    expect(shortLine('Talk to Reldo in the library of Varrock Palace. Dialogue: “What do you know about the Imcando dwarves?”.')).toBe('Talk to Reldo in the library of Varrock Palace');
    expect(shortLine('Pick up an egg at the farm north of Lumbridge. The egg lies by the chicken coop, there are plenty.')).toBe('Pick up an egg at the farm north of Lumbridge');
  });

  it('short text is unchanged and the trailing full stop is removed', () => {
    expect(shortLine('Operate the hopper controls.')).toBe('Operate the hopper controls');
    expect(shortLine('Go')).toBe('Go');
  });

  it('long text is cut at a dash, then a comma, then a word with an ellipsis, and never exceeds the limit', () => {
    expect(shortLine('Talk to Thurgo at his house south of Port Sarim — he has been waiting for you there for ages and will explain everything in detail')).toBe('Talk to Thurgo at his house south of Port Sarim');
    expect(shortLine('Climb up to the second floor of Falador Castle, then go west and look for the right cupboard in the far room')).toBe('Climb up to the second floor of Falador Castle');
    const byWord = shortLine('word '.repeat(40));
    expect(byWord.endsWith('…')).toBe(true);
    for (const s of ['a'.repeat(300), 'word '.repeat(80), 'x']) expect(shortLine(s).length).toBeLessThanOrEqual(SHORT_MAX);
  });

  it('every step of every stage has a ready short text: one line, no dialogue and no references to the side panel', () => {
    let n = 0;
    for (const [id, q] of Object.entries(quests)) {
      for (const st of q.stages) {
        for (const l of st.do) {
          n++;
          expect(l.s, `${id}#${st.at}: ${l.t.slice(0, 40)}`).toBeTruthy();
          expect(l.s!.length, `${id}: ${l.s}`).toBeLessThanOrEqual(72);
          expect(l.s, `${id}: ${l.s}`).not.toMatch(/Dialogue|side panel|panel on the right/i);
          // The short text may be slightly longer than the full one (item names as in the game), but not noticeably.
          expect(l.s!.length, `${id}: the short text must not be longer than the full one`).toBeLessThanOrEqual(l.t.length + 8);
        }
      }
    }
    expect(n).toBeGreaterThan(600);
  });

  it('a step that repeats across stages has the same name', () => {
    const seen = new Map<string, string>();
    for (const q of Object.values(quests)) for (const st of q.stages) for (const l of st.do) {
      const was = seen.get(l.t);
      if (was !== undefined) expect(l.s).toBe(was);
      else seen.set(l.t, l.s!);
    }
  });

  it('the game receives the short text next to the full one; points and conditions are in place', () => {
    const step = allSteps.find((s) => s.id === 'S2-07')!;
    const g = stepGuide(step);
    const stages = g.stage!.stages;
    const last = stages[stages.length - 1].steps;
    const ore = last.find((l) => l.t.startsWith('Mine a blurite ore'))!;
    expect(ore.s).toBe('Mine a blurite ore in the eastern cavern');
    expect(ore.t.length).toBeGreaterThan(ore.s!.length);
    expect(ore.has).toBe('Blurite ore');
    const back = last.find((l) => l.need === 'Blurite ore')!;
    expect(back.s).toBe('Bring Thurgo blurite ore and 2 iron bars');
    expect(back.x).toBeGreaterThan(0);
  });

  it('with no s in the data the shortened full text is sent, not nothing', () => {
    const step = allSteps.find((s) => s.id === 'S2-07')!;
    const long = 'Talk to Thurgo at his house south of Port Sarim. Dialogue: “Hello”.';
    const patched = { ...step, questStages: { ...step.questStages!, stages: [{ at: 0, do: [{ t: long }] }] } };
    const p = stagePayload(patched, []);
    expect(p!.stages[0].steps[0].s).toBe('Talk to Thurgo at his house south of Port Sarim');
  });
});
