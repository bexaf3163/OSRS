// The old route's skill, preparation and gear steps (deleted in 2.84.0), kept only as realistic inputs for engine tests: a combat
// or skilling step with its items, foes and method, a shopping or money step. The app has no such steps; the planner's training,
// preparation and funding engines replace them.
import type { Step } from '../../src/types';
import { allSteps, stepById } from '../../src/data';
import retired from './retiredSteps.json';

const byId = new Map((retired as unknown as Step[]).map((s) => [s.id, s]));

export function retiredStep(id: string): Step {
  const step = byId.get(id);
  if (!step) throw new Error(`no retired step ${id}`);
  return structuredClone(step);
}

/** A step of the app's route, or a retired skill step for a test that still names one. */
export function stepOrRetired(id: string): Step {
  return stepById.get(id) ?? retiredStep(id);
}

/** Where each retired step stood on the route: the step before it. */
const AFTER: Record<string, string> = {
  'S1-08': 'S1-07', 'S1-12': 'S1-10', 'S2-04': 'S2-03', 'S3-08': 'S3-07', 'S4-03': 'S4-02', 'S6-01': 'S5-09', 'S6-02': 'S5-09',
  'S6-03': 'S5-09', 'S6-04': 'S5-09', 'S7-04': 'S7-03', 'S8-03': 'S8-02', 'S8-04': 'S8-02', 'S8-06': 'S8-05',
  'S1-10': 'S1-09', 'S1-13': 'S1-09', 'S2-01': 'S1-09', 'S3-06': 'S3-05', 'S3-07': 'S3-05', 'S4-04': 'S4-02',
  'S4-05': 'S4-02', 'S5-02': 'S5-01', 'S6-05': 'S5-09',
};

/** The app's route with one retired step back where it stood, for a test of that step among its neighbours. */
export function routeWith(id: string): Step[] {
  if (stepById.has(id)) return [...allSteps];
  const at = allSteps.findIndex((s) => s.id === AFTER[id]) + 1;
  return [...allSteps.slice(0, at), retiredStep(id), ...allSteps.slice(at)];
}
