// The combat audit ledger (src/data/combatAudit.json) against the route: every combat stage has an entry, no entry is stale, what an entry claims
// about the app is true, and the mandatory fights are prepared before the danger. Also writes docs/COMBAT_AUDIT.md (UPDATE_FIXTURES=1).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ledgerJson from '../src/data/combatAudit.json';
import questStages from '../src/data/questStages.json';
import dangerZones from '../src/data/dangerZones.json';
import { allSteps, stepById } from '../src/data';
import { auditMarkdown, detectCombatStages, preparedFor, type AuditLedger } from '../src/lib/combatAudit';
import { COMBAT_FOES } from '../src/lib/combatEstimate';
import { OTHER_METHOD, stepFightFoes } from '../src/lib/fightEstimate';
import type { Step } from '../src/types';

const ledger = ledgerJson as unknown as AuditLedger;
const quests = (questStages as { quests: Record<string, { route?: { steps?: string[] }[] }> }).quests;
const detected = detectCombatStages(allSteps, quests);
const zoneIds = new Set(((dangerZones as { zones?: { id: string }[] }).zones ?? (dangerZones as unknown as { id: string }[])).map((z) => z.id));
const step = (id: string) => stepById.get(id) as Step;
const food = (s: Step) => (s.itemsRequired ?? []).find((i) => typeof i.heals === 'number');

describe('the ledger covers the route', () => {
  it('every combat stage the route data shows has one entry, in route order, and no entry is for a stage that is gone', () => {
    expect(ledger.stages.map((e) => e.stepId)).toEqual(detected.map((d) => d.stepId));
    expect(new Set(ledger.stages.map((e) => e.stepId)).size).toBe(ledger.stages.length);
  });

  it('the quest stage lines that talk about a fight are the ones the entry was written for', () => {
    for (const d of detected) {
      const e = ledger.stages.find((x) => x.stepId === d.stepId)!;
      expect(e.lines, d.stepId).toEqual(d.lines);
    }
  });

  it('the detector finds the fights by their signals, not only by words', () => {
    const by = new Map(detected.map((d) => [d.stepId, d.signals.join('; ')]));
    expect(by.get('S4-03')).toMatch(/foes: Giant frog.*pacing: attack/);
    expect(by.get('S3-04')).toMatch(/threats: Ancient Guardian/);
    expect(by.get('S5-03')).toMatch(/threats: Melzar the Mad, Lesser demon.*safespot.*quest lines/);
    expect(by.has('S1-03')).toBe(false);
  });
});

describe('every entry is a full record', () => {
  for (const e of ledger.stages) {
    it(`${e.stepId}: ${e.decision}`, () => {
      expect(e.objective.length).toBeGreaterThan(15);
      expect(e.evidence.length).toBeGreaterThan(0);
      expect(['training', 'quest-fight', 'incidental', 'avoid', 'not-combat']).toContain(e.kind);
      expect(['retain', 'revise', 'branch', 'defer']).toContain(e.decision);
      expect(['melee', 'safespot', 'other', 'run', 'none']).toContain(e.method);
      // A change or a deferral says what was wrong; a change says what was done.
      if (e.decision === 'revise' || e.decision === 'defer') expect(e.problems.length, 'problems').toBeGreaterThan(0);
      if (e.decision === 'revise' || e.decision === 'branch') expect(e.changed?.length ?? 0, 'changed').toBeGreaterThan(0);
      for (const z of e.zones ?? []) expect(zoneIds.has(z), z).toBe(true);
      if (e.kind === 'not-combat') expect(e.enemies).toEqual([]);
    });
  }
});

describe('what the entries say about the app is true', () => {
  it('an opponent marked as in the table is in combatFoes.json, and every opponent the app estimates for a step is in its entry', () => {
    for (const e of ledger.stages) {
      for (const x of e.enemies.filter((y) => y.table)) expect(COMBAT_FOES.some((f) => f.name === x.name), `${e.stepId} ${x.name}`).toBe(true);
      const s = step(e.stepId);
      for (const name of preparedFor(s, e).estimate) expect(e.enemies.some((x) => x.name === name && x.table), `${e.stepId} ${name}`).toBe(true);
    }
  });

  it('a fight the route does another way (pillars, safespot spell) gets no melee estimate', () => {
    for (const e of ledger.stages) {
      for (const f of stepFightFoes(step(e.stepId))) expect(OTHER_METHOD[f.name], `${e.stepId} ${f.name}`).toBeUndefined();
    }
  });
});

describe('the mandatory fights are prepared before the danger', () => {
  const fights = ledger.stages.filter((e) => e.kind === 'quest-fight' && e.mandatory && e.decision !== 'defer');
  const fought = fights.filter((e) => e.method === 'melee' || e.method === 'other');

  it('every one the player fights up close has its food as a required item, which readiness and the game check before leaving', () => {
    for (const e of fought) expect(food(step(e.stepId)), e.stepId).toBeTruthy();
  });

  it('every melee one the app has numbers for is estimated with the player\'s kit', () => {
    for (const e of fought.filter((x) => x.method === 'melee' && x.enemies.some((y) => y.table))) {
      expect(stepFightFoes(step(e.stepId)).length, e.stepId).toBeGreaterThan(0);
    }
  });

  it('the fights this audit revised are the ones named in the request', () => {
    const revised = ledger.stages.filter((e) => e.decision === 'revise').map((e) => e.stepId);
    expect(revised).toEqual(expect.arrayContaining(['S2-08', 'S3-02', 'S3-04', 'S4-01', 'S4-02', 'S8-01', 'S8-02']));
  });

  it('a deferred stage is said to be one in the document, with its reason', () => {
    const md = auditMarkdown(ledger, allSteps);
    for (const e of ledger.stages.filter((x) => x.decision === 'defer')) {
      expect(md).toContain(`## ${e.stepId}`);
      expect(md).toContain(e.problems[0]);
    }
  });
});

describe('docs/COMBAT_AUDIT.md', () => {
  it('is written from the ledger and the route', () => {
    const FILE = new URL('../docs/COMBAT_AUDIT.md', import.meta.url);
    const now = auditMarkdown(ledger, allSteps) + '\n';
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, now);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === now, 'docs/COMBAT_AUDIT.md is out of date: UPDATE_FIXTURES=1 npx vitest run tests/combatAudit.test.ts').toBe(true);
  });
});
