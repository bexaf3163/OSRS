// The fields the app sends the RuneLite plugin on /active-step, listed once. tsc checks the list against the payload type,
// this test checks that every field the app really sends is on it, and the plugin's BridgeContractTest checks its own
// fields against the copy in runelite-bridge/src/test/resources/bridge-fields.json. To update the copy: npm run fixtures.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ActiveStepPayload } from '../src/services/runeliteBridge';
import type { PacingSkill } from '../src/types';

// "a.b" is a field, "a[]" the items of a list, "a{}" the values of a map keyed by skill.
const FIELDS = [
  'stepId', 'title', 'goal', 'maxHit', 'watchItems', 'npcNames', 'npcIds', 'objectNames', 'objectIds', 'dialogChoices', 'highlightItems',
  'worldPoint', 'worldPoint.x', 'worldPoint.y', 'worldPoint.plane', 'worldPoint.label',
  'pathWaypoints', 'pathWaypoints[].x', 'pathWaypoints[].y', 'pathWaypoints[].plane', 'pathWaypoints[].label',
  'groundTiles', 'groundTiles[].x', 'groundTiles[].y', 'groundTiles[].plane', 'groundTiles[].label', 'groundTiles[].color',
  'completionTrigger', 'completionTrigger.type', 'completionTrigger.questName', 'completionTrigger.anyOf', 'completionTrigger.chatPattern',
  'completionTrigger.varbitId', 'completionTrigger.varpId', 'completionTrigger.bitMask', 'completionTrigger.targetValue', 'completionTrigger.atLeast',
  'completionTrigger.levels', 'completionTrigger.levels[].skill', 'completionTrigger.levels[].level',
  'completionTrigger.items', 'completionTrigger.items[].names', 'completionTrigger.items[].id', 'completionTrigger.items[].count',
  'checklist', 'checklist[].equip', 'checklist[].name', 'checklist[].id', 'checklist[].count', 'checklist[].heals', 'checklist[].alt', 'checklist[].doses',
  'pacing', 'pacing.skill', 'pacing.also', 'pacing.foodHpPerKill', 'pacing.targetLevel', 'pacing.targetExp', 'pacing.actionName',
  'pacing.expPerAction', 'pacing.secondsPerAction', 'pacing.goals', 'pacing.goals{}.level', 'pacing.goals{}.exp',
  'useOn', 'useOn[].item', 'useOn[].target', 'useOn[].kind',
  'guide', 'guide.steps', 'guide.plan', 'guide.plan.now', 'guide.plan.next',
  'guide.items', 'guide.items[].name', 'guide.items[].id', 'guide.items[].count', 'guide.items[].where', 'guide.items[].inStep',
  'guide.items[].alt', 'guide.items[].doses',
  'guide.places', 'guide.places[].x', 'guide.places[].y', 'guide.places[].plane', 'guide.places[].label', 'guide.places[].npc', 'guide.places[].items',
  'guide.stage', 'guide.stage.kind', 'guide.stage.id',
  'guide.stage.banks', 'guide.stage.banks[].x', 'guide.stage.banks[].y', 'guide.stage.banks[].plane', 'guide.stage.banks[].label',
  'guide.stage.stages', 'guide.stage.stages[].at', 'guide.stage.stages[].go', 'guide.stage.stages[].items',
  'guide.stage.stages[].items[].name', 'guide.stage.stages[].items[].id', 'guide.stage.stages[].items[].count', 'guide.stage.stages[].items[].where',
  'guide.stage.stages[].items[].inStep', 'guide.stage.stages[].items[].alt', 'guide.stage.stages[].items[].doses',
  'guide.stage.stages[].steps', 'guide.stage.stages[].steps[].t', 'guide.stage.stages[].steps[].s', 'guide.stage.stages[].steps[].x',
  'guide.stage.stages[].steps[].y', 'guide.stage.stages[].steps[].plane', 'guide.stage.stages[].steps[].has', 'guide.stage.stages[].steps[].need',
  'guide.stage.stages[].steps[].k', 'guide.stage.stages[].steps[].mh',
  'guide.stage.stages[].steps[].hl', 'guide.stage.stages[].steps[].hl.npc', 'guide.stage.stages[].steps[].hl.obj',
  'guide.stage.stages[].steps[].hl.on', 'guide.stage.stages[].steps[].hl.item',
  'guide.stage.stages[].steps[].pre', 'guide.stage.stages[].steps[].pre[].item', 'guide.stage.stages[].steps[].pre[].id',
  'guide.stage.stages[].steps[].pre[].n', 'guide.stage.stages[].steps[].pre[].at', 'guide.stage.stages[].steps[].pre[].t',
  'guide.stage.stages[].steps[].pre[].on', 'guide.stage.stages[].steps[].pre[].npc', 'guide.stage.stages[].steps[].pre[].alt',
] as const;

type Under<T, P extends string> = T extends readonly (infer U)[] ? Under<U, `${P}[]`>
  : T extends string | number | boolean ? never
  : keyof T extends PacingSkill ? Under<NonNullable<T[keyof T]>, `${P}{}`>
  : { [K in keyof T & string]-?: `${P}.${K}` | Under<NonNullable<T[K]>, `${P}.${K}`> }[keyof T & string];
type Fields = { [K in keyof ActiveStepPayload & string]-?: K | Under<NonNullable<ActiveStepPayload[K]>, K> }[keyof ActiveStepPayload & string];
type Drift = Exclude<Fields, (typeof FIELDS)[number]> | Exclude<(typeof FIELDS)[number], Fields>;
// tsc fails on this line and names each field that is in the payload type or on the list, but not in both.
const matchesType: [Drift] extends [never] ? true : Drift = true;

const listed = new Set<string>(FIELDS);
const sentPaths = (v: unknown, p: string, out: Set<string>): void => {
  if (Array.isArray(v)) for (const e of v) sentPaths(e, `${p}[]`, out);
  else if (v !== null && typeof v === 'object') {
    const map = FIELDS.some((f) => f.startsWith(`${p}{}`));
    for (const [k, x] of Object.entries(v)) {
      const q = map ? `${p}{}` : p ? `${p}.${k}` : k;
      if (!map) out.add(q);
      sentPaths(x, q, out);
    }
  }
};

const TARGETS = new URL('../runelite-bridge/src/test/resources/active-steps.json', import.meta.url);
const COPY = new URL('../runelite-bridge/src/test/resources/bridge-fields.json', import.meta.url);

describe('the fields the app sends the plugin', () => {
  it('the list matches the payload type (tsc checks it)', () => expect(matchesType).toBe(true));

  it('every field of every step target the app sends is on the list', () => {
    const sent = new Set<string>();
    for (const row of JSON.parse(readFileSync(TARGETS, 'utf8')) as { target: unknown }[]) sentPaths(row.target, '', sent);
    expect(sent.size).toBeGreaterThan(100);
    expect([...sent].filter((f) => !listed.has(f))).toEqual([]);
  });

  it('the copy for the plugin test matches the list', () => {
    const now = `${JSON.stringify(FIELDS, null, 1)}\n`;
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(COPY, now);
    const saved = existsSync(COPY) ? readFileSync(COPY, 'utf8') : '';
    expect(saved === now, 'runelite-bridge/src/test/resources/bridge-fields.json is out of date (npm run fixtures)').toBe(true);
  });
});
