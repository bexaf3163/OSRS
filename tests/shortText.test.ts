import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { shortLine, SHORT_MAX } from '../src/lib/shortText';
import { stagePayload, stepGuide } from '../src/services/runeliteBridge';
import raw from '../src/data/questStages.json';

const quests = (raw as unknown as { quests: Record<string, import('../src/types').QuestStages> }).quests;

describe('короткий текст для игры', () => {
  it('«Диалог: …» отбрасывается, берётся первое предложение', () => {
    expect(shortLine('Поговори с Reldo в библиотеке дворца Varrock. Диалог: «What do you know about the Imcando dwarves?».')).toBe('Поговори с Reldo в библиотеке дворца Varrock');
    expect(shortLine('Возьми Egg на ферме севернее Lumbridge. Яйцо лежит у курятника, их там много.')).toBe('Возьми Egg на ферме севернее Lumbridge');
  });

  it('короткое не меняется, точка в конце убирается', () => {
    expect(shortLine('Дёрни Hopper controls.')).toBe('Дёрни Hopper controls');
    expect(shortLine('Иди')).toBe('Иди');
  });

  it('длинное режется по тире, запятой, потом по слову с многоточием — и не длиннее предела', () => {
    expect(shortLine('Поговори с Thurgo у его дома южнее Port Sarim — он ждёт тебя там уже давно и всё расскажет подробно')).toBe('Поговори с Thurgo у его дома южнее Port Sarim');
    expect(shortLine('Поднимись на второй этаж замка Falador, потом иди на запад и ищи нужный шкаф в дальней комнате')).toBe('Поднимись на второй этаж замка Falador');
    const byWord = shortLine('слово '.repeat(40));
    expect(byWord.endsWith('…')).toBe(true);
    for (const s of ['а'.repeat(300), 'слово '.repeat(80), 'x']) expect(shortLine(s).length).toBeLessThanOrEqual(SHORT_MAX);
  });

  it('у каждого шага каждого этапа есть готовый короткий текст: одна строка, без диалога и ссылок на «панель справа»', () => {
    let n = 0;
    for (const [id, q] of Object.entries(quests)) {
      for (const st of q.stages) {
        for (const l of st.do) {
          n++;
          expect(l.s, `${id}#${st.at}: ${l.t.slice(0, 40)}`).toBeTruthy();
          expect(l.s!.length, `${id}: ${l.s}`).toBeLessThanOrEqual(72);
          expect(l.s, `${id}: ${l.s}`).not.toMatch(/Диалог|панел/);
          // Английское название предмета, как в игре, бывает чуть длиннее русского слова («нож» → Knife), но не заметно.
          expect(l.s!.length, `${id}: короткий не должен быть длиннее полного`).toBeLessThanOrEqual(l.t.length + 8);
        }
      }
    }
    expect(n).toBeGreaterThan(600);
  });

  it('шаг, одинаковый в разных этапах, называется одинаково', () => {
    const seen = new Map<string, string>();
    for (const q of Object.values(quests)) for (const st of q.stages) for (const l of st.do) {
      const was = seen.get(l.t);
      if (was !== undefined) expect(l.s).toBe(was);
      else seen.set(l.t, l.s!);
    }
  });

  it('в игру уходит короткий текст рядом с полным; точки и условия на месте', () => {
    const step = allSteps.find((s) => s.id === 'S2-07')!;
    const g = stepGuide(step);
    const stages = g.stage!.stages;
    const last = stages[stages.length - 1].steps;
    const ore = last.find((l) => l.t.startsWith('Накопай'))!;
    expect(ore.s).toBe('Накопай Blurite ore в восточной пещере');
    expect(ore.t.length).toBeGreaterThan(ore.s!.length);
    expect(ore.has).toBe('Blurite ore');
    const back = last.find((l) => l.need === 'Blurite ore')!;
    expect(back.s).toBe('Верни Thurgo Blurite ore и 2 Iron bar');
    expect(back.x).toBeGreaterThan(0);
  });

  it('нет s в данных — шлётся сокращение полного текста, не пустота', () => {
    const step = allSteps.find((s) => s.id === 'S2-07')!;
    const long = 'Поговори с Thurgo у его дома южнее Port Sarim. Диалог: «Hello».';
    const patched = { ...step, questStages: { ...step.questStages!, stages: [{ at: 0, do: [{ t: long }] }] } };
    const p = stagePayload(patched, []);
    expect(p!.stages[0].steps[0].s).toBe('Поговори с Thurgo у его дома южнее Port Sarim');
  });
});
