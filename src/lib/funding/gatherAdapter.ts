// The bridge between the funding evaluator and the gathering engine (skillingRates.ts): a money method that gathers at a spot of the registry is timed
// by the same success chances, roll lengths and tools as the Skills page, not by a published pace scaled by a rule. The evaluator keeps its own trips
// (bag, walk, sale); this gives only the seconds per unit at the spot. A method the registry has no spot for keeps the published pace.

import { gatherPace } from '../skillingRates';
import type { PlayerState } from '../playerState';
import type { Personalised } from './evaluate';
import type { FundingMethod } from './types';

export function gatherPersonaliser(state: PlayerState): (m: FundingMethod, tool?: string | null) => Personalised | null {
  return (m, tool) => {
    // One product taken every unit: the unit the method's pace counts. Chance outputs (gems) ride along at their own rate.
    const sure = m.outputs.filter((o) => o.qty === 1 && o.chance === undefined);
    if (m.family !== 'gathering' || !m.spot || sure.length !== 1) return null;
    const pace = gatherPace(sure[0].item.name, m.spot, state, tool ?? null);
    if (!pace) return null;
    return {
      secondsPerUnit: pace.seconds, extraInputs: [], confidence: 'MEDIUM',
      basis: `the wiki's success chance for your level with a ${pace.tool}`, notes: [],
    };
  };
}
