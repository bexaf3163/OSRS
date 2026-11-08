// Walking legs with the teleports this character can really cast now (reachTiles: the level, the runes or a tablet in the bag,
// the Chronicle's charges). A leg is the faster known of walking there and teleporting, then walking from the landing; both
// walks come from the shared route costs, so a missing route stays UNKNOWN rather than a straight line.
import type { Minutes } from './contracts';
import type { WorldPoint } from '../player/playerState';
import { reachTiles } from '../travel/travel';
import { sumMinutes } from './cost';

type Walk = (from: WorldPoint | null, to: WorldPoint) => Minutes | null;
export type TeleportInput = Omit<Parameters<typeof reachTiles>[0], 'from'>;

// shortcut: a cast and its landing take a few seconds; replace with measured teleport times (brief 10).
const CAST: Minutes = { fast: 0.05, typical: 0.08, slow: 0.15, source: 'Teleport cast and landing (seconds, estimated)' };

export function withTeleports(walk: Walk, input: TeleportInput | null): Walk {
  if (!input) return walk;
  return (from, to) => {
    const foot = walk(from, to);
    if (!from) return foot;
    const reach = reachTiles({ ...input, from }, to);
    if (!reach.via || !reach.landing) return foot;
    const landing = { x: reach.landing.x, y: reach.landing.y, plane: reach.landing.plane ?? 0 };
    const after = walk(landing, to);
    const teleport = after ? sumMinutes([CAST, after]) : null;
    if (!teleport) return foot;
    return foot && foot.typical <= teleport.typical ? foot : { ...teleport, source: `${reach.via}, then ${after!.source}` };
  };
}
