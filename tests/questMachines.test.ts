import { describe, expect, it } from 'vitest';
import machinesRaw from '../src/data/questMachines.json';
import stagesRaw from '../src/data/questStages.json';
import qhSteps from './fixtures/qh-steps.json';
import type { QuestStages } from '../src/types';

/**
 * Машины состояний Quest Helper (src/data/questMachines.json) и ключи строк этапов (k).
 * Машина выбирает лист — шаг Quest Helper; плагин находит строку списка с тем же ключом k. Эти проверки держат данные целыми:
 * ссылки не повисают, у каждой строки есть ключ, а клетка и подсветка строки совпадают с шагом Quest Helper.
 */
interface Req { o: string; a?: unknown[]; ids?: number[]; m?: string[]; z?: number[][]; id?: number; g?: number; c?: number; [k: string]: unknown }
interface Node { n?: string; c?: [unknown, unknown][]; d?: unknown; s?: string; l?: unknown }
interface Machine { stages: Record<string, unknown>; nodes: Record<string, Node>; reqs: Record<string, Req>; alias?: Record<string, string[]> }

const file = machinesRaw as unknown as { v: number; quests: Record<string, Machine> };
const machines = file.quests;
const quests = (stagesRaw as unknown as { quests: Record<string, QuestStages> }).quests;
const KNOWN_OPS = new Set(['and', 'or', 'nor', 'nand', 'count', 'true', 'item', 'zone', 'vb', 'vp', 'chat', 'mes', 'dlg', 'wt', 'npc', 'obj', 'skill', 'quest', '?']);

const nodeOf = (m: Machine, ref: unknown): Node => (typeof ref === 'string' ? m.nodes[ref] : (ref as Node));
const reqOf = (m: Machine, ref: unknown): Req => (typeof ref === 'string' ? m.reqs[ref] : (ref as Req));

/** Листья (шаги Quest Helper), которые машина может выбрать для значения переменной, — с путём вложенных условных шагов. */
function leaves(m: Machine, ref: unknown, path: string[], out: string[][], depth = 0): void {
  expect(depth, 'машина глубже 40 уровней — цикл?').toBeLessThan(40);
  const n = nodeOf(m, ref);
  const here = n.n ? [...path, n.n] : path;
  if (n.s !== undefined) {
    out.push([...here, n.s]);
    return;
  }
  for (const [, child] of n.c ?? []) leaves(m, child, here, out, depth + 1);
  leaves(m, n.d, here, out, depth + 1);
}

/** Имена, под которыми лист ищут среди ключей строк: он сам, вложенные условные шаги вокруг него и родители из addSubSteps. */
function namesOf(m: Machine, path: string[]): string[] {
  const out: string[] = [];
  for (const name of [...path].reverse()) out.push(name, ...(m.alias?.[name] ?? []));
  return out;
}

/** Какой этап покажет плагин для значения переменной (как ActiveTarget.Stage.indexFor). */
function stageFor(q: QuestStages, v: number): number {
  let idx = 0;
  q.stages.forEach((s, i) => {
    if (s.at <= v) idx = i;
  });
  return idx;
}

function eachReq(m: Machine, visit: (r: Req) => void): void {
  const seen = new Set<unknown>();
  const walk = (ref: unknown): void => {
    if (ref === undefined || ref === null) return;
    const r = reqOf(m, ref);
    expect(r, `условие ${JSON.stringify(ref).slice(0, 60)} не найдено`).toBeTruthy();
    if (seen.has(r)) return;
    seen.add(r);
    visit(r);
    for (const a of r.a ?? []) walk(a);
  };
  for (const n of Object.values(m.nodes)) {
    for (const [cond] of n.c ?? []) walk(cond);
    walk(n.l);
  }
}

describe('машины состояний Quest Helper', () => {
  it('файл версии 1, машины у всех квестов, которых ведёт Quest Helper', () => {
    expect(file.v).toBe(1);
    expect(Object.keys(machines).length).toBeGreaterThanOrEqual(30);
    for (const id of Object.keys(machines)) expect(quests[id], `у ${id} нет этапов в questStages.json`).toBeTruthy();
  });

  it('ссылки не повисают: узлы, условия, значения переменных; циклов нет', () => {
    for (const [id, m] of Object.entries(machines)) {
      expect(Object.keys(m.stages).length, id).toBeGreaterThan(0);
      for (const [value, root] of Object.entries(m.stages)) {
        expect(Number.isInteger(Number(value)), `${id}: значение переменной «${value}»`).toBe(true);
        const out: string[][] = [];
        leaves(m, root, [], out);
        expect(out.length, `${id}#${value}: у этапа нет листьев`).toBeGreaterThan(0);
      }
      for (const [key, n] of Object.entries(m.nodes)) {
        expect(n, `${id}: узел ${key}`).toBeTruthy();
        expect(n.d, `${id}: у узла ${key} нет шага по умолчанию`).toBeDefined();
        for (const [cond, child] of n.c ?? []) {
          expect(reqOf(m, cond), `${id}: условие узла ${key}`).toBeTruthy();
          expect(nodeOf(m, child), `${id}: потомок узла ${key}`).toBeTruthy();
        }
      }
    }
  });

  it('операции условий известны плагину и заполнены', () => {
    const used = new Map<string, number>();
    for (const [id, m] of Object.entries(machines)) {
      eachReq(m, (r) => {
        used.set(r.o, (used.get(r.o) ?? 0) + 1);
        expect(KNOWN_OPS.has(r.o), `${id}: неизвестная операция «${r.o}»`).toBe(true);
        if (r.o === 'item') expect(r.ids?.length ?? 0, `${id}: предмет без id`).toBeGreaterThan(0);
        if (r.o === 'zone') {
          expect(r.z?.length ?? 0, `${id}: зона без прямоугольников`).toBeGreaterThan(0);
          for (const z of r.z ?? []) {
            expect(z.length, `${id}: зона ${JSON.stringify(z)}`).toBe(6);
            expect(z[0]).toBeLessThanOrEqual(z[2]);
            expect(z[1]).toBeLessThanOrEqual(z[3]);
            expect(z[4]).toBeLessThanOrEqual(z[5]);
          }
        }
        if (['chat', 'mes', 'dlg', 'wt'].includes(r.o)) expect(r.m?.length ?? 0, `${id}: ${r.o} без текста`).toBeGreaterThan(0);
        if (['and', 'or', 'nor', 'nand', 'count'].includes(r.o)) expect(r.a?.length ?? 0, `${id}: ${r.o} без условий`).toBeGreaterThan(0);
        if (r.o === 'vb' || r.o === 'vp') expect(Number.isInteger(r.id), `${id}: переменная без id`).toBe(true);
      });
    }
    // Условия, которых плагин не может проверить, — «не знаю»; их мало, иначе машина почти никогда не решала бы.
    const unknown = used.get('?') ?? 0;
    const all = [...used.values()].reduce((a, b) => a + b, 0);
    expect(unknown / all, `«не знаю» в ${unknown} из ${all} условий`).toBeLessThan(0.05);
  });

  it('у каждой строки этапа есть ключ шага Quest Helper; в этапе он не повторяется', () => {
    let lines = 0;
    for (const [id, q] of Object.entries(quests)) {
      for (const st of q.stages) {
        const keys = new Set<string>();
        for (const l of st.do) {
          lines++;
          const k = (l as { k?: string }).k;
          expect(k, `${id}#${st.at}: нет ключа у «${l.s ?? l.t.slice(0, 40)}»`).toBeTruthy();
          expect(k, `${id}#${st.at}: ключ «${k}»`).toMatch(/^[A-Za-z0-9_.]{1,80}$/);
          expect(keys.has(k as string), `${id}#${st.at}: ключ «${k}» повторяется`).toBe(false);
          keys.add(k as string);
        }
      }
    }
    expect(lines).toBeGreaterThanOrEqual(640);
  });

  it('для значения переменной машина доходит до строки этапа: недостижимых строк не больше, чем было', () => {
    // Строка, на которую не указывает ни один лист, машиной не выбирается — её ведут место и предметы. Таких пока 45 из 1016
    // (переходы без условий, шаги «собери предмет» без своего листа); растить число нельзя.
    let total = 0;
    const unreachable: string[] = [];
    for (const [id, m] of Object.entries(machines)) {
      const q = quests[id];
      for (const value of Object.keys(m.stages).map(Number)) {
        const lines = q.stages[stageFor(q, value)].do as { k?: string }[];
        const out: string[][] = [];
        leaves(m, m.stages[String(value)], [], out);
        const reachable = new Set(out.flatMap((p) => namesOf(m, p)));
        for (const l of lines) {
          total++;
          if (!reachable.has(l.k as string)) unreachable.push(`${id}@${value}:${l.k}`);
        }
      }
    }
    expect(total).toBeGreaterThan(900);
    expect(unreachable.length, unreachable.join(', ')).toBeLessThanOrEqual(45);
  });

  it('листья машины без строки в этапе (шаги Quest Helper, которых нет в списке): не больше, чем было', () => {
    const gaps = new Set<string>();
    for (const [id, m] of Object.entries(machines)) {
      const q = quests[id];
      for (const value of Object.keys(m.stages).map(Number)) {
        const keys = new Set((q.stages[stageFor(q, value)].do as { k?: string }[]).map((l) => l.k));
        const out: string[][] = [];
        leaves(m, m.stages[String(value)], [], out);
        for (const p of out) if (!namesOf(m, p).some((n) => keys.has(n))) gaps.add(`${id}:${p[p.length - 1]}`);
      }
    }
    // Известные дыры (30): объезды по лестницам и подвальные шаги вторичных веток; новые дыры появляться не должны.
    expect(gaps.size, [...gaps].join(', ')).toBeLessThanOrEqual(30);
  });

  it('клетка и подсветка строки совпадают с шагом Quest Helper (из его исходников)', () => {
    const ref = (qhSteps as unknown as { steps: Record<string, Record<string, { typ: string; wp: number[]; id?: number }>> }).steps;
    let compared = 0;
    const far: string[] = [];
    const noHl: string[] = [];
    for (const [id, q] of Object.entries(quests)) {
      for (const st of q.stages) {
        for (const l of st.do as { k?: string; at?: number[]; hl?: { npc?: number[]; obj?: number[] }; s?: string }[]) {
          const r = l.k ? ref[id]?.[l.k] : undefined;
          if (!r) continue;
          if (l.at) {
            compared++;
            const d = Math.max(Math.abs(l.at[0] - r.wp[0]), Math.abs(l.at[1] - r.wp[1]));
            if (l.at[2] !== r.wp[2] || d > 12) far.push(`${id}#${st.at} ${l.k}: у нас ${l.at.join(',')}, у Quest Helper ${r.wp.join(',')}`);
          }
          if (r.typ === 'NpcStep' && r.id !== undefined && !(l.hl?.npc ?? []).includes(r.id)) noHl.push(`${id}#${st.at} ${l.k}: NPC ${r.id} не подсвечен`);
          if (r.typ === 'ObjectStep' && r.id !== undefined && !(l.hl?.obj ?? []).includes(r.id)) noHl.push(`${id}#${st.at} ${l.k}: объект ${r.id} не подсвечен`);
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
    expect(far, far.join('\n')).toEqual([]);
    expect(noHl, noHl.join('\n')).toEqual([]);
  });
});
