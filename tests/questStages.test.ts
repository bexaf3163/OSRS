import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { stepGuide } from '../src/services/runeliteBridge';
import raw from '../src/data/questStages.json';

const quests = (raw as unknown as { quests: Record<string, import('../src/types').QuestStages> }).quests;
const withStages = allSteps.filter((s) => s.questStages);

describe('этапы квестов (Quest Helper)', () => {
  it('у каждого квеста с этапами есть шаг в маршруте, переменная и этапы по возрастанию', () => {
    expect(Object.keys(quests).length).toBeGreaterThanOrEqual(30);
    for (const [id, q] of Object.entries(quests)) {
      expect(allSteps.some((s) => s.id === id), id).toBe(true);
      expect(['varp', 'varbit']).toContain(q.var[0]);
      expect(q.var[1]).toBeGreaterThan(0);
      const ats = q.stages.map((s) => s.at);
      expect(ats, id).toEqual([...ats].sort((a, b) => a - b));
      expect(new Set(ats).size, id).toBe(ats.length);
      expect(ats[0], `${id}: первый этап должен быть с нуля`).toBe(0);
    }
  });

  it('пределы плагина: этапов ≤ 40, шагов в этапе ≤ 40, текст ≤ 500 знаков, координаты в пределах карты', () => {
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

  it('нет английских остатков шаблонов Quest Helper: каждый шаг маршрута написан по-русски', () => {
    for (const [id, q] of Object.entries(quests)) {
      for (const p of q.route ?? []) {
        expect(p.title.trim().length, id).toBeGreaterThan(0);
        for (const t of p.steps) expect(/[А-Яа-яЁё]/.test(t), `${id}: ${t.slice(0, 50)}`).toBe(true);
      }
    }
  });

  it('«Прохождение» шага — это маршрут Quest Helper целиком, а не старый короткий список', () => {
    for (const s of withStages) {
      const flat = (s.questStages!.route ?? []).flatMap((p) => p.steps);
      if (flat.length) expect(s.quickSteps, s.id).toEqual(flat);
    }
  });

  it('Knight’s Sword: между «Imcando» и «картиной» есть разговор со Squire и подъём по лестнице', () => {
    const route = (quests['S2-07'].route ?? []).flatMap((p) => p.steps).join('\n');
    expect(route).toMatch(/Squire/);
    expect(route).toMatch(/лестниц/);
    expect(route.indexOf('Squire')).toBeLessThan(route.indexOf('Thurgo', route.indexOf('Squire')));
  });

  it('полезная нагрузка для плагина укладывается в лимит тела запроса и содержит этапы', () => {
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
