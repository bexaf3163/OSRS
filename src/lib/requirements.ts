// The single requirements: a declarative description ("Ranged 20", "20 food: trout or salmon", "worn", "2000 gp") and one
// check against the player's state (playerState.ts). Preparation, the preparation route, gear and shopping are counted by it.
//
// The outcome is always one of five: OK, BANK (have it, but in the bank or not worn: one action), PARTIAL (part),
// MISSING (surely none), UNKNOWN (nothing to check with). The unknown never turns into "none".

import type { GameMode } from '../types';
import { nameKey } from './checklist';
import { coinsOf, heldOf, levelOf, questOf, type PlayerState } from './playerState';

export type ItemRef = { name: string; id?: number; /** The manual "already have" mark key. */ manualKey?: string };

export type Requirement =
  | { type: 'skill'; skill: string; min: number }
  | ({ type: 'item'; count: number } & ItemRef)
  | { type: 'equipment'; name: string; slot?: string }
  | { type: 'quest'; quest: string }
  | { type: 'money'; amount: number }
  | { type: 'gameMode'; mode: GameMode }
  /** requiredCount pieces are needed in total from any of the variants: 20 food, trout or salmon. */
  | { type: 'alternative'; requiredCount: number; alternatives: ItemRef[]; label?: string }
  | { type: 'composite'; all?: Requirement[]; any?: Requirement[] };

export type ReqState = 'OK' | 'BANK' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';

export interface ReqResult {
  state: ReqState;
  /** How much there is and how much is needed (levels, pieces, coins): for "N short". */
  have?: number;
  need?: number;
  missing?: number;
  detail: string;
}

const gp = (n: number) => Math.round(n).toLocaleString('en-US');

export function evaluate(req: Requirement, s: PlayerState): ReqResult {
  switch (req.type) {
    case 'skill': {
      const lv = levelOf(s, req.skill);
      if (lv === undefined) return { state: 'UNKNOWN', need: req.min, detail: 'level unknown' };
      return lv >= req.min
        ? { state: 'OK', have: lv, need: req.min, missing: 0, detail: `${lv} ≥ ${req.min}` }
        : { state: 'MISSING', have: lv, need: req.min, missing: req.min - lv, detail: `now ${lv}, ${req.min - lv} short` };
    }
    case 'item': {
      const h = heldOf(s, req.name, req.manualKey);
      if (h.presence === 'UNKNOWN') {
        const bag = h.bag ?? 0;
        // Enough in the bag: it is known; otherwise the rest could be in the bank.
        return bag >= req.count ? { state: 'OK', have: bag, need: req.count, missing: 0, detail: 'in the bag' }
          : { state: 'UNKNOWN', have: bag, need: req.count, detail: bag ? `${bag} in the bag, the bank was not opened` : 'the bank was not opened' };
      }
      const bag = (h.bag ?? 0) + h.noted;
      const total = h.total ?? bag;
      // The player's words ("I already have it"): not "in the bank" but simply there: nothing to collect.
      if (h.source === 'manual') {
        if (total >= req.count) return { state: 'OK', have: total, need: req.count, missing: 0, detail: 'marked "already have"' };
        return { state: total > 0 ? 'PARTIAL' : 'MISSING', have: total, need: req.count, missing: req.count - total, detail: `marked ${total}, ${req.count - total} short` };
      }
      if (bag >= req.count) return { state: 'OK', have: bag, need: req.count, missing: 0, detail: 'in the bag' };
      // The bank was not opened: the rest could be there, that is "unknown", not "short".
      if (h.bank === null && h.source === 'game') return { state: 'UNKNOWN', have: bag, need: req.count, detail: `${bag} in the bag, the bank was not opened` };
      if (total >= req.count) return { state: 'BANK', have: total, need: req.count, missing: 0, detail: `${bag} in the bag, the rest in the bank` };
      if (total > 0) return { state: 'PARTIAL', have: total, need: req.count, missing: req.count - total, detail: `have ${total}, ${req.count - total} short` };
      return { state: 'MISSING', have: 0, need: req.count, missing: req.count, detail: 'in neither the bag nor the bank' };
    }
    case 'equipment': {
      const worn = Object.entries(s.equipment).some(([slot, n]) => (!req.slot || slot === req.slot) && nameKey(n) === nameKey(req.name));
      if (worn) return { state: 'OK', have: 1, need: 1, missing: 0, detail: 'worn' };
      if (!s.connected) return { state: 'UNKNOWN', need: 1, detail: 'no connection to the game' };
      const h = heldOf(s, req.name);
      if (h.presence === 'PRESENT') return { state: 'BANK', have: 1, need: 1, missing: 0, detail: (h.bag ?? 0) > 0 ? 'in the bag: wear it' : 'in the bank: take it and wear it' };
      return h.presence === 'MISSING' ? { state: 'MISSING', have: 0, need: 1, missing: 1, detail: 'none' } : { state: 'UNKNOWN', need: 1, detail: 'the bank was not opened' };
    }
    case 'quest': {
      const q = questOf(s, req.quest);
      return q === 'DONE' ? { state: 'OK', detail: 'counted' } : q === 'NOT_DONE' ? { state: 'MISSING', detail: 'not completed' } : { state: 'UNKNOWN', detail: 'the quest list is unknown' };
    }
    case 'money': {
      const c = coinsOf(s);
      if (c.bag === null) return { state: 'UNKNOWN', need: req.amount, detail: 'coins are visible only from the game' };
      if (c.bag >= req.amount) return { state: 'OK', have: c.bag, need: req.amount, missing: 0, detail: `${gp(c.bag)} in the bag` };
      if (c.total === null) return { state: 'UNKNOWN', have: c.bag, need: req.amount, detail: `${gp(c.bag)} in the bag, the bank was not opened` };
      if (c.total >= req.amount) return { state: 'BANK', have: c.total, need: req.amount, missing: 0, detail: 'the rest is in the bank' };
      return { state: 'MISSING', have: c.total, need: req.amount, missing: req.amount - c.total, detail: `${gp(c.total)} in all, ${gp(req.amount - c.total)} short` };
    }
    case 'gameMode':
      return s.mode === req.mode || (req.mode === 'f2p' && s.mode === 'members')
        ? { state: 'OK', detail: 'the mode fits' } : { state: 'MISSING', detail: 'another mode is needed' };
    case 'alternative': {
      let bag = 0;
      let total = 0;
      let unknownAny = false;
      for (const alt of req.alternatives) {
        const h = heldOf(s, alt.name, alt.manualKey);
        if (h.presence === 'UNKNOWN' || (h.bank === null && h.source === 'game')) unknownAny = true;
        const b = (h.bag ?? 0) + h.noted;
        bag += b;
        total += h.total ?? b;
      }
      if (bag >= req.requiredCount) return { state: 'OK', have: bag, need: req.requiredCount, missing: 0, detail: 'in the bag' };
      if (total >= req.requiredCount) return { state: 'BANK', have: total, need: req.requiredCount, missing: 0, detail: 'part is in the bank' };
      if (unknownAny) return { state: 'UNKNOWN', have: total, need: req.requiredCount, detail: 'the bank was not opened' };
      const missing = req.requiredCount - total;
      return { state: total > 0 ? 'PARTIAL' : 'MISSING', have: total, need: req.requiredCount, missing, detail: `have ${total} of ${req.requiredCount}, ${missing} short` };
    }
    case 'composite': {
      const rank: Record<ReqState, number> = { MISSING: 0, PARTIAL: 1, BANK: 2, UNKNOWN: 3, OK: 4 };
      if (req.any?.length) {
        const rs = req.any.map((r) => evaluate(r, s));
        // Any variant: take the best outcome.
        return rs.reduce((a, b) => (rank[b.state] > rank[a.state] ? b : a));
      }
      const rs = (req.all ?? []).map((r) => evaluate(r, s));
      if (!rs.length) return { state: 'OK', detail: 'nothing to check' };
      // All at once: the worst outcome, but "unknown" is not worse than "none".
      return rs.reduce((a, b) => (rank[b.state] < rank[a.state] ? b : a));
    }
  }
}

/** A requirement's label for preparation lines: "Ranged 20", "20 x food", "Coif worn". */
export function describe(req: Requirement): string {
  switch (req.type) {
    case 'skill': return `${req.skill.charAt(0).toUpperCase()}${req.skill.slice(1)} ${req.min}`;
    case 'item': return `${req.name}${req.count > 1 ? ` ×${req.count}` : ''}`;
    case 'equipment': return `${req.name} worn`;
    case 'quest': return req.quest;
    case 'money': return `${gp(req.amount)} gp`;
    case 'gameMode': return req.mode === 'members' ? 'Members mode' : 'F2P mode';
    case 'alternative': return req.label ?? `${req.requiredCount} × ${req.alternatives.map((a) => a.name).join(' / ')}`;
    case 'composite': return (req.any ?? req.all ?? []).map(describe).join(req.any ? ' or ' : ' and ');
  }
}
