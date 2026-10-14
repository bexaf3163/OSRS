// One-line tips for the step status. A tip says something the cards below do not say at a glance, and only when it is clearly worth a line.

import { EXCHANGE, TILES_PER_SECOND, effectiveTiles, shortOnHand, stopText, type TravelOption } from './travel';

/** A way shorter than walking by at least this many tiles (about half a minute of running) earns a tip. */
export const TIP_MIN_SAVING_TILES = 80;

/**
 * The fastest way that is not walking, from the planner's options: "Fastest: Fairy ring DIS → AJR — saves ~330 tiles". An available way beats one that
 * needs checking, a locked way is never told (nor a spell known to be short of runes in the bag), and a way that starts with fetching something says what
 * and where. null when nothing is clearly worth it.
 */
export function travelTip(options: readonly TravelOption[]): string | null {
  const walk = options.find((o) => o.id === 'walk');
  if (!walk) return null;
  const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : 1);
  const best = options
    .filter((o) => o.id !== 'walk' && o.availability !== 'locked' && !shortOnHand(o) && walk.walkTiles - effectiveTiles(o) >= TIP_MIN_SAVING_TILES)
    .sort((a, b) => rank(a) - rank(b) || effectiveTiles(a) - effectiveTiles(b))[0];
  if (!best) return null;
  const saved = walk.walkTiles - effectiveTiles(best);
  // "the Grand Exchange", "the Draynor Bank", but "Diango's Toy Store".
  const place = (where: string) => (best.acquire?.source === 'bank' || where === EXCHANGE.label ? `the ${where}` : where);
  const first = best.acquire
    ? ` — ${best.acquire.source === 'bank' ? 'withdraw it at' : 'buy it at'} ${place(best.acquire.where)} first${best.acquire.cost ? ` (~${best.acquire.cost} gp)` : ''}`
    : best.prepare ? ` — first ${best.prepare.stops.map((s) => stopText(s)).join(', then ')}`
    : best.availability === 'maybe' ? ' (check what it needs)' : '';
  // Running at least this long: the planner's lower bound, so "about".
  const time = (tiles: number) => {
    const sec = Math.max(1, Math.ceil(tiles / TILES_PER_SECOND));
    return sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`;
  };
  return `Fastest: ${best.title.replace(/: get what it needs first$/, '')} — saves ~${saved} tiles (about ${time(effectiveTiles(best))} instead of ${time(walk.walkTiles)} on foot)${first}`;
}
