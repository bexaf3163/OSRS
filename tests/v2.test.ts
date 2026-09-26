import { describe, expect, it, vi } from 'vitest';
import {
  allQuests, allStages, allSteps, items, itemById, maxQpFor, membersSkills, stagesFor, stepsFor,
} from '../src/data';
import { deriveQuests } from '../src/lib/quests';
import { titleTargets } from '../src/lib/targets';
import { createPriceService, PRICE_TTL_MS } from '../src/services/pricesApi';
import { cleanWikiText } from '../src/services/wikiApi';
import { stepText } from '../src/lib/search';
import { clampScale, stepScale, TEXT_STEPS, ZOOM_STEPS } from '../src/lib/ui-scale';

describe('режим игры', () => {
  it('F2P — этапы 1–6 без шагов подписки', () => {
    expect(stagesFor('f2p').map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stepsFor('f2p').some((s) => s.membersOnly)).toBe(false);
  });

  it('Members добавляет этапы 7–9 и ничего больше', () => {
    expect(stagesFor('members').map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(allStages.filter((s) => s.membersOnly).map((s) => s.id)).toEqual([7, 8, 9]);
    const extra = stepsFor('members').filter((s) => !stepsFor('f2p').includes(s));
    expect(extra.every((s) => s.membersOnly && s.stage >= 7)).toBe(true);
  });

  it('шаги подписки не зависят от чего-то вне Members, F2P-шаги — от шагов подписки', () => {
    const f2pIds = new Set(stepsFor('f2p').map((s) => s.id));
    for (const s of stepsFor('f2p')) for (const r of s.requires) expect(f2pIds.has(r), `${s.id} → ${r}`).toBe(true);
  });

  it('альтернатива для подписчиков — только у шагов F2P', () => {
    for (const s of allSteps.filter((x) => x.membersAlternative)) expect(s.membersOnly).toBeFalsy();
  });

  it('восемь навыков подписки с английским названием и вики', () => {
    expect(membersSkills).toHaveLength(8);
    for (const m of membersSkills) expect(m.wiki).toBe(`https://oldschool.runescape.wiki/w/${m.nameEn}`);
  });
});

describe('квесты из маршрута', () => {
  it('Dragon Slayer I — одна запись из шагов S5-01…S5-09', () => {
    const ds = allQuests.find((q) => q.stepId === 'S5-09')!;
    expect(ds.title).toBe('Dragon Slayer I');
    expect(ds.qp).toBe(2);
    expect(ds.parts).toEqual(['S5-01', 'S5-03', 'S5-04', 'S5-05', 'S5-06', 'S5-07', 'S5-08', 'S5-09']);
  });

  it('сумма очков квестов совпадает с маршрутом в обоих режимах', () => {
    const f2p = allQuests.filter((q) => !q.membersOnly).reduce((s, q) => s + q.qp, 1);
    expect(f2p).toBe(maxQpFor('f2p'));
    expect(allQuests.reduce((s, q) => s + q.qp, 1)).toBe(maxQpFor('members'));
  });

  it('каждый шаг-квест попадает ровно в одну запись', () => {
    const questSteps = allSteps.filter((s) => s.type === 'quest').map((s) => s.id);
    const covered = allQuests.flatMap((q) => (q.parts.length ? q.parts : [q.stepId]));
    expect([...covered].sort()).toEqual([...questSteps].sort());
  });

  it('вступление без очков со своим квестом — отдельная запись', () => {
    const quests = deriveQuests(allSteps);
    const intro = quests.find((q) => q.stepId === 'S8-04')!;
    expect(intro.qp).toBe(0);
    expect(intro.parts).toEqual([]);
  });
});

describe('цели из названий шагов', () => {
  it('число после «до» достаётся всем навыкам перед ним', () => {
    expect(titleTargets('Рыбалка и готовка до 30 уровня')).toEqual([{ skill: 'fishing', level: 30 }, { skill: 'cooking', level: 30 }]);
    expect(titleTargets('Бой до 40 / 40 / 40')).toEqual([
      { skill: 'attack', level: 40 }, { skill: 'strength', level: 40 }, { skill: 'defence', level: 40 },
    ]);
    expect(titleTargets('Ловкость (Agility) до 40 уровня')).toEqual([{ skill: 'agility', level: 40 }]);
  });

  it('у каждого шага прокачки есть цель', () => {
    for (const s of allSteps.filter((x) => x.type === 'skill')) expect(s.targets?.length, s.id).toBeGreaterThan(0);
  });
});

describe('цены биржи', () => {
  const latest = { data: { '1540': { high: 9000, highTime: 1_790_000_000, low: 8500, lowTime: 1_790_000_100 } } };
  const fetchFn = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => latest }));

  it('один запрос на все предметы, дальше кэш на 5 минут', async () => {
    let t = 0;
    const f = fetchFn();
    const svc = createPriceService(f, () => t);
    const p = await svc.getGePrice(1540);
    expect(p).toEqual({ buyPrice: 9000, sellPrice: 8500, updatedAt: new Date(1_790_000_100 * 1000).toISOString() });
    await svc.getGePrice(1540);
    t = PRICE_TTL_MS - 1;
    await svc.getGePrice(999);
    expect(f).toHaveBeenCalledTimes(1);
    t = PRICE_TTL_MS + 1;
    await svc.getGePrice(1540);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('одновременные запросы не дублируются', async () => {
    const f = fetchFn();
    const svc = createPriceService(f, () => 0);
    await Promise.all([svc.getGePrice(1540), svc.getGePrice(1540), svc.getGePrice(1)]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('неторгуемый предмет — null, ошибка сети — отказ без порчи кэша', async () => {
    const svc = createPriceService(fetchFn(), () => 0);
    expect(await svc.getGePrice(42)).toBeNull();
    const down = createPriceService(async () => ({ ok: false, status: 503, json: async () => ({}) }), () => 0);
    await expect(down.getGePrice(1540)).rejects.toThrow('503');
  });
});

describe('база предметов', () => {
  it('120+ предметов, у каждого иконка и статья вики', () => {
    expect(items.length).toBeGreaterThanOrEqual(120);
    for (const i of items) {
      expect(i.iconUrl, i.nameEn).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/images\//);
      expect(i.wikiUrl, i.nameEn).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/w\//);
    }
  });

  it('предметы шагов ссылаются на базу, иконки совпадают', () => {
    for (const s of allSteps) {
      for (const it of [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])]) {
        const db = itemById.get(it.wikiItemId!);
        expect(db, `${s.id}: ${it.nameEn}`).toBeDefined();
        expect(it.iconUrl).toBe(db!.iconUrl);
      }
    }
  });

  it('разметка вики превращается в текст', () => {
    expect(cleanWikiText("[[Lumbridge Castle|the castle]] '''kitchen'''")).toBe('the castle kitchen');
  });
});

describe('текст шага для поиска', () => {
  it('включает NPC, предметы и «Готово, когда»', () => {
    const s = allSteps.find((x) => x.id === 'S2-02')!;
    const text = stepText(s);
    expect(text).toContain(s.npc!.nameEn);
    expect(text).toContain(s.doneWhen.slice(0, 20));
  });
});

describe('масштаб', () => {
  it('шаги вверх и вниз с упором в края', () => {
    expect(stepScale(ZOOM_STEPS, 1, 1)).toBe(1.1);
    expect(stepScale(ZOOM_STEPS, 1, -1)).toBe(0.9);
    expect(stepScale(ZOOM_STEPS, 2, 1)).toBe(2);
    expect(stepScale(TEXT_STEPS, 0.9, -1)).toBe(0.9);
    // Значение между шагами прилипает к соседнему.
    expect(stepScale(ZOOM_STEPS, 1.17, 1)).toBe(1.25);
    expect(stepScale(ZOOM_STEPS, 1.17, -1)).toBe(1.1);
  });

  it('мусор из хранилища не ломает масштаб', () => {
    expect(clampScale(TEXT_STEPS, Number('abc'))).toBe(1);
    expect(clampScale(TEXT_STEPS, 7)).toBe(1.5);
  });
});
