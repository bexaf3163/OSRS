// The complete preparation trip of one tactical frame: one bank visit for what is banked, then each placed shop or exchange
// purchase or single free pickup, walked through the shared route costs. Other gathering, earning, checks and unplaced
// purchases have no modelled time, so they keep the whole preparation UNKNOWN rather than zero.
import type { TacticalFrame } from './tactical';
import type { Minutes, PlanningSnapshot } from './contracts';
import { freePickup } from './preparation';
import type { WorldPoint } from '../player/playerState';
import { costTrip, type TripStop } from './trip';
import { noTime, sumMinutes } from './cost';
import { BANKS, dist } from '../travel/travel';
import { BANK_SECONDS } from '../travel/bankTrip';

// shortcut: shops and the exchange reuse the bank's service seconds; replace with measured visit times (brief 10).
const SERVICE: Minutes = {
  fast: BANK_SECONDS[0] / 60, typical: (BANK_SECONDS[0] + BANK_SECONDS[1]) / 120, slow: BANK_SECONDS[1] / 60,
  source: 'One bank, shop or exchange visit (bank service seconds)',
};

export function preparationTime(
  frame: Omit<TacticalFrame, 'preparationMinutes'>, origin: WorldPoint | null,
  walk: (from: WorldPoint | null, to: WorldPoint) => Minutes | null,
  gather?: (name: string, count: number) => Minutes | null,
  finish?: WorldPoint, quests: PlanningSnapshot['quests'] = {},
): Minutes | null {
  const kind = frame.action?.kind;
  if (!origin || kind === 'VERIFY' || kind === 'MANUAL_WAIT') return null;
  // Earning the shortfall comes first and has its own time; without one the whole preparation stays UNKNOWN.
  const earning = kind === 'EARN' ? frame.action?.time ?? null : noTime();
  if (!earning) return null;
  const stops: TripStop[] = [];
  let banked = false;
  const gathered: Minutes[] = [];
  for (const line of frame.plan.lines) {
    if (line.timing !== 'NOW' || (line.priority !== 'CRITICAL' && line.priority !== 'IMPORTANT')) continue;
    // An ingredient (prepPlan recipeLines) is the other way to the item it makes, which is priced as its own line.
    if (line.key.startsWith('recipe:')) continue;
    const { bag, equipped, bank } = line.have;
    if (bag !== null && bag + equipped >= line.count) continue;
    if (bank !== null && (bag ?? 0) + equipped + bank >= line.count) { banked = true; continue; }
    // A purchase short of coins keeps its shop or exchange; the earning itself is the frame's EARN action below.
    const shop = line.action?.kind === 'BUY' || line.action?.kind === 'EARN' ? line.action.nav ?? line.action.acquisition?.point : undefined;
    if (shop) {
      const at = shop;
      stops.push({ at: { x: at.x, y: at.y, plane: at.plane }, service: { component: 'exchange', time: SERVICE } });
      continue;
    }
    // A free spawn or giver hands over one piece per visit; more pieces mean respawn waits nobody has measured.
    // A closed source, or one whose quest gate the observed quests do not meet (preparation.freePickup), stays UNKNOWN here.
    const source = line.action?.kind === 'GATHER' ? line.action.acquisition : undefined;
    const free = freePickup(source, quests) ? source!.point : undefined;
    if (!free || line.count - (bag ?? 0) - equipped - (bank ?? 0) > 1) {
      // Gathering it yourself (the Money engine's supply mode) carries its own walk and banking.
      const own = line.action?.kind === 'GATHER' ? gather?.(line.name, Math.max(1, line.count - (bag ?? 0) - equipped)) ?? null : null;
      if (!own) return null;
      gathered.push(own);
      continue;
    }
    stops.push({ at: { x: free.x, y: free.y, plane: free.plane }, service: { component: 'prepare', time: SERVICE } });
  }
  if (banked) {
    // The bank is chosen by its walk (shared worker routes), never by straight-line distance: a bank across a river or wall
    // must not win, and a bank with no route is skipped (S40). shortcut: only the 3 nearest by straight line are walked.
    const near = BANKS.filter(bank => bank.plane === origin.plane).sort((a, b) => dist(origin, a) - dist(origin, b)).slice(0, 3)
      .map(bank => ({ bank, minutes: walk(origin, { x: bank.x, y: bank.y, plane: bank.plane }) }))
      .filter(row => row.minutes).sort((a, b) => a.minutes!.typical - b.minutes!.typical)[0]?.bank;
    if (!near) return null;
    // shortcut: the bank comes first and purchases follow in line order, not the shortest order; replace with an ordered trip search.
    stops.unshift({ at: { x: near.x, y: near.y, plane: near.plane }, service: { component: 'banking', time: SERVICE } });
  }
  if (finish) stops.push({ at: finish });
  if (!stops.length && !gathered.length) return kind === 'EARN' ? earning : { fast: 0, typical: 0, slow: 0, source: 'Everything needed is carried or worn' };
  return sumMinutes([earning, ...gathered, ...(stops.length ? Object.values(costTrip(origin, stops, walk).cost) : [])]);
}
