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
import { plural } from './shopping';
import { buildPlayerState, coinsOf, heldOf, questOf, type PlayerState } from './playerState';
import { evaluate } from './requirements';

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
  /** У строки уровня: навык и нужный уровень (для «чем качать»). */
  stat?: { skill: string; min: number };
  /** У строки предмета: английское название — по нему ищут в банке, на бирже и в магазине. */
  item?: string;
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

/** Уровень навыка из единого состояния: из игры, иначе введённый в профиле, иначе неизвестен. */
function levelFrom(state: PlayerState, skill: string): { level: number; source: 'game' | 'profile' } | null {
  const l = state.levels[skill];
  return l?.known ? { level: l.value, source: l.source === 'game' ? 'game' : 'profile' } : null;
}

/** Как во вкладке навыков игры: Mining, Agility. */
const skillName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const skillPage = (id: string) => levelById.get(id)?.skill;
const gp = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

/** Всё, что нужно расчёту готовности: маршрут, отметки и единое состояние игрока (playerState.ts). */
export interface ReadinessContext {
  steps: Step[];
  progress: Progress;
  qp: number;
  mode: GameMode;
  state: PlayerState;
  /** Срыв на показанном в игре шаге (смерть, телепорт): план подготовки переходит в режим восстановления. */
  recovery?: { stepId: string; recovery: import('./recovery').Recovery } | null;
}

/** Контекст из «сырых» данных (тесты и места, где единого состояния ещё нет). */
export function contextOf(i: ReadinessInput): ReadinessContext {
  return {
    steps: i.steps, progress: i.progress, qp: i.qp, mode: i.mode,
    state: buildPlayerState({ mode: i.mode, stats: i.stats, progress: i.progress, owned: i.owned, gear: i.gear, questsDone: null }),
  };
}

export function stepReadiness(input: ReadinessInput): StepReadiness {
  return readinessOf(input.step, contextOf(input));
}

/**
 * Готовность шага. Исходы («есть / в банке / часть / нет / неизвестно») даёт единая проверка требований
 * (requirements.ts) по единому состоянию игрока; здесь — только порядок, подписи и действия.
 */
export function readinessOf(step: Step, ctx: ReadinessContext): StepReadiness {
  const { steps, progress: p, qp, mode, state } = ctx;
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
      const res = evaluate({ type: 'skill', skill: r.skill, min: r.min }, state);
      const have = levelFrom(state, r.skill);
      const label = `${skillName(r.skill)} ${r.min}`;
      const page = skillPage(r.skill);
      const action: ReadinessAction | undefined = page ? { kind: 'link', label: `⚡ Добрать ${skillName(r.skill)}`, href: `#/skills/${page}` } : undefined;
      const hard = r.when !== 'during';
      const note = r.when === 'during' ? ' Нужен по ходу квеста — начать можно и без него.' : '';
      const boost = r.boostable ? ' Можно поднять временно (boost).' : '';
      if (res.state === 'UNKNOWN') {
        reqs.push({ kind: 'skill', label, state: 'UNKNOWN', hard, stat: { skill: r.skill, min: r.min }, detail: `уровень неизвестен — войди в игру с RuneLite или введи его на странице навыка.${note}` });
      } else if (res.state === 'OK') {
        reqs.push({ kind: 'skill', label, state: 'OK', hard, stat: { skill: r.skill, min: r.min }, detail: `${res.have} ≥ ${r.min}`, ...(have ? { source: have.source } : {}) });
      } else {
        reqs.push({
          kind: 'skill', label, state: 'MISSING', hard, stat: { skill: r.skill, min: r.min }, ...(have ? { source: have.source } : {}),
          detail: `сейчас ${res.have}, не хватает ${res.missing}.${note}${boost}`,
          ...(action ? { action } : {}),
        });
      }
    } else {
      const qs = questStepOf(steps, r.quest);
      const game = questOf(state, r.quest);
      if (qs && isClosed(p, qs.id)) {
        reqs.push({ kind: 'quest', label: r.quest, state: 'OK', hard: true, detail: `шаг ${qs.id} отмечен`, source: 'route' });
      } else if (game === 'DONE') {
        // Игра знает лучше отметок: квест засчитан, даже если шаг на пути ещё не закрыт.
        reqs.push({ kind: 'quest', label: r.quest, state: 'OK', hard: true, detail: 'засчитан в игре', source: 'game' });
      } else if (qs) {
        reqs.push({
          kind: 'quest', label: r.quest, state: 'MISSING', hard: true, detail: `шаг ${qs.id} ещё не отмечен`, source: 'route',
          action: { kind: 'link', label: `🧭 К квесту — ${qs.id}`, href: `#/step/${qs.id}` },
        });
      } else if (game === 'NOT_DONE') {
        reqs.push({ kind: 'quest', label: r.quest, state: 'MISSING', hard: true, detail: 'квеста нет на маршруте, и в игре он не засчитан', source: 'game' });
      } else {
        reqs.push({ kind: 'quest', label: r.quest, state: 'UNKNOWN', hard: true, detail: 'квеста нет на маршруте — отметить его выполнение программа не может' });
      }
    }
  }

  // Предметы, которые берут с собой (не добываются по ходу шага), и монеты.
  const bank = nearestBank(step);
  for (const it of preflightItems(step)) {
    const isCoins = it.id === COINS_ID || nameKey(it.nameEn) === 'coins';
    if (isCoins) {
      const res = evaluate({ type: 'money', amount: it.count }, state);
      const c = coinsOf(state);
      const label = `${gp(it.count)} gp`;
      if (res.state === 'UNKNOWN' && c.bag === null) {
        reqs.push({ kind: 'coins', label, state: 'UNKNOWN', hard: true, detail: 'сколько монет — видно только из игры с RuneLite' });
      } else if (res.state === 'OK') {
        reqs.push({ kind: 'coins', label, state: 'OK', hard: true, detail: `в сумке ${gp(c.bag!)}`, source: 'game' });
      } else if (res.state === 'BANK') {
        reqs.push({ kind: 'coins', label, state: 'BANK', hard: true, detail: `в сумке ${gp(c.bag!)}, остальное в банке — возьми`, source: 'game', ...(bank ? { action: bankNav(bank, step, 'Coins') } : {}) });
      } else if (res.state === 'UNKNOWN') {
        reqs.push({ kind: 'coins', label, state: 'UNKNOWN', hard: true, detail: `в сумке ${gp(c.bag!)}; банк в этой сессии не открывали` });
      } else {
        // Где заработать: ближайший шаг-заработок маршрута (коровьи шкуры, железная руда) — не дальше этого шага.
        const at = steps.findIndex((x) => x.id === step.id);
        const earn = steps.slice(0, at >= 0 ? at + 1 : steps.length).filter((x) => x.moneyGoal).pop() ?? steps.find((x) => x.moneyGoal);
        reqs.push({
          kind: 'coins', label, state: 'MISSING', hard: true, detail: `всего ${gp(c.total ?? c.bag ?? 0)}, не хватает ${gp(res.missing ?? it.count)}`, source: 'game',
          ...(earn ? { action: { kind: 'link' as const, label: `💰 Заработать — ${earn.id}`, href: `#/step/${earn.id}` } } : {}),
        });
      }
      continue;
    }
    const key = it.id !== undefined ? `id:${it.id}` : `name:${nameKey(it.nameEn)}`;
    const res = evaluate({ type: 'item', name: it.nameEn, count: it.count, manualKey: key, ...(it.id !== undefined ? { id: it.id } : {}) }, state);
    const h = heldOf(state, it.nameEn, key);
    const label = `${it.nameEn}${it.count > 1 ? ` ×${it.count}${it.exact ? '' : '+'}` : ''}`;
    const shop: ReadinessAction = { kind: 'link', label: '🛒 В закупки', href: '#/shopping' };
    const manual = h.source === 'manual';
    const source: RequirementStatus['source'] = manual ? 'manual' : 'game';
    if (res.state === 'OK') {
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: 'OK', hard: true, source,
        detail: manual ? `отмечено «уже есть: ${state.manual[key]}»` : 'в сумке',
      });
    } else if (res.state === 'BANK') {
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: 'BANK', hard: true, source: 'game',
        detail: `в сумке ${(h.bag ?? 0) + h.noted}, в банке ${h.bank ?? 0} — возьми из банка`,
        ...(bank ? { action: bankNav(bank, step, it.nameEn) } : {}),
      });
    } else if (res.state === 'UNKNOWN') {
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: 'UNKNOWN', hard: true,
        detail: h.bag !== null ? `в сумке ${h.bag + h.noted}; банк в этой сессии не открывали` : 'не проверено — нужна связь с RuneLite или отметка «уже есть» в закупках',
      });
    } else {
      const have = res.have ?? 0;
      reqs.push({
        kind: 'item', label, item: it.nameEn, state: res.state, hard: true, source,
        detail: manual ? `отмечено ${state.manual[key]}, не хватает ${res.missing}` : have ? `есть ${have}, не хватает ${res.missing}` : 'нет ни в сумке, ни в банке',
        action: shop,
      });
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
    const have = trig.levels.map((l) => ({ ...l, lv: levelFrom(state, l.skill) }));
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
 * каждый шаг берётся один раз. Пусто — шагу ничего не предшествует. `readiness` — общий расчёт с памятью (движок),
 * чтобы звенья цепочки не пересчитывались заново.
 */
export function fixChainOf(
  step: Step,
  ctx: ReadinessContext,
  maxDepth = 3,
  readiness: (s: Step) => StepReadiness = (s) => readinessOf(s, ctx),
): ChainLink[] {
  const seen = new Set<string>([step.id]);
  const out: ChainLink[] = [];
  const visit = (cur: Step, depth: number) => {
    const r = readiness(cur);
    const before = r.problems.map((p) => stepOfHref(p.action)).filter((id): id is string => id !== null && id !== step.id);
    if (depth < maxDepth) {
      for (const id of before) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = ctx.steps.find((x) => x.id === id);
        if (s && !isClosed(ctx.progress, id)) visit(s, depth + 1);
      }
    }
    if (cur.id !== step.id) {
      out.push({ step: cur, why: r.problems.filter((p) => p.kind !== 'step' && p.kind !== 'quest' && p.kind !== 'qp' && p.kind !== 'mode') });
    }
  };
  visit(step, 0);
  return out;
}

export function fixChain(input: ReadinessInput, maxDepth = 3): ChainLink[] {
  return fixChainOf(input.step, contextOf(input), maxDepth);
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
