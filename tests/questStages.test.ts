import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { stepGuide } from '../src/services/runeliteBridge';
import raw from '../src/data/questStages.json';

const quests = (raw as unknown as { quests: Record<string, import('../src/types').QuestStages> }).quests;
const withStages = allSteps.filter((s) => s.questStages);

describe('quest stages (Quest Helper)', () => {
  it('every quest with stages has a route step, a variable and ascending stages', () => {
    expect(Object.keys(quests).length).toBeGreaterThanOrEqual(30);
    for (const [id, q] of Object.entries(quests)) {
      expect(allSteps.some((s) => s.id === id), id).toBe(true);
      expect(['varp', 'varbit']).toContain(q.var[0]);
      expect(q.var[1]).toBeGreaterThan(0);
      const ats = q.stages.map((s) => s.at);
      expect(ats, id).toEqual([...ats].sort((a, b) => a - b));
      expect(new Set(ats).size, id).toBe(ats.length);
      expect(ats[0], `${id}: the first stage must start at zero`).toBe(0);
    }
  });

  it('plugin limits: stages <= 40, steps per stage <= 40, text <= 500 characters, coordinates within the map', () => {
    for (const [id, q] of Object.entries(quests)) {
      expect(q.stages.length, id).toBeLessThanOrEqual(40);
      for (const st of q.stages) {
        expect(st.do.length, `${id}#${st.at}`).toBeGreaterThan(0);
        expect(st.do.length, `${id}#${st.at}`).toBeLessThanOrEqual(40);
        for (const l of st.do) {
          expect(l.t.trim().length, `${id}#${st.at}`).toBeGreaterThan(0);
          expect(l.t.length, `${id}#${st.at}: ${l.t.slice(0, 40)}`).toBeLessThanOrEqual(500);
          if (l.at) {
            expect(l.at[2]).toBeGreaterThanOrEqual(0);
            expect(l.at[2]).toBeLessThanOrEqual(3);
            expect(l.at[0]).toBeGreaterThan(0);
            expect(l.at[1]).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('every route section has a title, and no step text contains Cyrillic', () => {
    for (const [id, q] of Object.entries(quests)) {
      for (const p of q.route ?? []) {
        expect(p.title.trim().length, id).toBeGreaterThan(0);
        expect(/[А-Яа-яЁё]/.test(p.title), `${id}: ${p.title}`).toBe(false);
        for (const t of p.steps) expect(/[А-Яа-яЁё]/.test(t), `${id}: ${t.slice(0, 50)}`).toBe(false);
      }
    }
  });

  it('the step walkthrough is the whole Quest Helper route, not the old short list', () => {
    for (const s of withStages) {
      const flat = (s.questStages!.route ?? []).flatMap((p) => p.steps);
      if (flat.length) expect(s.quickSteps, s.id).toEqual(flat);
    }
  });

  it('Knight’s Sword: between Imcando and the portrait there is a talk with the Squire and a climb up the stairs', () => {
    const route = (quests['S2-07'].route ?? []).flatMap((p) => p.steps).join('\n');
    expect(route).toMatch(/Squire/);
    expect(route).toMatch(/staircase/);
    expect(route.indexOf('Squire')).toBeLessThan(route.indexOf('Thurgo', route.indexOf('Squire')));
  });

  it('Knight’s Sword: the steps before the portrait are skipped when the Portrait is already in the bag; the mining stage needs a pickaxe', () => {
    const q = quests['S2-07'];
    const stage = q.stages.find((s) => s.do.some((l) => l.has === 'Portrait'))!;
    expect(stage.do.filter((l) => l.has === 'Portrait').length).toBe(3);
    expect(stage.do[stage.do.length - 1].has).toBeUndefined();
    const mining = q.stages.find((s) => s.items?.some((i) => i.name === 'Bronze pickaxe'));
    expect(mining, 'the pickaxe is named on the Blurite mining stage').toBeDefined();
    const sent = stepGuide(allSteps.find((s) => s.id === 'S2-07')!).stage!;
    expect(sent.stages.some((st) => st.steps.some((l) => l.has === 'Portrait'))).toBe(true);
  });

  it('the payload for the plugin fits the request body limit and contains the stages', () => {
    for (const s of withStages) {
      const g = stepGuide(s);
      expect(g.stage, s.id).toBeDefined();
      expect(g.stage!.kind).toBe(s.questStages!.var[0]);
      expect(g.stage!.id).toBe(s.questStages!.var[1]);
      expect(g.stage!.stages.length, s.id).toBe(s.questStages!.stages.length);
      expect(JSON.stringify(g).length, s.id).toBeLessThan(48 * 1024);
      for (const st of g.stage!.stages) if (st.go !== undefined) expect(g.places[st.go], `${s.id}#${st.at}`).toBeDefined();
    }
  });
});
