// How training methods are chosen: the one training preference, set on each skill card (XP, Balanced, Money). "balanced" is the default: the
// practical time to the goal, counting the setup of missing items, attention and material cost. "fastest" puts speed first, "profit" known net
// earnings. Since 2.94.3 it changes the method only: preparation looks the same two steps ahead for everyone (oneTrip.ts LOOK_AHEAD), and the
// old "Relaxed" choice and the "calm"/"efficient" play style that rode along with XP are gone (an old save reads as Balanced).

import type { Features } from './features';

export type MethodPriority = 'balanced' | 'fastest' | 'profit';
export const priorityOf = (f: Pick<Features, 'efficient'> & Partial<Pick<Features, 'profitTraining'>>): MethodPriority =>
  f.efficient ? 'fastest' : f.profitTraining ? 'profit' : 'balanced';
