import { describe, expect, it } from 'vitest';
import { planOneTrip, tripWindow, LOOK_AHEAD } from '../src/lib/oneTrip';
import { buildPlayerState } from '../src/lib/playerState';
import { buildPrepRoute, emptyPrep, MAX_DETOUR_DEPTH, openTaskIds, parsePrep, reconcile, startDetour, type DetourFrame } from '../src/lib/prepRoute';
import { stepReadiness, type StepReadiness } from '../src/lib/readiness';
import { allSteps } from '../src/data';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { Step } from '../src/types';

const item = (nameEn: string, amount: string | number, extra: Record<string, unknown> = {}) => ({ nameEn, nameRu: nameEn, amount, howToGet: '', ...extra });
const mk = (id: string, items: ReturnType<typeof item>[]): Step => ({ id, stage: 1, type: 'combat', title: id, requires: [], itemsRequired: items } as unknown as Step);

function owned(items: Record<string, Partial<OwnedItem>>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(items)) map.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items: map };
}
const st = (o: OwnedState | null, coins: { bag: number; bank: number | null } | null = null) =>
  buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned: o,
    gear: coins ? { equipment: [], inventory: [], coins: coins.bag, bankCoins: coins.bank } : null, questsDone: null,
  });

describe('одна ходка: окно и резерв', () => {
  const steps = [
    mk('A1', [item('Lobster', 20), item('Hammer', 1)]),
    mk('A2', [item('Lobster', 20), item('Hammer', 1), item('Silk', 1)]),
    mk('A3', [item('Energy potion', 3)]),
    mk('A4', [item('Coins', 2000)]),
    mk('A5', [item('Rope', 1)]),
  ];

  it('окно — текущий шаг и три следующих незакрытых', () => {
    expect(tripWindow(steps, emptyProgress(), 'A1').map((s) => s.id)).toEqual(['A1', 'A2', 'A3', 'A4']);
    const p = { ...emptyProgress(), steps: { A2: 'done' as const } };
    expect(tripWindow(steps, p, 'A1').map((s) => s.id)).toEqual(['A1', 'A3', 'A4', 'A5']);
    expect(tripWindow(steps, emptyProgress(), 'нет')).toEqual([]);
    expect(LOOK_AHEAD).toBe(3);
  });

  it('еда складывается, инструмент берётся один раз, имеющееся закрепляется за ближайшими шагами', () => {
    const plan = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 13 }, Hammer: { carried: 1 } }, true)));
    const lobster = plan.lines.find((l) => l.line.nameEn === 'Lobster')!;
    expect(lobster.line.count).toBe(40);
    expect(lobster.toGet).toBe(27);
    expect(lobster.allocation).toEqual([{ stepId: 'A1', need: 20, covered: 13 }, { stepId: 'A2', need: 20, covered: 0 }]);
    expect(lobster.urgency).toBe('NOW');
    const hammer = plan.lines.find((l) => l.line.nameEn === 'Hammer')!;
    expect(hammer.line.count).toBe(1);
    expect(hammer.status).toBe('HAVE');
  });

  it('позже не значит сейчас: Silk нужен второму шагу — SOON, Energy potion третьему — SOON, не NOW', () => {
    const plan = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 40 }, Hammer: { carried: 1 }, Silk: { carried: 0, bank: 0 }, 'Energy potion': { carried: 0, bank: 0 } }, true)));
    expect(plan.now).toEqual([]);
    expect(plan.soon.map((l) => l.line.nameEn).sort()).toEqual(['Energy potion', 'Silk']);
  });

  it('предмет в банке — BANK («забери»), а не покупка; банк не открывали — UNKNOWN, не «нет»', () => {
    const inBank = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 0, bank: 40 }, Hammer: { carried: 0, bank: 1 } }, true)));
    expect(inBank.lines.find((l) => l.line.nameEn === 'Lobster')).toMatchObject({ status: 'BANK', toGet: 0 });
    const unk = planOneTrip(steps, emptyProgress(), 'A1', st(owned({ Lobster: { carried: 5 } }, false)));
    const l = unk.lines.find((x) => x.line.nameEn === 'Lobster')!;
    expect(l.status).toBe('UNKNOWN');
    expect(l.toGet).toBeNull();
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(null)).lines.every((x) => x.status === 'UNKNOWN')).toBe(true);
    // Неизвестное — не в списках «взять»: просим не искать то, чего не знаем.
    const none = planOneTrip(steps, emptyProgress(), 'A1', st(null));
    expect(none.now).toEqual([]);
    expect(none.unknown.length).toBe(none.lines.length);
  });

  it('монеты: известны сумка и банк — считаем нехватку; не известны — неизвестно', () => {
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(owned({}, true), { bag: 850, bank: 300 })).coins).toEqual({ need: 2000, have: 1150, missing: 850 });
    expect(planOneTrip(steps, emptyProgress(), 'A1', st(owned({}, true), { bag: 850, bank: null })).coins).toEqual({ need: 2000, have: null, missing: null });
  });

  it('на настоящем маршруте окно считается без падений и без дублей строк', () => {
    for (const s of allSteps) {
      const plan = planOneTrip(allSteps, emptyProgress(), s.id, st(null));
      const keys = plan.lines.map((l) => l.line.key);
      expect(new Set(keys).size, s.id).toBe(keys.length);
      for (const l of plan.lines) expect(l.allocation.every((a) => a.covered <= a.need)).toBe(true);
    }
  });
});

describe('маршрут подготовки и объезды', () => {
  const readinessOf = (step: Step, s: ReturnType<typeof st>, stats: Record<string, number> | null = null): StepReadiness =>
    stepReadiness({
      step, steps: [step], progress: emptyProgress(), qp: 0, mode: 'f2p', stats, owned: s.owned,
      gear: null,
    });

  it('готов — подготовки нет; не хватает — главное одно, следом не больше двух, остальное свёрнуто', () => {
    const step = { ...mk('P1', [item('Lobster', 20), item('Hammer', 1), item('Rope', 2)]), requirements: [{ type: 'skill', skill: 'ranged', min: 20 }] } as unknown as Step;
    const ready = buildPrepRoute(readinessOf(step, st(owned({ Lobster: { carried: 20 }, Hammer: { carried: 1 }, Rope: { carried: 2 } }, true)), { ranged: 30 }), step);
    expect(ready.ready).toBe(true);
    expect(ready.primary).toBeNull();
    const need = buildPrepRoute(readinessOf(step, st(owned({ Lobster: { bank: 20 }, Hammer: { carried: 0, bank: 0 }, Rope: { carried: 0, bank: 0 } }, true)), { ranged: 17 }), step);
    expect(need.ready).toBe(false);
    expect(need.primary).not.toBeNull();
    expect(need.next.length).toBeLessThanOrEqual(2);
    expect(need.tasks.map((t) => t.kind)).toEqual(expect.arrayContaining(['bank', 'buy', 'stat']));
    expect(need.returnTo).toBe('P1');
    // Закупка и банк — по одной задаче, а не по строке на предмет.
    expect(need.tasks.filter((t) => t.kind === 'buy')).toHaveLength(1);
    expect(need.tasks.filter((t) => t.kind === 'bank')).toHaveLength(1);
    // Порядок: обязательное по приоритету, уровни после предметов.
    const order = need.tasks.map((t) => t.priority);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('данные пропали (нет связи, перезагрузка) — задача остаётся открытой; готова она только по данным', () => {
    const step = { ...mk('P3', []), requirements: [{ type: 'skill', skill: 'ranged', min: 20 }] } as unknown as Step;
    const open = (stats: Record<string, number> | null) => openTaskIds(readinessOf(step, st(null), stats), step);
    expect(open({ ranged: 17 }).has('stat:ranged 20')).toBe(true);
    expect(open(null).has('stat:ranged 20')).toBe(true);
    expect(open({ ranged: 20 }).has('stat:ranged 20')).toBe(false);
  });

  it('банк не открывали — не просим искать то, чего не знаем: подготовки нет', () => {
    const step = mk('P2', [item('Lobster', 20)]);
    const r = buildPrepRoute(readinessOf(step, st(owned({}, false))), step);
    expect(r.ready).toBe(true);
    expect(r.tasks).toEqual([]);
  });

  const frame = (stepId: string, detourId: string): DetourFrame => ({ sourceStepId: stepId, detourId, reason: 'тест', startedAt: 1, returnCondition: 'готово' });

  it('объезды: возврат к исходному шагу, повтор и цикл запрещены, глубина не больше трёх', () => {
    let s = emptyPrep();
    const a = startDetour(s, frame('S4-05', 'bank'));
    expect(a.ok).toBe(true);
    s = a.state;
    expect(startDetour(s, frame('S4-05', 'bank'))).toMatchObject({ ok: false, reason: 'CYCLE' });
    s = (startDetour(s, frame('S4-05', 'stat:ranged 20')) as { state: typeof s }).state;
    s = (startDetour(s, frame('S4-05', 'buy')) as { state: typeof s }).state;
    expect(s.stack).toHaveLength(MAX_DETOUR_DEPTH);
    expect(startDetour(s, frame('S4-05', 'money'))).toMatchObject({ ok: false, reason: 'DEPTH' });
    // Выполнено верхнее — снимается, возвращаемся к исходному шагу; остальное остаётся.
    const open = (ids: string[]) => () => new Set(ids);
    const r1 = reconcile(s, open(['bank', 'stat:ranged 20']));
    expect(r1.state.stack.map((f) => f.detourId)).toEqual(['bank', 'stat:ranged 20']);
    expect(r1.state.done).toContain('S4-05:buy');
    expect(r1.returnTo).toBe('S4-05');
    // Всё выполнено — стек пуст, возврат к шагу.
    const r2 = reconcile(s, open([]));
    expect(r2.state.stack).toEqual([]);
    expect(r2.returnTo).toBe('S4-05');
    // Выполненное второй раз само не предлагается.
    expect(startDetour(r2.state, frame('S4-05', 'bank'))).toMatchObject({ ok: false, reason: 'DONE_BEFORE' });
    // Готовность шага неизвестна — объезд остаётся.
    expect(reconcile(s, () => null).state.stack).toHaveLength(3);
  });

  it('хранилище: мусор — пустое состояние, а нормальная запись переживает перезапуск', () => {
    expect(parsePrep(null)).toEqual(emptyPrep());
    expect(parsePrep('{{{')).toEqual(emptyPrep());
    expect(parsePrep(JSON.stringify({ stack: [1, null, { x: 1 }], done: [5, 'a'] }))).toEqual({ stack: [], done: ['a'] });
    const s = startDetour(emptyPrep(), frame('S1-01', 'bank')).state;
    expect(parsePrep(JSON.stringify(s))).toEqual(s);
  });
});
