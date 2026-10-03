// План подготовки: одно решение «что нужно перед шагом», из которого рисуются представления — «Что нужно» в программе
// (а список в игре и проверка у банка переводятся на него по протоколу 6). Своих проверок здесь нет: берёт готовность (readiness.ts), «одну ходку» (oneTrip.ts)
// и откуда взять (sourceRouter.ts), а добавляет то, чего им по отдельности не хватало:
//  — где предмет лежит: надет / в сумке / в банке / нет / неизвестно;
//  — насколько важно: критично (без этого шаг не сделать) / важно / улучшение / по желанию;
//  — когда понадобится: сейчас / в ближайших шагах / по ходу шага / позже («не бери сейчас»);
//  — что сделать: забрать, купить (у кого и за сколько), заработать, добыть, открыть банк;
//  — достаточно ли расходника: хватает / мало / очень мало;
//  — влезет ли всё в сумку; насколько готов игрок целиком.
// «Неизвестно ≠ нет»: чего программа проверить не может, она не называет отсутствующим и в счёт готовности не берёт.
// Ничего не покупает: решает и подтверждает игрок.

import type { Progress, Step, WikiItemDetail } from '../types';
import { itemById } from '../data';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { upgradeNav, type UpgradeRecommendation } from '../services/gearUpgradeRouter';
import { aggregateShopping, plural, type ShoppingLine } from './shopping';
import { heldOf, type PlayerState } from './playerState';
import { nearestBank, type StepReadiness } from './readiness';
import { planSources, type SourceOption } from './sourceRouter';
import { tripWindow, type OneTripPlan } from './oneTrip';
import { preflightItems } from './checklist';
import { weightAdvice, type WeightAdvice } from './weight';
import { recoverySteps, type Recovery, type RecoveryStep } from './recovery';

/** Критично — без этого шаг не сделать; важно — лучше подготовить до выхода; улучшение — сэкономит время или деньги; по желанию — удобство. */
export type PrepPriority = 'CRITICAL' | 'IMPORTANT' | 'OPTIMIZATION' | 'OPTIONAL';
/** Где предмет сейчас. */
export type PrepWhere = 'EQUIPPED' | 'INVENTORY' | 'BANK' | 'MISSING' | 'UNKNOWN';
/** Когда нужен: сейчас, в ближайших шагах, по ходу самого шага (добудешь), позже (не бери сейчас). */
export type PrepTiming = 'NOW' | 'SOON' | 'IN_STEP' | 'LATER';
/** Хватает ли расходника: достаточно / мало / очень мало. */
export type Supply = 'ENOUGH' | 'LOW' | 'CRITICAL';

export type PrepActionKind = 'TAKE' | 'BUY' | 'EARN' | 'GATHER' | 'CONNECT' | 'UPGRADE';

export interface PrepAction {
  kind: PrepActionKind;
  label: string;
  /** Цена за штуку, если известна. */
  price?: number;
  /** Куда вести стрелку; нет — ведёт ссылка. */
  nav?: NavTargetPayload;
  href?: string;
}

export interface PrepLine {
  key: string;
  /** Английское название — как в сумке, банке и на бирже. */
  name: string;
  nameRu: string;
  /** Сколько нужно всего (на ближайшие шаги, где предмет нужен). */
  count: number;
  /** false — количество в маршруте не числом, count — нижняя оценка. */
  exact: boolean;
  where: PrepWhere;
  have: { bag: number | null; noted: number; bank: number | null; equipped: number };
  /** Сколько ещё взять (забрать или купить); null — неизвестно. */
  toGet: number | null;
  priority: PrepPriority;
  timing: PrepTiming;
  /** У расходника: хватает ли; у инструмента и вещи в один экземпляр — нет. */
  supply?: Supply;
  /** Что сделать; нет — ничего не нужно. */
  action?: PrepAction;
  /** Почему нужен: «Для этого шага и ещё 2», «лечит +12 HP». */
  why: string;
  /** Шаги, где он понадобится, по порядку. */
  usedIn: string[];
}

export interface PrepScore {
  /** Готово из того, что можно проверить; null — проверять пока нечем (нет данных из игры). */
  percent: number | null;
  ready: number;
  total: number;
  /** Критичных проблем: без них шаг не сделать. */
  critical: number;
  important: number;
  /** Улучшений: быстрее или дешевле, но не обязательно. */
  optimizations: number;
  /** Не проверено: не «нет», а «не знаю». */
  unknown: number;
  verdict: 'READY' | 'NOT_READY' | 'UNKNOWN';
}

export interface PrepSlots {
  /** Занято ячеек сумки; null — неизвестно (плагин старый или сумку ещё не присылал). */
  used: number | null;
  /** Сколько ячеек займёт то, что надо взять. Предметы пачкой (руны, стрелы, монеты) — по одной. */
  adding: number;
  /** Не влезет: на сколько ячеек больше 28. 0 — влезает или неизвестно. */
  over: number;
}

export interface PrepPlan {
  stepId: string;
  stepIds: string[];
  /** Все строки по порядку: сначала критичное. */
  lines: PrepLine[];
  /** Взять сейчас: нужно этому шагу, а в сумке нет. */
  now: PrepLine[];
  /** Заодно: понадобится в ближайших шагах. */
  soon: PrepLine[];
  /** Добудешь по ходу шага — брать заранее не нужно. */
  byTheWay: PrepLine[];
  /** Уже готово: надето или в сумке в нужном количестве. */
  have: PrepLine[];
  /** Не брать сейчас: понадобится позже. */
  later: PrepLine[];
  /** Улучшения и необязательное. */
  optimizations: PrepLine[];
  /** Уровень, квест, закрытый шаг — то, чего предметами не исправить. */
  blockers: { label: string; detail?: string }[];
  /** Режим восстановления после срыва: что сделать по порядку; null — срыва нет. */
  recovery: { recovery: Recovery; steps: RecoveryStep[]; missing: number } | null;
  /** Лишний вес на шаге без боя: что оставить в банке и насколько дольше продержится бег. */
  weight: WeightAdvice & { action?: PrepAction };
  coins: { need: number; have: number | null; missing: number | null; action?: PrepAction };
  slots: PrepSlots;
  score: PrepScore;
}

export interface PrepPlanInput {
  step: Step;
  steps: Step[];
  progress: Progress;
  state: PlayerState;
  trip: OneTripPlan;
  readiness: StepReadiness;
  /** Совет по инструменту (gearUpgradeRouter); null — улучшения нет. */
  upgrade?: UpgradeRecommendation | null;
  /** Карточка предмета для «откуда взять» (по умолчанию — база проекта). */
  detail?: (id: number) => WikiItemDetail | undefined;
  /** Срыв на этом шаге (смерть, телепорт); null — нет. */
  recovery?: Recovery | null;
}

export const BAG_SLOTS = 28;
/** От скольких штук предмет считается расходником (еда, руны, стрелы) — для него «хватает / мало». */
export const SUPPLY_FROM = 5;

const STACKS = /(^coins$|\brunes?\b|\barrows?\b|\bbolts?\b|\bdarts?\b|\bjavelins?\b|\bfeathers?\b|\bbait\b|\bseeds?\b|\bnails?\b|\bthrowing)/i;
/** Предметы пачкой занимают одну ячейку; остальное — по ячейке на штуку. Оценка, поэтому в ответе «≈». */
export const stacks = (name: string) => STACKS.test(name);

const gp = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

function supplyOf(need: number, inBag: number, reusable: boolean, danger: boolean): Supply | undefined {
  if (reusable || need < SUPPLY_FROM) return undefined;
  if (inBag >= need) return 'ENOUGH';
  const ratio = inBag / need;
  // «Очень мало» — меньше трети; на бой — меньше половины: выходить с таким запасом нельзя.
  return ratio < (danger ? 0.5 : 1 / 3) ? 'CRITICAL' : 'LOW';
}

function whyOf(line: ShoppingLine, group: string[], all: string[], currentId: string, ids: string[], heal?: number): string {
  const parts: string[] = [];
  const others = Math.max(0, all.length - 1);
  const more = others > 0 ? ` и ещё ${others}` : '';
  if (group[0] === currentId) {
    // «Для этого шага» — это и так видно по разделу «Нужно сейчас»; пишем, только если вещь нужна ещё где-то.
    if (others > 0) parts.push(`Нужно и в ${others} ${plural(others, 'следующем шаге', 'следующих шагах', 'следующих шагах')}`);
  } else if (group[0]) {
    const dist = Math.max(1, ids.indexOf(group[0]));
    parts.push(`Понадобится в ${group[0]} — через ${dist} ${plural(dist, 'шаг', 'шага', 'шагов')}${more}`);
  } else {
    parts.push('Нужен в ближайших шагах');
  }
  if (line.reusable) parts.push('инструмент: один на все шаги');
  if (heal) parts.push(`лечит +${heal} HP`);
  return parts.join(' · ');
}

function bankAction(step: Step, name: string, n: number): PrepAction {
  const b = nearestBank(step);
  return {
    kind: 'TAKE',
    label: `Забери из банка${n > 1 ? ` ×${n}` : ''}`,
    ...(b ? { nav: { label: `${b.label}: взять ${name}`, x: b.x, y: b.y, plane: b.plane, itemName: name, stepId: step.id } } : {}),
  };
}

function sourceAction(src: SourceOption | null, name: string, toGet: number, coinsTotal: number | null, stepId: string): PrepAction | undefined {
  if (!src) return { kind: 'BUY', label: 'Купи на бирже или в магазине', href: '#/shopping' };
  const nav = src.point ? { label: `${src.point.label}: ${name}`, x: src.point.x, y: src.point.y, plane: src.point.plane, itemName: name, stepId } : undefined;
  if (src.kind === 'free') return { kind: 'GATHER', label: src.label, ...(nav ? { nav } : {}) };
  if (src.kind === 'drop') return { kind: 'GATHER', label: src.label };
  if (src.kind === 'bag' || src.kind === 'bank') return undefined;
  const total = src.price !== undefined ? src.price * toGet : null;
  // Не хватит денег — «купи» было бы пустым советом: сначала заработать.
  if (total !== null && coinsTotal !== null && coinsTotal < total) {
    return { kind: 'EARN', label: `Не хватает ${gp(total - coinsTotal)} gp на ${name} — сначала заработай`, ...(src.price !== undefined ? { price: src.price } : {}), href: '#/shopping' };
  }
  return {
    kind: 'BUY',
    label: `Купи: ${src.label}${src.price ? `, ${gp(src.price)} gp` : ''}${toGet > 1 && src.price ? ` за штуку` : ''}`,
    ...(src.price !== undefined ? { price: src.price } : {}),
    ...(nav ? { nav } : {}),
    ...(nav ? {} : { href: '#/shopping' }),
  };
}

const ORDER: Record<PrepPriority, number> = { CRITICAL: 0, IMPORTANT: 1, OPTIMIZATION: 2, OPTIONAL: 3 };
const TIMING: Record<PrepTiming, number> = { NOW: 0, SOON: 1, IN_STEP: 2, LATER: 3 };

export function buildPrepPlan(i: PrepPlanInput): PrepPlan {
  const { step, state, trip } = i;
  const detail = i.detail ?? ((id: number) => itemById.get(id));
  const ids = trip.stepIds;
  const heals = new Map(preflightItems(step).filter((p) => p.heals).map((p) => [p.nameEn.toLowerCase(), p.heals as number]));
  const coinsTotal = trip.coins.have;
  const danger = Boolean(step.foes?.length);
  const lines: PrepLine[] = [];

  for (const t of trip.lines) {
    const inStep = t.line.inStepOnly;
    const equipped = t.held.equipped;
    const allIds = t.allocation.filter((x) => x.need > 0).map((x) => x.stepId);
    // Одну вещь делим по срокам: сколько нужно этому шагу, сколько — ближайшим, сколько — позже. Сначала расходуется то,
    // что в сумке, потом то, что в банке: так видно, что с чем делать, а не «нужно 40, есть 20».
    let bagPool = (t.held.bag ?? 0) + t.held.noted;
    const bankKnown = t.held.bank !== null || t.held.source === 'manual';
    let bankPool = t.held.bank ?? Math.max(0, (t.held.total ?? 0) - bagPool);
    const known = t.held.presence !== 'UNKNOWN';
    const groups = new Map<PrepTiming, { need: number; ids: string[]; bag: number; bank: number; missing: number; unknown: number }>();
    for (const a of t.allocation.filter((x) => x.need > 0)) {
      const idx = ids.indexOf(a.stepId);
      const timing: PrepTiming = inStep ? 'IN_STEP' : idx <= 0 ? 'NOW' : idx <= 2 ? 'SOON' : 'LATER';
      const g = groups.get(timing) ?? { need: 0, ids: [], bag: 0, bank: 0, missing: 0, unknown: 0 };
      const fromBag = Math.min(bagPool, a.need);
      bagPool -= fromBag;
      let rest = a.need - fromBag;
      let fromBank = 0;
      if (rest > 0 && known && bankKnown) {
        fromBank = Math.min(bankPool, rest);
        bankPool -= fromBank;
        rest -= fromBank;
        g.missing += rest;
      } else if (rest > 0) {
        g.unknown += rest;
      }
      g.need += a.need; g.bag += fromBag; g.bank += fromBank;
      g.ids.push(a.stepId);
      groups.set(timing, g);
    }
    for (const [timing, g] of groups) {
      const where: PrepWhere = g.unknown > 0 ? 'UNKNOWN' : g.missing > 0 ? 'MISSING' : g.bank > 0 ? 'BANK' : equipped > 0 && equipped >= g.bag ? 'EQUIPPED' : 'INVENTORY';
      const satisfied = where === 'INVENTORY' || where === 'EQUIPPED';
      const priority: PrepPriority = inStep ? 'OPTIONAL' : timing === 'NOW' ? 'CRITICAL' : 'IMPORTANT';
      const toGet = where === 'UNKNOWN' ? null : where === 'MISSING' ? g.missing : where === 'BANK' ? g.bank : 0;
      let action: PrepAction | undefined;
      if (inStep && !satisfied) {
        action = { kind: 'GATHER', label: 'Добудешь по ходу шага' };
      } else if (where === 'BANK') {
        action = bankAction(step, t.line.nameEn, g.bank);
      } else if (where === 'MISSING') {
        const plan = planSources({ name: t.line.nameEn, need: g.missing, detail: t.line.id !== undefined ? detail(t.line.id) : undefined, manualKey: t.line.key }, state);
        action = sourceAction(plan.primary, t.line.nameEn, g.missing, coinsTotal, step.id);
      } else if (where === 'UNKNOWN') {
        action = state.connected
          ? { kind: 'CONNECT', label: 'Открой банк в игре — проверю, что у тебя есть' }
          : { kind: 'CONNECT', label: 'Подключи RuneLite — проверю, что у тебя есть', href: '#/settings' };
      }
      // Расходник считаем по тому, что нужно ближайшему сроку: хватит ли с собой выйти.
      const supply = timing === 'NOW' ? supplyOf(g.need, g.bag, t.line.reusable, danger) : undefined;
      lines.push({
        key: timing === 'NOW' || timing === 'IN_STEP' ? t.line.key : `${t.line.key}@${timing.toLowerCase()}`,
        name: t.line.nameEn, nameRu: t.line.nameRu, count: g.need, exact: t.line.exact, where,
        have: { bag: t.held.bag, noted: t.held.noted, bank: t.held.bank, equipped },
        toGet, priority, timing, ...(supply ? { supply } : {}), ...(action ? { action } : {}),
        why: whyOf(t.line, g.ids, allIds, step.id, ids, heals.get(t.line.nameEn.toLowerCase())), usedIn: g.ids,
      });
    }
  }

  // Рекомендуемое: не нужно для шага, но сэкономит время; не заставляем — это «улучшение».
  const window = tripWindow(i.steps, i.progress, step.id, Math.max(0, ids.length - 1));
  const recommended = aggregateShopping(window).recommended;
  const optimizations: PrepLine[] = [];
  for (const r of recommended.slice(0, 6)) {
    const held = heldOf(state, r.nameEn, r.key);
    if (held.presence === 'PRESENT' && (held.bag ?? 0) + held.noted >= r.count) continue;
    const inCurrent = r.sources.some((s) => s.stepId === step.id);
    const bank = (held.bank ?? 0) > 0;
    optimizations.push({
      key: `rec:${r.key}`, name: r.nameEn, nameRu: r.nameRu, count: r.count, exact: r.exact,
      where: held.presence === 'UNKNOWN' ? 'UNKNOWN' : bank ? 'BANK' : 'MISSING',
      have: { bag: held.bag, noted: held.noted, bank: held.bank, equipped: held.equipped },
      toGet: null, priority: inCurrent ? 'OPTIMIZATION' : 'OPTIONAL', timing: inCurrent ? 'NOW' : 'SOON',
      ...(bank ? { action: bankAction(step, r.nameEn, 1) } : {}),
      why: r.sources[0] ? `Рекомендуется в ${r.sources[0].stepId}` : 'Рекомендуется', usedIn: r.sources.map((s) => s.stepId),
    });
  }
  const up = i.upgrade;
  if (up && (up.status === 'UPGRADE_AVAILABLE' || up.status === 'UPGRADE_NOT_AFFORDABLE') && up.recommendedItem) {
    const afford = up.status === 'UPGRADE_AVAILABLE';
    const nav = afford ? upgradeNav(up, step.id) : null;
    const cost = up.approxCost;
    optimizations.unshift({
      key: `upgrade:${up.recommendedItem}`, name: up.recommendedItem, nameRu: up.recommendedItem, count: 1, exact: true,
      where: 'MISSING', have: { bag: null, noted: 0, bank: null, equipped: 0 }, toGet: 1, priority: 'OPTIMIZATION', timing: 'NOW',
      action: afford
        ? { kind: 'UPGRADE', label: `Купи ${up.recommendedItem}${up.npc ? ` у ${up.npc}` : ''}${cost ? `, ~${gp(cost)} gp` : ''}`, ...(cost ? { price: cost } : {}), ...(nav ? { nav } : {}) }
        : { kind: 'EARN', label: `${up.recommendedItem}: нужно ~${gp(cost ?? 0)} gp, пока не хватает` },
      why: [up.currentItem ? `Лучше, чем ${up.currentItem}` : '', up.reason ?? ''].filter(Boolean).join(' · ') || 'Быстрее текущего инструмента',
      usedIn: [step.id],
    });
  }

  // Монеты — отдельной строкой готовности.
  const coinsMissing = trip.coins.missing;
  const coins: PrepPlan['coins'] = {
    need: trip.coins.need, have: trip.coins.have, missing: coinsMissing,
    ...(coinsMissing !== null && coinsMissing > 0 ? { action: { kind: 'EARN' as const, label: `Не хватает ${gp(coinsMissing)} gp — заработай`, href: '#/shopping' } } : {}),
  };

  // Что не исправить предметами: уровни, квесты, закрытый шаг.
  const blockers = i.readiness.problems
    .filter((p) => p.hard && (p.kind === 'skill' || p.kind === 'quest' || p.kind === 'step' || p.kind === 'qp' || p.kind === 'mode'))
    .map((p) => ({ label: p.label, ...(p.detail ? { detail: p.detail } : {}) }));

  const stepOrder = (l: PrepLine) => (l.usedIn[0] ? ids.indexOf(l.usedIn[0]) : 99);
  lines.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || TIMING[a.timing] - TIMING[b.timing] || stepOrder(a) - stepOrder(b) || (a.key < b.key ? -1 : 1));
  const satisfiedOf = (l: PrepLine) => l.where === 'INVENTORY' || l.where === 'EQUIPPED';
  const now = lines.filter((l) => l.timing === 'NOW' && !satisfiedOf(l));
  const soon = lines.filter((l) => l.timing === 'SOON' && !satisfiedOf(l));
  const byTheWay = lines.filter((l) => l.timing === 'IN_STEP');
  const later = lines.filter((l) => l.timing === 'LATER' && !satisfiedOf(l));
  // Готовое показываем один раз на вещь: «Lobster ×40», а не два раза по 20 — для этого шага и для следующего.
  const have: PrepLine[] = [];
  for (const l of lines.filter((x) => satisfiedOf(x) && x.timing !== 'IN_STEP')) {
    const same = have.find((h) => h.name === l.name);
    if (same) { same.count += l.count; same.usedIn = [...same.usedIn, ...l.usedIn]; } else have.push({ ...l, usedIn: [...l.usedIn] });
  }

  // Сколько ячеек займёт то, что надо взять сейчас и заодно: «≈» — упаковку предмета мы знаем только по названию.
  let adding = 0;
  for (const l of [...now, ...soon]) {
    if (l.where === 'UNKNOWN') continue;
    const n = Math.max(0, l.count - ((l.have.bag ?? 0) + l.have.noted));
    adding += stacks(l.name) ? (n > 0 ? 1 : 0) : n;
  }
  const used = state.bagSlots.known ? state.bagSlots.value : null;
  const slots: PrepSlots = { used, adding, over: used === null ? 0 : Math.max(0, used + adding - BAG_SLOTS) };

  // Готовность: предметы окна, монеты и то, чего предметами не исправить. Неизвестное в счёт не идёт.
  const counted = lines.filter((l) => (l.timing === 'NOW' || l.timing === 'SOON') && l.where !== 'UNKNOWN');
  const coinsKnown = coins.have !== null && coins.need > 0;
  let ready = counted.filter(satisfiedOf).length;
  let total = counted.length;
  if (coinsKnown) { total += 1; if ((coins.missing ?? 0) === 0) ready += 1; }
  total += blockers.length;
  const unknown = lines.filter((l) => (l.timing === 'NOW' || l.timing === 'SOON') && l.where === 'UNKNOWN').length
    + (coins.need > 0 && coins.have === null ? 1 : 0);
  const critical = counted.filter((l) => !satisfiedOf(l) && l.priority === 'CRITICAL').length
    + blockers.length + (coinsKnown && (coins.missing ?? 0) > 0 ? 1 : 0);
  const important = counted.filter((l) => !satisfiedOf(l) && l.priority === 'IMPORTANT').length;
  const verdict: PrepScore['verdict'] = critical > 0 ? 'NOT_READY' : unknown > 0 ? 'UNKNOWN' : 'READY';
  const score: PrepScore = {
    percent: total === 0 ? (verdict === 'READY' ? 100 : null) : Math.round((ready / total) * 100),
    ready, total, critical, important, optimizations: optimizations.length, unknown, verdict,
  };

  // Вес: на шаге без боя тяжёлое снаряжение и лишнее в сумке мешают бегу. Нужное окну подготовки не трогаем.
  const needed = new Set<string>();
  for (const l of lines) needed.add(l.name);
  for (const w of window) for (const it of [...(w.itemsRequired ?? []), ...(w.itemsRecommended ?? [])]) needed.add(it.nameEn);
  const advice = weightAdvice(step, state, needed);
  const bank = nearestBank(step);
  const weight: PrepPlan['weight'] = {
    ...advice,
    ...(advice.items.length && bank ? { action: { kind: 'TAKE' as const, label: `Сложи в банк — ${bank.label}`, nav: { label: `${bank.label}: сложить лишнее`, x: bank.x, y: bank.y, plane: bank.plane, stepId: step.id } } } : {}),
  };
  if (advice.level === 'HEAVY') { score.important += 1; score.total += 1; score.percent = Math.round((score.ready / score.total) * 100); }
  if (advice.level === 'LIGHT') score.optimizations += 1;

  const missing = now.length + soon.length;
  const recovery: PrepPlan['recovery'] = i.recovery ? { recovery: i.recovery, steps: recoverySteps(i.recovery, missing, step.id), missing } : null;

  return { stepId: step.id, stepIds: ids, lines, now, soon, byTheWay, have, later, optimizations, blockers, recovery, weight, coins, slots, score };
}
