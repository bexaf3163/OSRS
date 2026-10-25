// The bridge between the funding evaluator and the processing engine (processingRates.ts): a money method that makes a product of the registry at a
// station of the registry (steel bars at the Edgeville furnace) is timed by the same recipe — ticks, success chance for the level — as the Skills page.
// The evaluator keeps its own trips (bag, walk, sale); this gives only the seconds per unit at the station. Anything else keeps the published pace.

import { processPace } from '../processingRates';
import type { PlayerState } from '../playerState';
import type { Personalised } from './evaluate';
import type { FundingMethod } from './types';

export function processPersonaliser(state: PlayerState): (m: FundingMethod) => Personalised | null {
  return (m) => {
    const sure = m.outputs.filter((o) => o.qty === 1 && o.chance === undefined);
    if ((m.family !== 'processing' && m.family !== 'production') || !m.spot || sure.length !== 1) return null;
    const pace = processPace(sure[0].item.name, m.spot, state);
    if (!pace) return null;
    return {
      secondsPerUnit: pace.seconds, extraInputs: [], confidence: 'MEDIUM',
      basis: `the wiki's recipe for your level${pace.station ? ` at the ${pace.station}` : ''}`, notes: [],
    };
  };
}
