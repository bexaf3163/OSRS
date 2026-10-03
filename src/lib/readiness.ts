// Готовность к шагу: хватает ли уровней, квестов, предметов и монет — и что сделать, если нет.
// Один расчёт поверх того, что уже знает программа: уровни из игры (или из профиля), отметки квестов на пути,
// сумка и банк из RuneLite, ручные «уже есть» из оптовой закупки. Ничего не придумывает: чего программа не
// знает, то «⚪ не проверено», а не «нет» (UNKNOWN ≠ MISSING). Каждая проблема — с действием: ссылка на план
// навыка или шаг квеста, «🧭 к банку» за предметом, оптовый список для покупки.

import type { GameMode, PlayerStats, Progress, Step } from '../types';
import { levelById } from '../data';
import locationsJson from '../data/majorLocations.json';
import { isClosed, blockersOf } from './next-step';
import { nameKey, preflightItems, type OwnedState } from './checklist';
import type { GearState, NavTargetPayload } from '../services/runeliteBridge';
import { holdingFor, plural } from './shopping';

export type ReadinessStatus =
  | 'READY'
  /** Всё есть, но что-то надо забрать из банка или подтянуть по ходу квеста. */
  | 'MINOR_PREP'
  | 'MISSING_ITEM'
  | 'MISSING_STATS'
  | 'MISSING_QUEST'
  | 'MISSING_MONEY'
  /** Шаг закрыт: не пройдены шаги до него или он только для подписки. */
  | 'BLOCKED'
  /** Проблем не найдено, но часть требований проверить не по чему (нет связи с игрой, не введены уровни). */
  | 'UNKNOWN';

/** OK — выполнено; BANK — есть, но в банке; PARTIAL — есть часть; MISSING — нет; UNKNOWN — неизвестно. */
export type RequirementState = 'OK' | 'BANK' | 'PARTIAL' | 'MISSING' | 'UNKNOWN';

export type ReadinessAction =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'nav'; label: string; target: NavTargetPayload };

export interface RequirementStatus {
  kind: 'step' | 'qp' | 'mode' | 'skill' | 'quest' | 'item' | 'coins';
  label: string;
  state: RequirementState;
  /** false — не мешает начать: нужно по ходу квеста (Agility 25 в The Grand Tree). */
  hard: boolean;
  detail?: string;
  /** Откуда известно: игра, профиль (введено вручную), отметка «уже есть», отметки шагов. */
  source?: 'game' | 'profile' | 'manual' | 'route';
  action?: ReadinessAction;
}

export interface StepReadiness {
  stepId: string;
  status: ReadinessStatus;
  requirements: RequirementStatus[];
  /** Что не так — по порядку важности; пусто, если всё в порядке. */
  problems: RequirementStatus[];
  /** Что проверить не удалось. */
  unknown: RequirementStatus[];
  /**
   * Шаг-прокачка, чья цель уже достигнута (уровни не ниже цели шага): качать заново не нужно.
   * Только когда все уровни известны и у цели нет условий по предметам.
   */
  goalMet?: { skill: string; level: number; have: number; source: 'game' | 'profile' }[];
}

export interface ReadinessInput {
  step: Step;
  /** Все шаги маршрута (для квестов: шаг, где квест засчитывается). */
  steps: Step[];
  progress: Progress;
  qp: number;
  mode: GameMode;
  stats: PlayerStats | null;
  owned: OwnedState | null;
  gear: GearState | null;
}

const COINS_ID = 995;

interface Place { x: number; y: number; plane: number; label: string; kind: string }
const places = Object.values((locationsJson as { locations: Record<string, Place> }).locations);
const banks = places.filter((p) => p.kind === 'bank');

/** Банк ближе всего к месту шага: за вещами туда, а не через полкарты. */
export function nearestBank(step: Step): Place | null {
  const at = step.mapLocation;
  if (!at || !banks.length) return null;
  return banks.reduce((a, b) => (dist(b, at) < dist(a, at) ? b : a));
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Шаг, где квест засчитывается (автоотметка QUEST_COMPLETED по названию квеста). */
export function questStepOf(steps: Step[], quest: string): Step | undefined {
  return steps.find((s) => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === quest);
}

/** Уровень навыка: из игры, иначе введённый в профиле, иначе неизвестен. */
function levelOf(skill: string, stats: PlayerStats | null, p: Progress): { level: number; source: 'game' | 'profile' } | null {
  const live = stats?.[skill];
  if (typeof live === 'number') return { level: live, source: 'game' };
  const own = p.levels[skill];
  return typeof own === 'number' ? { level: own, source: 'profile' } : null;
}

/** Как во вкладке навыков игры: Mining, Agility. */
const skillName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const skillPage = (id: string) => levelById.get(id)?.skill;
const gp = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

export function stepReadiness(input: ReadinessInput): StepReadiness {
  const { step, steps, progress: p, qp, mode, stats, owned, gear } = input;
  const reqs: RequirementStatus[] = [];

  // Режим игры и шаги до этого.
  if (step.membersOnly && mode === 'f2p') {
    reqs.push({ kind: 'mode', label: 'Только с подпиской', state: 'MISSING', hard: true, detail: 'Шаг для Members — в режиме F2P он не нужен.', source: 'route' });
  }
  const b = blockersOf(step, p, qp);
  for (const id of b?.steps ?? []) {
    const s = steps.find((x) => x.id === id);
    reqs.push({
      kind: 'step', label: `Сначала ${id}${s ? ` «${s.title}»` : ''}`, state: 'MISSING', hard: true, source: 'route',
      action: { kind: 'link', label: `К шагу ${id}`, href: `#/step/${id}` },
    });
  }
  if (b?.qp) {
    reqs.push({
      kind: 'qp', label: `${b.qp.need} ${plural(b.qp.need, 'очко', 'очка', 'очков')} квестов`, state: 'MISSING', hard: true, detail: `сейчас ${b.qp.have}, не хватает ${b.qp.need - b.qp.have}`, source: 'route',
      action: { kind: 'link', label: 'Квесты', href: '#/quests' },
    });
  }

  // Уровни и квесты из статьи квеста.
  for (const r of step.requirements ?? []) {
    if (r.type === 'skill') {
      const have = levelOf(r.skill, stats, p);
      const label = `${skillName(r.skill)} ${r.min}`;
      const page = skillPage(r.skill);
      const action: ReadinessAction | undefined = page ? { kind: 'link', label: `⚡ Добрать ${skillName(r.skill)}`, href: `#/skills/${page}` } : undefined;
      const hard = r.when !== 'during';
      const note = r.when === 'during' ? ' Нужен по ходу квеста — начать можно и без него.' : '';
      const boost = r.boostable ? ' Можно поднять временно (boost).' : '';
      if (!have) {
        reqs.push({ kind: 'skill', label, state: 'UNKNOWN', hard, detail: `уровень неизвестен — войди в игру с RuneLite или введи его на странице навыка.${note}` });
      } else if (have.level >= r.min) {
        reqs.push({ kind: 'skill', label, state: 'OK', hard, detail: `${have.level} ≥ ${r.min}`, source: have.source });
      } else {
        reqs.push({
          kind: 'skill', label, state: 'MISSING', hard, source: have.source,
          detail: `сейчас ${have.level}, не хватает ${r.min - have.level}.${note}${boost}`,
          ...(action ? { action } : {}),
        });
      }
    } else {
      const qs = questStepOf(steps, r.quest);
      if (!qs) {
        reqs.push({ kind: 'quest', label: r.quest, state: 'UNKNOWN', hard: true, detail: 'квеста нет на маршруте — отметить его выполнение программа не может' });
      } else if (isClosed(p, qs.id)) {
        reqs.push({ kind: 'quest', label: r.quest, state: 'OK', hard: true, detail: `шаг ${qs.id} отмечен`, source: 'route' });
      } else {
        reqs.push({
          kind: 'quest', label: r.quest, state: 'MISSING', hard: true, detail: `шаг ${qs.id} ещё не отмечен`, source: 'route',
          action: { kind: 'link', label: `🧭 К квесту — ${qs.id}`, href: `#/step/${qs.id}` },
        });
      }
    }
  }

  // Предметы, которые берут с собой (не добываются по ходу шага), и монеты.
  const bank = nearestBank(step);
  for (const it of preflightItems(step)) {
    const isCoins = it.id === COINS_ID || nameKey(it.nameEn) === 'coins';
    if (isCoins) {
      const bag = gear?.coins ?? null;
      const inBank = gear?.bankCoins ?? null;
      const label = `${gp(it.count)} gp`;
      if (bag === null) {
        reqs.push({ kind: 'coins', label, state: 'UNKNOWN', hard: true, detail: 'сколько монет — видно только из игры с RuneLite' });
      } else if (bag >= it.count) {
        reqs.push({ kind: 'coins', label, state: 'OK', hard: true, detail: `в сумке ${gp(bag)}`, source: 'game' });
      } else if (inBank !== null && bag + inBank >= it.count) {
        reqs.push({ kind: 'coins', label, state: 'BANK', hard: true, detail: `в сумке ${gp(bag)}, остальное в банке — возьми`, source: 'game', ...(bank ? { action: bankNav(bank, step, 'Coins') } : {}) });
      } else if (inBank === null) {
        reqs.push({ kind: 'coins', label, state: 'UNKNOWN', hard: true, detail: `в сумке ${gp(bag)}; банк в этой сессии не открывали` });
      } else {
        // Где заработать: ближайший шаг-заработок маршрута (коровьи шкуры, железная руда) — не дальше этого шага.
        const at = steps.findIndex((x) => x.id === step.id);
        const earn = steps.slice(0, at >= 0 ? at + 1 : steps.length).filter((x) => x.moneyGoal).pop() ?? steps.find((x) => x.moneyGoal);
        reqs.push({
          kind: 'coins', label, state: 'MISSING', hard: true, detail: `всего ${gp(bag + inBank)}, не хватает ${gp(it.count - bag - inBank)}`, source: 'game',
          ...(earn ? { action: { kind: 'link' as const, label: `💰 Заработать — ${earn.id}`, href: `#/step/${earn.id}` } } : {}),
        });
      }
      continue;
    }
    const key = it.id !== undefined ? `id:${it.id}` : `name:${nameKey(it.nameEn)}`;
    const manual = p.ownedManual?.[key]?.count;
    const h = holdingFor({ nameEn: it.nameEn, count: it.count, exact: it.exact }, owned, manual);
    const label = `${it.nameEn}${it.count > 1 ? ` ×${it.count}${it.exact ? '' : '+'}` : ''}`;
    const shop: ReadinessAction = { kind: 'link', label: '🛒 В закупки', href: '#/shopping' };
    const carried = h.carried ?? 0;
    if (h.source === 'live' || h.source === 'bag') {
      if (carried >= it.count) {
        reqs.push({ kind: 'item', label, state: 'OK', hard: true, detail: 'в сумке', source: 'game' });
      } else if (h.status === 'SUFFICIENT') {
        reqs.push({
          kind: 'item', label, state: 'BANK', hard: true, source: 'game',
          detail: `в сумке ${carried}, в банке ${h.bank ?? 0} — возьми из банка`,
          ...(bank ? { action: bankNav(bank, step, it.nameEn) } : {}),
        });
      } else if (h.status === 'UNKNOWN') {
        reqs.push({ kind: 'item', label, state: 'UNKNOWN', hard: true, detail: `в сумке ${carried}; банк в этой сессии не открывали` });
      } else {
        reqs.push({
          kind: 'item', label, state: h.status === 'PARTIAL' ? 'PARTIAL' : 'MISSING', hard: true, source: 'game',
          detail: h.owned ? `есть ${h.owned}, не хватает ${h.buy}` : 'нет ни в сумке, ни в банке', action: shop,
        });
      }
    } else if (h.source === 'manual') {
      reqs.push({
        kind: 'item', label, hard: true, source: 'manual',
        state: h.status === 'SUFFICIENT' ? 'OK' : h.status === 'PARTIAL' ? 'PARTIAL' : 'MISSING',
        detail: h.status === 'SUFFICIENT' ? `отмечено «уже есть: ${h.manual}»` : `отмечено ${h.manual}, не хватает ${h.buy}`,
        ...(h.status === 'SUFFICIENT' ? {} : { action: shop }),
      });
    } else {
      reqs.push({ kind: 'item', label, state: 'UNKNOWN', hard: true, detail: 'не проверено — нужна связь с RuneLite или отметка «уже есть» в закупках' });
    }
  }

  const rank: Record<RequirementState, number> = { MISSING: 0, PARTIAL: 1, BANK: 2, UNKNOWN: 3, OK: 4 };
  const kindRank: Record<RequirementStatus['kind'], number> = { mode: 0, step: 1, qp: 2, quest: 3, skill: 4, item: 5, coins: 6 };
  const sorted = [...reqs].sort((a, b2) => rank[a.state] - rank[b2.state] || Number(b2.hard) - Number(a.hard) || kindRank[a.kind] - kindRank[b2.kind]);
  const problems = sorted.filter((r) => r.state === 'MISSING' || r.state === 'PARTIAL' || r.state === 'BANK');
  const unknown = sorted.filter((r) => r.state === 'UNKNOWN');
  const trig = step.inGame?.completionTrigger;
  let goalMet: StepReadiness['goalMet'];
  if (trig?.type === 'SKILL_LEVEL' && trig.levels?.length && !trig.items?.length) {
    const have = trig.levels.map((l) => ({ ...l, lv: levelOf(l.skill, stats, p) }));
    if (have.every((h) => h.lv && h.lv.level >= h.level)) {
      goalMet = have.map((h) => ({ skill: skillName(h.skill), level: h.level, have: h.lv!.level, source: h.lv!.source }));
    }
  }
  return { stepId: step.id, status: statusOf(reqs), requirements: sorted, problems, unknown, ...(goalMet ? { goalMet } : {}) };
}

export interface ChainLink {
  step: Step;
  /** Что мешает именно этому звену, кроме шагов до него: уровни, предметы, монеты. */
  why: RequirementStatus[];
}

/** Номер шага из ссылки действия «#/step/S2-03»; null — ссылка не на шаг. */
const stepOfHref = (a?: ReadinessAction): string | null => (a?.kind === 'link' ? /^#\/step\/(S\d-\d{2})$/.exec(a.href)?.[1] ?? null : null);

/**
 * «Починить всё»: цепочка шагов до готовности. Идём по тому, что мешает (не пройденные шаги и квесты), вглубь не больше
 * maxDepth звеньев, и собираем в порядке выполнения: самое глубокое звено первым, сам шаг — последним. Цикл не вечен:
 * каждый шаг берётся один раз. Пусто — шагу ничего не предшествует.
 */
export function fixChain(input: ReadinessInput, maxDepth = 3): ChainLink[] {
  const seen = new Set<string>([input.step.id]);
  const out: ChainLink[] = [];
  const visit = (step: Step, depth: number) => {
    const r = stepReadiness({ ...input, step });
    const before = r.problems.map((p) => stepOfHref(p.action)).filter((id): id is string => id !== null && id !== input.step.id);
    if (depth < maxDepth) {
      for (const id of before) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = input.steps.find((x) => x.id === id);
        if (s && !isClosed(input.progress, id)) visit(s, depth + 1);
      }
    }
    if (step.id !== input.step.id) {
      out.push({ step, why: r.problems.filter((p) => p.kind !== 'step' && p.kind !== 'quest' && p.kind !== 'qp' && p.kind !== 'mode') });
    }
  };
  visit(input.step, 0);
  return out;
}

function bankNav(bank: Place, step: Step, itemName: string): ReadinessAction {
  // Цель снимется сама, когда предмет окажется в сумке, — стрелка вернётся к шагу.
  return { kind: 'nav', label: `🧭 К банку — ${bank.label}`, target: { label: `${bank.label}: взять ${itemName}`, x: bank.x, y: bank.y, plane: bank.plane, itemName, stepId: step.id } };
}

/** Главная причина — по старшинству: закрыт → квест → уровни → предметы → монеты → мелочи → неизвестное. */
function statusOf(reqs: RequirementStatus[]): ReadinessStatus {
  const missing = (r: RequirementStatus) => r.state === 'MISSING' || r.state === 'PARTIAL';
  const hardMissing = reqs.filter((r) => r.hard && missing(r));
  if (hardMissing.some((r) => r.kind === 'mode' || r.kind === 'step')) return 'BLOCKED';
  if (hardMissing.some((r) => r.kind === 'quest' || r.kind === 'qp')) return 'MISSING_QUEST';
  if (hardMissing.some((r) => r.kind === 'skill')) return 'MISSING_STATS';
  if (hardMissing.some((r) => r.kind === 'item')) return 'MISSING_ITEM';
  if (hardMissing.some((r) => r.kind === 'coins')) return 'MISSING_MONEY';
  if (reqs.some((r) => r.state === 'BANK' || (!r.hard && missing(r)))) return 'MINOR_PREP';
  if (reqs.some((r) => r.state === 'UNKNOWN')) return 'UNKNOWN';
  return 'READY';
}

export const STATUS_TEXT: Record<ReadinessStatus, { icon: string; text: string }> = {
  READY: { icon: '🟢', text: 'Готов к шагу' },
  MINOR_PREP: { icon: '🟡', text: 'Почти готов — мелочь перед выходом' },
  MISSING_ITEM: { icon: '🟠', text: 'Не хватает предметов' },
  MISSING_MONEY: { icon: '🟠', text: 'Не хватает монет' },
  MISSING_STATS: { icon: '🟠', text: 'Нужна короткая подготовка: уровни' },
  MISSING_QUEST: { icon: '🔴', text: 'Сначала квест' },
  BLOCKED: { icon: '🔴', text: 'Шаг пока закрыт' },
  UNKNOWN: { icon: '⚪', text: 'Проблем не видно, но проверено не всё' },
};
