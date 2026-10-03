// «Как добрать деньги»: способы заработка из вики (moneyMaking.json), которые доступны по уровням игрока.
// Уровни — из игры или введённые вручную; чего не знаем — не придумываем, а помечаем «?». Выручка в час — оценка вики
// по ценам биржи на дату снимка при хорошей игре: у новичка она ниже, и интерфейс так и говорит.

import moneyJson from '../data/moneyMaking.json';
import type { MoneyData, MoneyMethod, MoneyReq, Step } from '../types';
import { nameKey } from './checklist';

export const MONEY = moneyJson as MoneyData;

export type Levels = Readonly<Record<string, number | undefined>>;

/** Боевой уровень по формуле игры; null — не знаем атаку, силу или защиту. */
export function combatLevel(l: Levels): number | null {
  const { attack, strength, defence } = l;
  if (attack === undefined || strength === undefined || defence === undefined) return null;
  const hp = l.hitpoints ?? 10;
  const base = 0.25 * (defence + hp + Math.floor((l.prayer ?? 1) / 2));
  const melee = 0.325 * (attack + strength);
  const ranged = 0.325 * Math.floor(1.5 * (l.ranged ?? 1));
  const magic = 0.325 * Math.floor(1.5 * (l.magic ?? 1));
  return Math.floor(base + Math.max(melee, ranged, magic));
}

export interface ReqState {
  req: MoneyReq;
  /** Сколько у игрока; undefined — не знаем. */
  have?: number;
  ok: boolean;
}

export interface MethodView {
  method: MoneyMethod;
  /** Обязательные требования, которых не хватает (известный уровень ниже нужного). */
  missing: ReqState[];
  /** Обязательные требования, по которым уровень неизвестен. */
  unknown: ReqState[];
  /** Советуемые уровни, которых не хватает (только подсказка). */
  advice: ReqState[];
  /** Квесты из условий способа, не пройденные игроком и нужные обязательно. */
  questsMissing: string[];
  /** Сколько уровней не хватает до самого далёкого обязательного требования. */
  gap: number;
  /** free — ничего покупать не надо; invest — вики называет стартовый капитал или материалы, которые покупают. */
  cost: 'free' | 'invest';
}

function stateOf(req: MoneyReq, levels: Levels, combat: number | null): ReqState {
  const have = req.skill === 'combat' ? combat ?? undefined : levels[req.skill];
  return { req, ...(have !== undefined ? { have } : {}), ok: have !== undefined && have >= req.level };
}

/** Названия квестов маршрута, упомянутые в условиях способа, которые игрок ещё не прошёл (если условие жёсткое). */
function questGaps(m: MoneyMethod, steps: readonly Step[], done: ReadonlySet<string>): string[] {
  if (!m.quests) return [];
  const text = m.quests.toLowerCase();
  // «recommended» — совет, а не требование: подсказкой он остаётся в самом тексте условий.
  if (/recommend|optional/.test(text)) return [];
  const found: string[] = [];
  for (const s of steps) {
    if (s.type === 'quest' && text.includes(s.title.toLowerCase()) && !done.has(nameKey(s.title))) found.push(s.title);
  }
  return found;
}

export function viewMethod(m: MoneyMethod, levels: Levels, steps: readonly Step[], questsDone: ReadonlySet<string>): MethodView {
  const combat = combatLevel(levels);
  const states = m.skills.map((r) => stateOf(r, levels, combat));
  const hard = states.filter((s) => s.req.required);
  const missing = hard.filter((s) => s.have !== undefined && !s.ok);
  const unknown = hard.filter((s) => s.have === undefined);
  const advice = states.filter((s) => !s.req.required && s.have !== undefined && !s.ok);
  const gap = missing.reduce((g, s) => Math.max(g, s.req.level - (s.have ?? 0)), 0);
  const cost = m.capital || m.inputs?.length ? 'invest' : 'free';
  return { method: m, missing, unknown, advice, questsMissing: questGaps(m, steps, questsDone), gap, cost };
}

export interface MoneyAdvice {
  /** Без вложений, доступны по известным уровням (неизвестные помечены), выручка по убыванию. */
  free: MethodView[];
  /** Нужны вложения, которые тебе по карману (или неизвестно, сколько у тебя монет). */
  invest: MethodView[];
  /** Откроются скоро: не хватает не больше SOON_GAP уровней. */
  soon: MethodView[];
}

export const SOON_GAP = 10;

/**
 * cash — монеты (сумка + банк), null — неизвестно: тогда способы с капиталом не отсекаются, но и не выдаются за доступные
 * без оговорки (в строке способа остаётся «от N gp»).
 */
export function adviseMoney(
  levels: Levels, steps: readonly Step[], questsDone: ReadonlySet<string>, methods: readonly MoneyMethod[] = MONEY.methods, cash: number | null = null,
): MoneyAdvice {
  const views = methods.map((m) => viewMethod(m, levels, steps, questsDone));
  const open = views.filter((v) => !v.missing.length && !v.questsMissing.length);
  const soon = views.filter((v) => v.missing.length > 0 && v.gap <= SOON_GAP && !v.questsMissing.length);
  const byProfit = (a: MethodView, b: MethodView) => b.method.profit - a.method.profit;
  // Сначала то, что точно доступно, потом то, где уровень неизвестен.
  const order = (list: MethodView[]) => [...list.filter((v) => !v.unknown.length).sort(byProfit), ...list.filter((v) => v.unknown.length).sort(byProfit)];
  const affordable = (v: MethodView) => cash === null || !v.method.capital || v.method.capital <= cash;
  return {
    free: order(open.filter((v) => v.cost === 'free')),
    invest: order(open.filter((v) => v.cost === 'invest' && affordable(v))),
    soon: soon.filter((v) => v.cost === 'free' || affordable(v)).sort((a, b) => a.gap - b.gap || b.method.profit - a.method.profit),
  };
}

/** Часов до цели при выручке profit в час; null — нечего считать. */
export function hoursToCover(missingGp: number, profit: number): number | null {
  return missingGp > 0 && profit > 0 ? missingGp / profit : null;
}

export function reqText(r: MoneyReq): string {
  const name = r.skill === 'combat' ? 'боевой' : r.skill.charAt(0).toUpperCase() + r.skill.slice(1);
  return `${name} ${r.level}${r.plus ? '+' : ''}`;
}
