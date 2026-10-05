import { describe, expect, it } from 'vitest';
import machinesRaw from '../src/data/questMachines.json';
import stagesRaw from '../src/data/questStages.json';
import qhSteps from './fixtures/qh-steps.json';
import type { QuestStages } from '../src/types';

/**
 * The Quest Helper state machines (src/data/questMachines.json) and the stage line keys (k).
 * A machine chooses a leaf — a Quest Helper step; the plugin finds the list line with the same key k. These checks keep the data whole:
 * references do not dangle, every line has a key, and the line's tile and highlight match the Quest Helper step.
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

/** The leaves (Quest Helper steps) a machine can choose for a variable value — with the path of nested conditional steps. */
function leaves(m: Machine, ref: unknown, path: string[], out: string[][], depth = 0): void {
  expect(depth, 'the machine is deeper than 40 levels — a cycle?').toBeLessThan(40);
  const n = nodeOf(m, ref);
  const here = n.n ? [...path, n.n] : path;
  if (n.s !== undefined) {
    out.push([...here, n.s]);
    return;
  }
  for (const [, child] of n.c ?? []) leaves(m, child, here, out, depth + 1);
  leaves(m, n.d, here, out, depth + 1);
}

/** The names under which a leaf is looked up among the line keys: itself, the nested conditional steps around it and the parents from addSubSteps. */
function namesOf(m: Machine, path: string[]): string[] {
  const out: string[] = [];
  for (const name of [...path].reverse()) out.push(name, ...(m.alias?.[name] ?? []));
  return out;
}

/** Which stage the plugin shows for a variable value (as in ActiveTarget.Stage.indexFor). */
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
    expect(r, `condition ${JSON.stringify(ref).slice(0, 60)} not found`).toBeTruthy();
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

describe('Quest Helper state machines', () => {
  it('a version 1 file, machines for all the quests Quest Helper leads', () => {
    expect(file.v).toBe(1);
    expect(Object.keys(machines).length).toBeGreaterThanOrEqual(30);
    for (const id of Object.keys(machines)) expect(quests[id], `${id} has no stages in questStages.json`).toBeTruthy();
  });

  it('references do not dangle: nodes, conditions, variable values; no cycles', () => {
    for (const [id, m] of Object.entries(machines)) {
      expect(Object.keys(m.stages).length, id).toBeGreaterThan(0);
      for (const [value, root] of Object.entries(m.stages)) {
        expect(Number.isInteger(Number(value)), `${id}: the variable value "${value}"`).toBe(true);
        const out: string[][] = [];
        leaves(m, root, [], out);
        expect(out.length, `${id}#${value}: the stage has no leaves`).toBeGreaterThan(0);
      }
      for (const [key, n] of Object.entries(m.nodes)) {
        expect(n, `${id}: node ${key}`).toBeTruthy();
        expect(n.d, `${id}: node ${key} has no default step`).toBeDefined();
        for (const [cond, child] of n.c ?? []) {
          expect(reqOf(m, cond), `${id}: the condition of node ${key}`).toBeTruthy();
          expect(nodeOf(m, child), `${id}: the child of node ${key}`).toBeTruthy();
        }
      }
    }
  });

  it('condition operations are known to the plugin and filled in', () => {
    const used = new Map<string, number>();
    for (const [id, m] of Object.entries(machines)) {
      eachReq(m, (r) => {
        used.set(r.o, (used.get(r.o) ?? 0) + 1);
        expect(KNOWN_OPS.has(r.o), `${id}: unknown operation "${r.o}"`).toBe(true);
        if (r.o === 'item') expect(r.ids?.length ?? 0, `${id}: an item without an id`).toBeGreaterThan(0);
        if (r.o === 'zone') {
          expect(r.z?.length ?? 0, `${id}: a zone without rectangles`).toBeGreaterThan(0);
          for (const z of r.z ?? []) {
            expect(z.length, `${id}: zone ${JSON.stringify(z)}`).toBe(6);
            expect(z[0]).toBeLessThanOrEqual(z[2]);
            expect(z[1]).toBeLessThanOrEqual(z[3]);
            expect(z[4]).toBeLessThanOrEqual(z[5]);
          }
        }
        if (['chat', 'mes', 'dlg', 'wt'].includes(r.o)) expect(r.m?.length ?? 0, `${id}: ${r.o} without text`).toBeGreaterThan(0);
        if (['and', 'or', 'nor', 'nand', 'count'].includes(r.o)) expect(r.a?.length ?? 0, `${id}: ${r.o} without conditions`).toBeGreaterThan(0);
        if (r.o === 'vb' || r.o === 'vp') expect(Number.isInteger(r.id), `${id}: a variable without an id`).toBe(true);
      });
    }
    // Conditions the plugin cannot check are "unknown"; there are few, otherwise the machine would almost never decide.
    const unknown = used.get('?') ?? 0;
    const all = [...used.values()].reduce((a, b) => a + b, 0);
    expect(unknown / all, `"unknown" in ${unknown} of ${all} conditions`).toBeLessThan(0.05);
  });

  it('every stage line has a Quest Helper step key; within a stage it does not repeat', () => {
    let lines = 0;
    for (const [id, q] of Object.entries(quests)) {
      for (const st of q.stages) {
        const keys = new Set<string>();
        for (const l of st.do) {
          lines++;
          const k = (l as { k?: string }).k;
          expect(k, `${id}#${st.at}: no key on "${l.s ?? l.t.slice(0, 40)}"`).toBeTruthy();
          expect(k, `${id}#${st.at}: the key "${k}"`).toMatch(/^[A-Za-z0-9_.]{1,80}$/);
          expect(keys.has(k as string), `${id}#${st.at}: the key "${k}" repeats`).toBe(false);
          keys.add(k as string);
        }
      }
    }
    expect(lines).toBeGreaterThanOrEqual(640);
  });

  it('for a variable value the machine reaches a stage line: unreachable lines are no more than before', () => {
    // A line that no leaf points to is not chosen by the machine — it is led by the place and the items. There are 45 of 1016 so far
    // (transitions without conditions, "collect an item" steps without their own leaf); the number must not grow.
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

  it('machine leaves without a stage line (Quest Helper steps that are not in the list): no more than before', () => {
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
    // Known holes (30): detours by stairs and basement steps of secondary branches; new holes must not appear.
    expect(gaps.size, [...gaps].join(', ')).toBeLessThanOrEqual(30);
  });

  it('the tile and highlight of a line match the Quest Helper step (from its sources)', () => {
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
            if (l.at[2] !== r.wp[2] || d > 12) far.push(`${id}#${st.at} ${l.k}: ours ${l.at.join(',')}, Quest Helper ${r.wp.join(',')}`);
          }
          if (r.typ === 'NpcStep' && r.id !== undefined && !(l.hl?.npc ?? []).includes(r.id)) noHl.push(`${id}#${st.at} ${l.k}: NPC ${r.id} not highlighted`);
          if (r.typ === 'ObjectStep' && r.id !== undefined && !(l.hl?.obj ?? []).includes(r.id)) noHl.push(`${id}#${st.at} ${l.k}: object ${r.id} not highlighted`);
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
    expect(far, far.join('\n')).toEqual([]);
    expect(noHl, noHl.join('\n')).toEqual([]);
  });
});
