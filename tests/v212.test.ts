import { describe, expect, it } from 'vitest';
import { etaMinutes, etaText, XpTracker } from '../src/lib/xpRate';
import { sessionSummary } from '../src/lib/session';
import { questKey, syncCandidates } from '../src/lib/accountSync';
import { addProfile, defaultProfiles, gateAllows, linkPlayer, MAIN_ID, parseProfiles, profileFileName, profileGate, profileStorageKey, removeProfile, renameProfile } from '../src/lib/profiles';
import { parsePlayer, parsePos, parseQuests, parseXp } from '../src/services/runeliteBridge';
import { emptyProgress } from '../src/lib/progress';
import type { Step } from '../src/types';

describe('XpTracker', () => {
  it('темп считает по приросту, но не раньше чем через полминуты', () => {
    const t = new XpTracker();
    t.push({ woodcutting: 100 }, 0);
    t.push({ woodcutting: 200 }, 10_000);
    expect(t.rate('woodcutting')).toBeNull();
    t.push({ woodcutting: 400 }, 60_000);
    expect(t.rate('woodcutting')).toBe(18_000);
    expect(t.rate('fishing')).toBeNull();
  });
  it('после двух минут без прироста замеры сбрасываются', () => {
    const t = new XpTracker();
    t.push({ mining: 0 }, 0);
    t.push({ mining: 500 }, 60_000);
    t.push({ mining: 500 }, 300_000);
    expect(t.rate('mining')).toBeNull();
  });
  it('меньший опыт (другой персонаж) начинает замеры заново', () => {
    const t = new XpTracker();
    t.push({ attack: 5000 }, 0);
    t.push({ attack: 6000 }, 60_000);
    t.push({ attack: 10 }, 70_000);
    expect(t.rate('attack')).toBeNull();
  });
  it('ожидание: минуты и текст', () => {
    expect(etaMinutes(1000, 600)).toBe(100);
    expect(etaMinutes(0, 600)).toBeNull();
    expect(etaMinutes(10, null)).toBeNull();
    expect(etaText(25)).toBe('≈ 25 мин');
    expect(etaText(80)).toBe('≈ 1 ч 20 мин');
    expect(etaText(120)).toBe('≈ 2 ч');
  });
});

describe('sessionSummary', () => {
  const base = { startedAt: 0, levels0: { attack: 10 }, xp0: { attack: 1000, mining: 50 }, closed0: ['S1-01'] };
  it('считает прирост опыта, уровней и новых шагов', () => {
    const s = sessionSummary(base, 15 * 60_000, { attack: 1300, mining: 50, cooking: 9 }, { attack: 12 }, ['S1-01', 'S1-02']);
    expect(s.minutes).toBe(15);
    expect(s.xpGained).toEqual([{ skill: 'attack', xp: 300, levels: 2 }]);
    expect(s.stepsDone).toBe(1);
  });
  it('без стартового опыта прироста нет', () => {
    expect(sessionSummary({ ...base, xp0: null }, 1000, { attack: 5 }, null, []).xpGained).toEqual([]);
  });
});

describe('accountSync', () => {
  const quest = { id: 'Q1', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: "Cook's Assistant" } } } as unknown as Step;
  const withItems = { id: 'Q2', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Imp Catcher', items: [{ itemId: 1, quantity: 1 }] } } } as unknown as Step;
  const lvl = { id: 'L1', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 5 }] } } } as unknown as Step;
  it('квест и уровни из игры закрывают шаги, шаги с предметами — нет', () => {
    const c = syncCandidates([quest, withItems, lvl], emptyProgress(), ['Cooks Assistant', 'Imp Catcher'], { attack: 5 });
    expect(c.map((x) => x.step.id)).toEqual(['Q1', 'L1']);
  });
  it('уже закрытое и неизвестное не предлагается', () => {
    const p = { ...emptyProgress(), steps: { Q1: 'done' as const } };
    expect(syncCandidates([quest, lvl], p, [], { attack: 4 })).toEqual([]);
    expect(syncCandidates([quest], emptyProgress(), null, null)).toEqual([]);
    expect(questKey("Cook's Assistant")).toBe(questKey('cooks assistant'));
  });
});

describe('профили', () => {
  it('битое — по умолчанию, «Основной» всегда есть, активный из списка', () => {
    expect(parseProfiles('мусор')).toEqual(defaultProfiles());
    const s = parseProfiles(JSON.stringify({ active: 'нет', list: [{ id: 'ab1', name: 'Второй' }, { id: 'ab1', name: 'Дубль' }, { id: '../x', name: 'Плохой' }] }));
    expect(s.list.map((p) => p.id)).toEqual([MAIN_ID, 'ab1']);
    expect(s.active).toBe(MAIN_ID);
  });
  it('ключи и файлы: основной как раньше', () => {
    expect(profileStorageKey('osrs-put:progress', MAIN_ID)).toBe('osrs-put:progress');
    expect(profileStorageKey('osrs-put:progress', 'ab1')).toBe('osrs-put:progress:p:ab1');
    expect(profileFileName(MAIN_ID)).toBe('progress.json');
    expect(profileFileName('ab1')).toBe('progress-ab1.json');
  });
  it('создание, переименование, удаление', () => {
    const r = addProfile(defaultProfiles(), ' Второй <b> ', 'Alt One')!;
    expect(r.state.list[1]).toMatchObject({ name: 'Второй b', player: 'Alt One' });
    expect(renameProfile(r.state, r.id, '  ').list[1].name).toBe('Второй b');
    expect(removeProfile({ ...r.state, active: r.id }, r.id).active).toBe(MAIN_ID);
    expect(removeProfile(r.state, MAIN_ID)).toBe(r.state);
  });
  it('шлюз: неизвестно, привязка, свой, чужой, другой профиль', () => {
    const s0 = defaultProfiles();
    expect(profileGate(s0, null).kind).toBe('unknown');
    expect(profileGate(s0, 'Alpha').kind).toBe('link');
    const s1 = linkPlayer(s0, MAIN_ID, 'Alpha');
    expect(profileGate(s1, 'alpha').kind).toBe('ok');
    expect(profileGate(s1, 'Beta').kind).toBe('new');
    const s2 = addProfile(s1, 'Бета', 'Beta')!.state;
    const g = profileGate(s2, 'Beta');
    expect(g.kind).toBe('switch');
    expect([profileGate(s1, 'Beta'), g].map(gateAllows)).toEqual([false, false]);
    expect([profileGate(s0, null), profileGate(s1, 'Alpha'), profileGate(s0, 'A')].every(gateAllows)).toBe(true);
  });
});

describe('разбор данных плагина 2.12', () => {
  it('опыт, квесты, имя, позиция — только в границах', () => {
    expect(parseXp({ attack: 5, 'bad key': 3, mining: -1, magic: 1.5, fishing: 300_000_000 })).toEqual({ attack: 5 });
    expect(parseXp(null)).toBeNull();
    expect(parseQuests(['Rune Mysteries', 5, ''])).toEqual(['Rune Mysteries']);
    expect(parseQuests('x')).toBeNull();
    expect(parsePlayer('Mark One')).toBe('Mark One');
    expect(parsePlayer('Mark One')).toBe('Mark One');
    expect(parsePlayer('<script>')).toBeNull();
    expect(parsePlayer('toolongnamehere')).toBeNull();
    expect(parsePos({ x: 3200, y: 3200, plane: 0 })).toEqual({ x: 3200, y: 3200, plane: 0 });
    expect(parsePos({ x: 3200, y: 3200, plane: 9 })).toBeNull();
  });
});
