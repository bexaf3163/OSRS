import { describe, expect, it } from 'vitest';
import { adviseTraining, formatHours, methodsFor, trainingMethods, viewMethod, type AdviceInput } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { xpForLevel } from '../src/lib/xp';
import { allLevelSkills } from '../src/data';

const levels = (l: Record<string, number> | null, owned: Record<string, { carried?: number; bank?: number }> | null = null, bankSeen = false) =>
  buildPlayerState({
    mode: 'members', stats: l, progress: emptyProgress(), gear: null, questsDone: null,
    owned: owned ? { bankSeen, items: new Map(Object.entries(owned).map(([n, v]) => [n.toLowerCase(), { name: n, carried: v.carried ?? 0, noted: 0, ...(v.bank !== undefined ? { bank: v.bank } : {}) }])) } : null,
  });
const advise = (over: Partial<AdviceInput> & Pick<AdviceInput, 'skill' | 'target'>) =>
  adviseTraining({ state: levels({ [over.skill]: 1 }), mode: 'members', style: 'chill', ...over });

describe('данные способов', () => {
  it('идентификаторы уникальны, диапазоны и скорости осмысленны, навыки существуют', () => {
    const ids = new Set<string>();
    const known = new Set(allLevelSkills.map((l) => l.id));
    for (const m of trainingMethods) {
      expect(ids.has(m.id), `повтор ${m.id}`).toBe(false);
      ids.add(m.id);
      expect(m.from, m.id).toBeGreaterThanOrEqual(1);
      if (m.to !== null) expect(m.to, m.id).toBeGreaterThan(m.from);
      if (m.xph) { expect(m.xph[0], m.id).toBeGreaterThan(0); expect(m.xph[1], m.id).toBeGreaterThanOrEqual(m.xph[0]); }
      if (m.xpa !== null) expect(m.xpa, m.id).toBeGreaterThan(0);
      for (const s of m.skills) expect(known.has(s), `${m.id}: навык ${s}`).toBe(true);
      expect(m.url, m.id).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/w\//);
      expect(m.where.length, m.id).toBeGreaterThan(2);
    }
  });

  it('точные значения игры: опыт за действие для известных способов', () => {
    const xpa = (id: string) => trainingMethods.find((m) => m.id === id)!.xpa;
    expect(xpa('wc-tree')).toBe(25);
    expect(xpa('wc-oak')).toBe(37.5);
    expect(xpa('wc-willow')).toBe(67.5);
    expect(xpa('ck-trout')).toBe(70);
    expect(xpa('fm-yew')).toBe(202.5);
  });
});

describe('выбор способа', () => {
  it('подходит по уровню и режиму: на 22 уровне рубки — дубы, а не ивы', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 22 }), mode: 'f2p' });
    expect(a.best?.method.id).toBe('wc-oak');
    expect(a.best?.method.members).toBe(false);
  });

  it('F2P не получает способов для подписки', () => {
    const a = advise({ skill: 'agility', target: 20, state: levels({ agility: 5 }), mode: 'f2p' });
    expect(a.best).toBeNull();
    expect(advise({ skill: 'agility', target: 20, state: levels({ agility: 5 }), mode: 'members' }).best?.method.id).toBe('ag-gnome');
  });

  it('уровень неизвестен — не советуем наугад', () => {
    const a = adviseTraining({ skill: 'fishing', target: 40, state: levels(null), mode: 'members', style: 'chill' });
    expect(a.level).toBeNull();
    expect(a.best).toBeNull();
    expect(a.reason).toContain('Уровень неизвестен');
  });

  it('цель достигнута — «качать не нужно»', () => {
    const a = advise({ skill: 'fishing', target: 20, state: levels({ fishing: 25 }) });
    expect(a.best).toBeNull();
    expect(a.reason).toContain('достигнута');
  });

  it('спокойный стиль выбирает без кликов, эффективный — быстрее', () => {
    const state = levels({ magic: 25 });
    const chill = advise({ skill: 'magic', target: 40, state, mode: 'f2p', style: 'chill' });
    const fast = advise({ skill: 'magic', target: 40, state, mode: 'f2p', style: 'efficient' });
    expect(chill.best?.method.id).toBe('ma-splash');
    expect(chill.best?.method.effort).toBe('afk');
    expect(fast.best?.method.id).toBe('ma-alch');
    expect(fast.best?.method.xph?.[0]).toBeGreaterThan(chill.best?.method.xph?.[0] ?? 0);
    expect(chill.reason).toContain('без риска');
    expect(fast.reason).toContain('опыта в час');
  });

  it('при равной скорости спокойный берёт тихий способ, эффективный — более поздний вход', () => {
    const state = levels({ mining: 35 });
    expect(advise({ skill: 'mining', target: 45, state, style: 'chill' }).best?.method.id).toBe('mi-motherlode');
  });

  it('предмета нет — способ остаётся, но называет, что взять; предмет есть — готов', () => {
    const none = advise({ skill: 'fishing', target: 40, state: levels({ fishing: 25 }, { 'Fly fishing rod': { carried: 0, bank: 0 }, Feather: { carried: 0, bank: 0 } }, true) });
    expect(none.best?.method.id).toBe('fi-fly');
    expect(none.best?.status).toBe('PREP');
    expect(none.best?.missing.map((m) => m.label).join(' ')).toContain('Fly fishing rod');
    const have = advise({ skill: 'fishing', target: 40, state: levels({ fishing: 25 }, { 'Fly fishing rod': { carried: 1 }, Feather: { carried: 600 } }, true) });
    expect(have.best?.status).toBe('READY');
  });

  it('не проверено — не «нет»: способ готов, непроверенное отдельно', () => {
    const a = advise({ skill: 'fishing', target: 40, state: levels({ fishing: 25 }) });
    expect(a.best?.status).toBe('READY');
    expect(a.best?.unchecked.length).toBeGreaterThan(0);
  });

  it('любой топор подходит: у игрока Iron axe — «топор» не просим', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 20 }, { 'Iron axe': { carried: 1 } }, true), mode: 'f2p' });
    expect(a.best?.status).toBe('READY');
    const none = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 20 }, { 'Iron axe': { carried: 0, bank: 0 }, 'Bronze axe': { carried: 0, bank: 0 }, 'Steel axe': { carried: 0, bank: 0 } }, true), mode: 'f2p' });
    expect(none.best?.status).toBe('PREP');
    expect(none.best?.missing[0].label).toBe('Топор');
  });

  it('квест, которого нет, закрывает способ: Monkfish без Swan Song — не лучший', () => {
    const state = buildPlayerState({ mode: 'members', stats: { fishing: 70 }, progress: emptyProgress(), gear: null, owned: null, questsDone: ['Cook\'s Assistant'] });
    const m = trainingMethods.find((x) => x.id === 'fi-monk')!;
    expect(viewMethod(m, state).status).toBe('LOCKED');
    const a = adviseTraining({ skill: 'fishing', target: 80, state, mode: 'members', style: 'efficient' });
    expect(a.best?.method.id).not.toBe('fi-monk');
    const done = buildPlayerState({ mode: 'members', stats: { fishing: 70 }, progress: emptyProgress(), gear: null, owned: null, questsDone: ['Swan Song'] });
    expect(viewMethod(m, done).status).not.toBe('LOCKED');
  });

  it('бой: способ качает все три навыка', () => {
    expect(methodsFor('strength').some((m) => m.id === 'me-cow')).toBe(true);
    expect(methodsFor('defence').some((m) => m.id === 'me-cow')).toBe(true);
  });
});

describe('путь, действия и время', () => {
  it('путь делится по способам и охватывает весь отрезок без дыр', () => {
    const a = advise({ skill: 'woodcutting', target: 60, state: levels({ woodcutting: 1 }), mode: 'f2p' });
    expect(a.path[0].fromLevel).toBe(1);
    expect(a.path[a.path.length - 1].toLevel).toBe(60);
    for (let i = 1; i < a.path.length; i++) expect(a.path[i].fromLevel).toBe(a.path[i - 1].toLevel);
    expect(a.path.map((l) => l.method.id)).toEqual(['wc-tree', 'wc-oak', 'wc-willow']);
  });

  it('«сколько ещё действий» — по точному опыту за действие', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 15 }), mode: 'f2p' });
    expect(a.best?.method.id).toBe('wc-oak');
    expect(a.actionsLeft).toBe(Math.ceil((xpForLevel(30) - xpForLevel(15)) / 37.5));
    // Если опыт известен точно, считаем от него.
    const b = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 15 }), mode: 'f2p', xp: xpForLevel(15) + 1000 });
    expect(b.actionsLeft).toBe(Math.ceil((xpForLevel(30) - xpForLevel(15) - 1000) / 37.5));
  });

  it('время: по замерам игрока точно; без замеров — диапазон «по вики»; нет скорости — нет времени', () => {
    const state = levels({ woodcutting: 30 });
    const measured = advise({ skill: 'woodcutting', target: 40, state, mode: 'f2p', measuredXph: 20_000 });
    expect(measured.time?.source).toBe('measured');
    expect(measured.time?.minHours).toBeCloseTo((xpForLevel(40) - xpForLevel(30)) / 20_000);
    const wiki = advise({ skill: 'woodcutting', target: 40, state, mode: 'f2p' });
    expect(wiki.time?.source).toBe('wiki');
    expect(wiki.time!.minHours).toBeLessThan(wiki.time!.maxHours);
    expect(formatHours(wiki.time!)).toMatch(/^примерно/);
    expect(formatHours(measured.time!)).toMatch(/^≈/);
    const none = advise({ skill: 'firemaking', target: 20, state: levels({ firemaking: 15 }), mode: 'f2p' });
    expect(none.time).toBeNull();
    expect(none.actionsLeft).not.toBeNull();
  });

  it('одноразовые квесты — отдельно от способов', () => {
    const a = advise({ skill: 'prayer', target: 9, state: levels({ prayer: 1 }), mode: 'f2p' });
    expect(a.quests.map((q) => q.id)).toContain('pr-ghost');
    expect(a.best?.method.kind).toBe('method');
  });
});
