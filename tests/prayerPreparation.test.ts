import { describe, expect, it } from 'vitest';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { adviseTraining, trainingMethods, viewMethod } from '../src/lib/trainingRouter';
import { methodPoint, withTrainingMethod } from '../src/lib/methodStep';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { stepById } from '../src/data';
import { skillGuides } from '../src/data/skillGuideRegistry';
import { matchStrict } from '../src/services/locationResolver';

const method = trainingMethods.find(m => m.id === 'pr-camdozaal')!;
function character(levels: Record<string, number> = { prayer: 1, fishing: 7, cooking: 7 }, knife = 1, quest = true) {
  const carried = { 'Small fishing net': 1, Knife: knife };
  return buildPlayerState({ mode: 'f2p', connected: true, stats: { ...levels, hitpoints: 30 }, progress: emptyProgress(),
    questsDone: quest ? ['Below Ice Mountain'] : [],
    gear: { equipment: [], inventory: Object.entries(carried).filter(([, n]) => n > 0).map(([name, count]) => ({ name, count, id: 0 })), coins: 0, bankCoins: 0 },
    owned: { bankSeen: true, items: new Map(Object.entries(carried).map(([name, count]) => [name.toLowerCase(), { name, carried: count, noted: 0, bank: 0 }])) },
  });
}
function projected() {
  const base = stepById.get('S6-01')!;
  return withTrainingMethod({ ...base, requires: [], requirements: [], minQp: undefined, followsMethod: 'prayer',
    inGame: { ...base.inGame!, completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'prayer', level: 2 }] } },
  }, { methodId: method.id, needs: method.needs, untilLevel: 2 });
}

describe('Camdozaal is eligible only with its actual cross-skill kit', () => {
  it.each([['fishing', 'Fishing 7'], ['cooking', 'Cooking 7']] as const)('%s below7 locks the method through shared requirements', (skill, label) => {
    const state = character({ prayer: 1, fishing: 7, cooking: 7, [skill]: 6 });
    const view = viewMethod(method, state);
    expect(view.status).toBe('LOCKED');
    expect(view.missing).toContainEqual(expect.objectContaining({ kind: 'skill', label, state: 'MISSING' }));
    const step = projected();
    const engine = createReadinessEngine({ steps: [step], state, progress: emptyProgress(), qp: 1, mode: 'f2p' });
    expect(engine.prep(step).ready).toBe(false);
  });
  it('accepts Prayer1 and the complete kit without changing observed facts', () => {
    const state = character(), before = structuredClone(state), step = projected();
    expect(method.from).toBe(1);
    expect(viewMethod(method, state).status).toBe('READY');
    expect(step.itemsRequired?.map(n => [n.nameEn, n.amount])).toEqual([['Small fishing net', 1], ['Knife', 1]]);
    const engine = createReadinessEngine({ steps: [step], state, progress: emptyProgress(), qp: 1, mode: 'f2p' });
    expect(engine.prep(step).ready).toBe(true);
    expect(engine.prep(step).tasks).toEqual([]);
    expect(state).toEqual(before);
  });
  it('keeps unread skills unknown instead of treating a held net as full readiness', () => {
    const state = character({ prayer: 1, cooking: 7 });
    expect(viewMethod(method, state).unchecked).toContainEqual(expect.objectContaining({ label: 'Fishing 7', state: 'UNKNOWN' }));
    const step = projected();
    const engine = createReadinessEngine({ steps: [step], state, progress: emptyProgress(), qp: 1, mode: 'f2p' });
    expect(engine.prep(step).ready).toBe(false);
    expect(engine.prep(step).tasks).toEqual([]); // Unread is not a reason to train, shop or guess an arrow.
    expect(engine.plan(step).score.verdict).toBe('UNKNOWN');
    expect(engine.plan(step).blockers).toEqual([]); // Nor is it a confirmed missing prerequisite.
  });
  it('requires both quest access and the preparation knife', () => {
    expect(viewMethod(method, character(undefined, 1, false)).status).toBe('LOCKED');
    expect(viewMethod(method, character(undefined, 0)).missing).toContainEqual(expect.objectContaining({ label: 'Knife', state: 'MISSING' }));
  });
  it('recommends the eligible free activity instead of a passive option with no destination', () => {
    const advice = adviseTraining({ skill: 'prayer', target: 2, mode: 'f2p', state: character(), style: 'chill', priority: 'balanced' });
    expect(advice.best?.method.id).toBe('pr-camdozaal');
    expect(advice.best?.method.xph).toBeNull();
    expect(trainingMethods.find(m => m.id === 'pr-bury')?.manualSetup).toContain('no standalone training destination');
  });
  it('new catalogue entries inherit the same cross-skill checks', () => {
    const future = { ...method, id: 'future-offering-method', needs: method.needs.map(n => n.type === 'skill' ? { ...n, min: 8 } : n) };
    expect(viewMethod(future, character()).status).toBe('LOCKED');
  });
  it('uses the verified shared destination rather than an absent map', () => {
    const guide = skillGuides.prayer.steps.find(s => s.id === 'prayer-04')!;
    const at = methodPoint(method.id)!;
    expect([at.x, at.y, at.plane]).toEqual(guide.location.tile);
    expect(matchStrict('Camdozaal')).toMatchObject({ page: 'Ruins of Camdozaal', source: 'dictionary' });
    expect(projected().mapLocation).toMatchObject({ x: at.x, y: at.y, plane: at.plane });
  });
  it('requires prepared offerings and does not publish an unsupported cycle rate', () => {
    expect(method.xph).toBeNull();
    expect(method.note).toContain('offer prepared fish');
    expect(projected().quickSteps?.join(' ')).toContain('raw fish cannot be offered');
    expect(skillGuides.prayer.steps.find(s => s.id === 'prayer-04')!.description).toContain('prepared fish');
  });
});
