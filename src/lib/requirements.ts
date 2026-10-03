// Единые требования: декларативное описание («Ranged 20», «20 еды: форель или лосось», «надето», «2000 gp») и одна
// проверка по состоянию игрока (playerState.ts). По ней считаются подготовка, маршрут подготовки, снаряжение и закупки.
//
// Исход всегда один из пяти: OK, BANK (есть, но в банке или не надето — одно действие), PARTIAL (часть),
// MISSING (точно нет), UNKNOWN (нечем проверить). Неизвестное никогда не превращается в «нет».

import type { GameMode } from '../types';
import { nameKey } from './checklist';
import { coinsOf, heldOf, levelOf, questOf, type PlayerState } from './playerState';

export type ItemRef = { name: string; id?: number; /** Ключ ручной отметки «уже есть». */ manualKey?: string };

export type Requirement =
  | { type: 'skill'; skill: string; min: number }
  | ({ type: 'item'; count: number } & ItemRef)
  | { type: 'equipment'; name: string; slot?: string }
  | { type: 'quest'; quest: string }
  | { type: 'money'; amount: number }
  | { type: 'gameMode'; mode: GameMode }
  /** Нужно requiredCount штук в сумме из любых вариантов: 20 еды — форель или лосось. */
  | { type: 'alternative'; requiredCount: number; alternatives: ItemRef[]; label?: string }
  | { type: 'composite'; all?: Requirement[]; any?: Requirement[] };

export type ReqState = 'OK' | 'BANK' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';

export interface ReqResult {
  state: ReqState;
  /** Сколько есть и сколько нужно (уровни, штуки, монеты) — для «не хватает N». */
  have?: number;
  need?: number;
  missing?: number;
  detail: string;
}

const gp = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

export function evaluate(req: Requirement, s: PlayerState): ReqResult {
  switch (req.type) {
    case 'skill': {
      const lv = levelOf(s, req.skill);
      if (lv === undefined) return { state: 'UNKNOWN', need: req.min, detail: 'уровень неизвестен' };
      return lv >= req.min
        ? { state: 'OK', have: lv, need: req.min, missing: 0, detail: `${lv} ≥ ${req.min}` }
        : { state: 'MISSING', have: lv, need: req.min, missing: req.min - lv, detail: `сейчас ${lv}, не хватает ${req.min - lv}` };
    }
    case 'item': {
      const h = heldOf(s, req.name, req.manualKey);
      if (h.presence === 'UNKNOWN') {
        const bag = h.bag ?? 0;
        // В сумке хватает — известно; иначе остальное могло лежать в банке.
        return bag >= req.count ? { state: 'OK', have: bag, need: req.count, missing: 0, detail: 'в сумке' }
          : { state: 'UNKNOWN', have: bag, need: req.count, detail: bag ? `в сумке ${bag}, банк не открывали` : 'банк не открывали' };
      }
      const bag = (h.bag ?? 0) + h.noted;
      const total = h.total ?? bag;
      // Слова игрока («у меня уже есть»): не «в банке», а просто есть — забирать нечего.
      if (h.source === 'manual') {
        if (total >= req.count) return { state: 'OK', have: total, need: req.count, missing: 0, detail: 'отмечено «уже есть»' };
        return { state: total > 0 ? 'PARTIAL' : 'MISSING', have: total, need: req.count, missing: req.count - total, detail: `отмечено ${total}, не хватает ${req.count - total}` };
      }
      if (bag >= req.count) return { state: 'OK', have: bag, need: req.count, missing: 0, detail: 'в сумке' };
      // Банк не открывали: остальное могло лежать там — это «неизвестно», а не «не хватает».
      if (h.bank === null && h.source === 'game') return { state: 'UNKNOWN', have: bag, need: req.count, detail: `в сумке ${bag}, банк не открывали` };
      if (total >= req.count) return { state: 'BANK', have: total, need: req.count, missing: 0, detail: `в сумке ${bag}, остальное в банке` };
      if (total > 0) return { state: 'PARTIAL', have: total, need: req.count, missing: req.count - total, detail: `есть ${total}, не хватает ${req.count - total}` };
      return { state: 'MISSING', have: 0, need: req.count, missing: req.count, detail: 'нет ни в сумке, ни в банке' };
    }
    case 'equipment': {
      const worn = Object.entries(s.equipment).some(([slot, n]) => (!req.slot || slot === req.slot) && nameKey(n) === nameKey(req.name));
      if (worn) return { state: 'OK', have: 1, need: 1, missing: 0, detail: 'надето' };
      if (!s.connected) return { state: 'UNKNOWN', need: 1, detail: 'нет связи с игрой' };
      const h = heldOf(s, req.name);
      if (h.presence === 'PRESENT') return { state: 'BANK', have: 1, need: 1, missing: 0, detail: (h.bag ?? 0) > 0 ? 'в сумке — надень' : 'в банке — возьми и надень' };
      return h.presence === 'MISSING' ? { state: 'MISSING', have: 0, need: 1, missing: 1, detail: 'нет' } : { state: 'UNKNOWN', need: 1, detail: 'банк не открывали' };
    }
    case 'quest': {
      const q = questOf(s, req.quest);
      return q === 'DONE' ? { state: 'OK', detail: 'засчитан' } : q === 'NOT_DONE' ? { state: 'MISSING', detail: 'не пройден' } : { state: 'UNKNOWN', detail: 'список квестов неизвестен' };
    }
    case 'money': {
      const c = coinsOf(s);
      if (c.bag === null) return { state: 'UNKNOWN', need: req.amount, detail: 'монеты видны только из игры' };
      if (c.bag >= req.amount) return { state: 'OK', have: c.bag, need: req.amount, missing: 0, detail: `в сумке ${gp(c.bag)}` };
      if (c.total === null) return { state: 'UNKNOWN', have: c.bag, need: req.amount, detail: `в сумке ${gp(c.bag)}, банк не открывали` };
      if (c.total >= req.amount) return { state: 'BANK', have: c.total, need: req.amount, missing: 0, detail: 'остальное в банке' };
      return { state: 'MISSING', have: c.total, need: req.amount, missing: req.amount - c.total, detail: `всего ${gp(c.total)}, не хватает ${gp(req.amount - c.total)}` };
    }
    case 'gameMode':
      return s.mode === req.mode || (req.mode === 'f2p' && s.mode === 'members')
        ? { state: 'OK', detail: 'режим подходит' } : { state: 'MISSING', detail: 'нужен другой режим' };
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
      if (bag >= req.requiredCount) return { state: 'OK', have: bag, need: req.requiredCount, missing: 0, detail: 'в сумке' };
      if (total >= req.requiredCount) return { state: 'BANK', have: total, need: req.requiredCount, missing: 0, detail: 'часть в банке' };
      if (unknownAny) return { state: 'UNKNOWN', have: total, need: req.requiredCount, detail: 'банк не открывали' };
      const missing = req.requiredCount - total;
      return { state: total > 0 ? 'PARTIAL' : 'MISSING', have: total, need: req.requiredCount, missing, detail: `есть ${total} из ${req.requiredCount}, не хватает ${missing}` };
    }
    case 'composite': {
      const rank: Record<ReqState, number> = { MISSING: 0, PARTIAL: 1, BANK: 2, UNKNOWN: 3, OK: 4 };
      if (req.any?.length) {
        const rs = req.any.map((r) => evaluate(r, s));
        // Любой вариант: берём лучший исход.
        return rs.reduce((a, b) => (rank[b.state] > rank[a.state] ? b : a));
      }
      const rs = (req.all ?? []).map((r) => evaluate(r, s));
      if (!rs.length) return { state: 'OK', detail: 'нечего проверять' };
      // Все сразу: худший исход, но «неизвестно» не хуже «нет».
      return rs.reduce((a, b) => (rank[b.state] < rank[a.state] ? b : a));
    }
  }
}

/** Подпись требования для строк подготовки: «Ranged 20», «20 × еда», «Coif надето». */
export function describe(req: Requirement): string {
  switch (req.type) {
    case 'skill': return `${req.skill.charAt(0).toUpperCase()}${req.skill.slice(1)} ${req.min}`;
    case 'item': return `${req.name}${req.count > 1 ? ` ×${req.count}` : ''}`;
    case 'equipment': return `${req.name} надето`;
    case 'quest': return req.quest;
    case 'money': return `${gp(req.amount)} gp`;
    case 'gameMode': return req.mode === 'members' ? 'Режим Members' : 'Режим F2P';
    case 'alternative': return req.label ?? `${req.requiredCount} × ${req.alternatives.map((a) => a.name).join(' / ')}`;
    case 'composite': return (req.any ?? req.all ?? []).map(describe).join(req.any ? ' или ' : ' и ');
  }
}
