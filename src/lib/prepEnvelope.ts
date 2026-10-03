// Снимок состояния для игры — протокол 6 (POST /prep-plan). Раньше программа слала плагину пять отдельных запросов
// (шаг, закупки, подсветка банка, совет по снаряжению, и план в программе считался только для себя): между ними экран
// игры показывал то стрелку к новому шагу при старом списке, то совет к прошлому шагу. Теперь программа собирает всё,
// что должно быть в игре, в одно сообщение; плагин применяет его за один проход и только рисует. Решает программа:
// у неё сумка, банк, цены, шаги вперёд и план подготовки (prepPlan.ts); у плагина — живая сумка для мгновенных галочек.
//
// Снимок полный: чего в нём нет (null) — то снято. Номер seq растёт; запоздавший плагин отбрасывает. Чистые функции —
// отправку и повторы ведёт bridge.tsx.

import type { ActiveStepPayload, GearHintPayload, ShoppingPlanPayload } from '../services/runeliteBridge';
import { kgText } from './weight';
import type { PrepLine, PrepPlan, PrepPriority, PrepTiming, PrepWhere, Supply } from './prepPlan';

export const SNAPSHOT_VERSION = 6;

/** Предел строк плана и текстов — как в плагине (PrepPlan.java): лишнее плагин отверг бы целиком. */
export const MAX_PLAN_LINES = 48;
const MAX_LATER = 12;
const MAX_RECOVERY = 5;
const MAX_BLOCKERS = 4;
const MAX_TEXT = 200;

export interface PrepPlanPayload {
  stepId: string;
  score: { percent: number | null; verdict: 'READY' | 'NOT_READY' | 'UNKNOWN'; critical: number; important: number; optimizations: number; unknown: number };
  lines: { name: string; need: number; where: PrepWhere; priority: PrepPriority; timing: PrepTiming; supply?: Exclude<Supply, 'ENOUGH'>; action?: string }[];
  /** «Не бери сейчас»: что понадобится позже. */
  later: string[];
  recovery?: { title: string; steps: string[] };
  weight?: string;
  slots?: string;
  blockers?: string[];
}

export interface BankTagsPayload {
  stageId: string;
  itemIds: number[];
}

export interface PrepEnvelope {
  v: typeof SNAPSHOT_VERSION;
  seq: number;
  step: ActiveStepPayload | null;
  shopping: ShoppingPlanPayload | null;
  bankTags: BankTagsPayload | null;
  gearHint: GearHintPayload | null;
  plan: PrepPlanPayload | null;
}

/** Строка не длиннее предела плагина: режем по слову, с многоточием. */
export function clipText(s: string, max = MAX_TEXT): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2)))}…`;
}

const countOf = (l: Pick<PrepLine, 'name' | 'count'>) => (l.count > 1 ? `${l.name} ×${l.count}` : l.name);

/** Текст про вес для игры: что оставить в банке и что это даст. Пусто — советовать нечего. */
export function weightText(plan: PrepPlan): string | undefined {
  const w = plan.weight;
  if (w.level === 'NONE' || !w.items.length) return undefined;
  const names = w.items.slice(0, 3).map((i) => `${i.name}${i.count > 1 ? ` ×${i.count}` : ''}`).join(', ');
  const more = w.items.length > 3 ? ` и ещё ${w.items.length - 3}` : '';
  const head = w.level === 'HEAVY' ? 'Сними в банк' : 'Можно оставить в банке';
  const effect = w.current !== null && w.after !== null
    ? ` (${kgText(w.current)} → ${kgText(Math.max(0, w.after))}${w.ratio !== null && w.ratio >= 1.05 ? `, бег дольше в ~${(Math.round(w.ratio * 10) / 10).toLocaleString('ru-RU')} раза` : ''})`
    : ` (−${kgText(w.saving)})`;
  return clipText(`${head}: ${names}${more}${effect}`);
}

/** Сумка не вместит всё сразу — что делать. Пусто — влезает или неизвестно. */
export function slotsText(plan: PrepPlan): string | undefined {
  const over = plan.slots.over;
  if (over <= 0) return undefined;
  return clipText(`Всё сразу не влезет — на ${over} ${over === 1 ? 'ячейку' : 'ячеек'} больше. Возьми нужное шагу, остальное потом`);
}

/** Режим восстановления для игры: заголовок и пункты по порядку. */
export function recoveryPayload(plan: PrepPlan): PrepPlanPayload['recovery'] | undefined {
  const rec = plan.recovery;
  if (!rec) return undefined;
  const r = rec.recovery;
  const far = r.distance !== null ? ` (~${r.distance} кл.)` : '';
  const title = r.reason === 'DEATH' ? `Ты умер — шаг ${plan.stepId} далеко${far}` : `Ты в Lumbridge, шаг ${plan.stepId} далеко${far}`;
  const steps = rec.steps.slice(0, MAX_RECOVERY).map((s) => clipText(s.detail ? `${s.label} — ${s.detail}` : s.label));
  return steps.length ? { title: clipText(title), steps } : undefined;
}

/** План подготовки в виде, который плагин рисует: без лишнего и в пределах его проверок. */
export function planPayload(plan: PrepPlan): PrepPlanPayload {
  const lines = plan.lines
    .filter((l) => l.timing !== 'LATER')
    .slice(0, MAX_PLAN_LINES)
    .map((l) => ({
      name: clipText(l.name),
      need: Math.max(0, Math.min(l.count, 10_000_000)),
      where: l.where,
      priority: l.priority,
      timing: l.timing,
      ...(l.supply && l.supply !== 'ENOUGH' ? { supply: l.supply } : {}),
      ...(l.action ? { action: clipText(l.action.label, 90) } : {}),
    }));
  const weight = weightText(plan);
  const slots = slotsText(plan);
  const recovery = recoveryPayload(plan);
  const s = plan.score;
  return {
    stepId: plan.stepId,
    score: { percent: s.percent, verdict: s.verdict, critical: s.critical, important: s.important, optimizations: s.optimizations, unknown: s.unknown },
    lines,
    later: plan.later.slice(0, MAX_LATER).map((l) => clipText(countOf(l), 60)),
    ...(recovery ? { recovery } : {}),
    ...(weight ? { weight } : {}),
    ...(slots ? { slots } : {}),
    ...(plan.blockers.length ? { blockers: plan.blockers.slice(0, MAX_BLOCKERS).map((b) => clipText(b.detail ? `${b.label} — ${b.detail}` : b.label)) } : {}),
  };
}

export interface SnapshotParts {
  step: ActiveStepPayload | null;
  shopping: ShoppingPlanPayload | null;
  bankTags: BankTagsPayload | null;
  gearHint: GearHintPayload | null;
  plan: PrepPlanPayload | null;
}

export const EMPTY_PARTS: SnapshotParts = { step: null, shopping: null, bankTags: null, gearHint: null, plan: null };

/** Номер следующего снимка: растёт и между запусками программы (по часам), чтобы плагин не принял новый за запоздавший. */
export function nextSeq(prev: number, now = Date.now()): number {
  return Math.max(prev + 1, now);
}

export function buildEnvelope(parts: SnapshotParts, seq: number): PrepEnvelope {
  return {
    v: SNAPSHOT_VERSION,
    seq,
    step: parts.step,
    shopping: parts.shopping && parts.shopping.items.length ? parts.shopping : null,
    // Пустой список ничего не подсвечивает — как «снято».
    bankTags: parts.bankTags && parts.bankTags.itemIds.length ? parts.bankTags : null,
    gearHint: parts.gearHint,
    // План от другого шага плагин не приложит; не шлём и лишнего.
    plan: parts.plan && (!parts.step || parts.plan.stepId === parts.step.stepId) ? parts.plan : null,
  };
}

/** Что снимок содержит по существу — без номера: одинаковое не шлём второй раз. */
export function envelopeKey(parts: SnapshotParts): string {
  const e = buildEnvelope(parts, 0);
  return JSON.stringify({ ...e, seq: 0 });
}
