// «🧳 Что нужно»: план подготовки к шагу и ближайшим трём (lib/prepPlan.ts) — одно решение, а это блок, который его показывает. У каждой вещи видно, где она (надета / в сумке / в банке / нет / не проверено), что с ней сделать
// (забрать, купить и у кого, заработать, добыть), почему нужна, и хватает ли расходника. Критичное отделено от «заодно»
// и «позже»: не всё сразу, не всё в сумку. Что неизвестно, не выдаётся за «нет». Ничего не покупает: решает игрок.

import type { Step } from '../types';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';
import { useReadinessEngine, useRecovery } from '../readinessContext';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { formatGp } from '../lib/shopping';
import { kgText } from '../lib/weight';
import { BAG_SLOTS, type PrepPlan, type PrepAction, type PrepLine, type PrepWhere, type Supply } from '../lib/prepPlan';
import { NavigateButton } from './NavigateButton';
import { useUpgradeRecommendation } from './UpgradePrompt';

const WHERE: Record<PrepWhere, { icon: string; text: string }> = {
  EQUIPPED: { icon: '🛡', text: 'надето' },
  INVENTORY: { icon: '✓', text: 'в сумке' },
  BANK: { icon: '🏦', text: 'в банке' },
  MISSING: { icon: '✗', text: 'нет' },
  UNKNOWN: { icon: '?', text: 'не проверено' },
};
const SUPPLY: Record<Supply, string> = { ENOUGH: 'хватает', LOW: 'мало', CRITICAL: 'очень мало' };

const countOf = (l: PrepLine) => (l.count > 1 ? ` ×${l.count}${l.exact ? '' : '+'}` : '');

function Action({ a }: { a: PrepAction }) {
  return (
    <span className="prep-action">
      {a.label}
      {a.nav && <> <NavigateButton target={a.nav} label="🧭" compact /></>}
      {!a.nav && a.href && <> <a href={a.href}>→</a></>}
    </span>
  );
}

function Row({ l, showWhy = true }: { l: PrepLine; showWhy?: boolean }) {
  const w = WHERE[l.where];
  return (
    <li className={`prep-line is-${l.where.toLowerCase()} p-${l.priority.toLowerCase()}`}>
      <span className="prep-where" aria-hidden="true">{w.icon}</span>
      <strong>{l.name}{countOf(l)}</strong>
      <span className="muted"> — {w.text}</span>
      {l.supply && <span className={`prep-supply is-${l.supply.toLowerCase()}`}> · {SUPPLY[l.supply]}</span>}
      {l.action && l.where !== 'UNKNOWN' && <> · <Action a={l.action} /></>}
      {showWhy && l.why && <span className="prep-why muted small">{l.why}</span>}
    </li>
  );
}

/** Строки «не проверено» одной строкой: действие у них общее — открыть банк или подключить RuneLite. */
function Unknown({ lines }: { lines: PrepLine[] }) {
  if (!lines.length) return null;
  const a = lines.find((l) => l.action)?.action;
  return (
    <li className="prep-line is-unknown">
      <span className="prep-where" aria-hidden="true">?</span>
      <strong>Не проверено:</strong> {lines.map((l) => `${l.name}${countOf(l)}`).join(', ')}
      {a && <> · <Action a={a} /></>}
    </li>
  );
}

/** Режим восстановления: что сделать по порядку после смерти или телепорта посреди шага. */
export function RecoveryBanner({ step, rec }: { step: Step; rec: NonNullable<PrepPlan['recovery']> }) {
  const { dismiss } = useRecovery();
  const r = rec.recovery;
  const far = r.distance !== null ? ` (до него ~${r.distance} кл.)` : '';
  const head = r.reason === 'DEATH'
    ? `💀 Ты умер${r.landedAt ? ' и возродился в Lumbridge' : ''} — шаг ${step.id} остался далеко${far}`
    : `🔁 Ты в Lumbridge, а шаг ${step.id} далеко${far}: похоже, телепорт посреди шага`;
  const back = r.target ? { label: `Шаг ${step.id}`, x: r.target.x, y: r.target.y, plane: r.target.plane, stepId: step.id } : null;
  return (
    <div className="prep-recovery" role="alert">
      <p className="readiness-head"><strong>Режим восстановления</strong></p>
      <p className="small">{head}.</p>
      <ol className="small">
        {rec.steps.map((st) => <li key={st.label}><strong>{st.label}</strong>{st.detail && <span className="muted"> — {st.detail}</span>}</li>)}
      </ol>
      <p className="small prep-recovery-actions">
        {back && <NavigateButton target={back} label="🧭 Вернуться к шагу" />}
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>Это не срыв — продолжить</button>
      </p>
    </div>
  );
}

function Section({ title, hint, lines }: { title: string; hint?: string; lines: PrepLine[] }) {
  if (!lines.length) return null;
  const known = lines.filter((l) => l.where !== 'UNKNOWN');
  const unknown = lines.filter((l) => l.where === 'UNKNOWN');
  return (
    <>
      <p className="small prep-title"><strong>{title}</strong>{hint && <span className="muted"> — {hint}</span>}</p>
      <ul className="small">
        {known.map((l) => <Row key={l.key} l={l} />)}
        <Unknown lines={unknown} />
      </ul>
    </>
  );
}

/** inStatus — режим восстановления уже показан выше, в статусе шага (Дзен): здесь не повторяем. */
export function OneTripCard({ step, inStatus = false }: { step: Step; inStatus?: boolean }) {
  const { progress } = useStore();
  const profile = styleOf(useFeatures());
  const upgrade = useUpgradeRecommendation(step);
  const plan = useReadinessEngine().plan(step, { ahead: profile.lookAhead, upgrade });
  if (isClosed(progress, step.id)) return null;
  const { score, slots } = plan;
  const nothing = !plan.recovery && !plan.lines.length && !plan.coins.need && !plan.optimizations.length && !plan.blockers.length && !plan.weight.items.length;
  if (nothing) return null;
  const pending = plan.now.length + plan.soon.length + plan.byTheWay.length;
  const coinsShort = plan.coins.missing !== null && plan.coins.missing > 0;
  const quiet = score.verdict === 'READY' && !pending && !coinsShort && slots.over === 0 && plan.weight.level !== 'HEAVY' && !plan.recovery;
  const unknownCoins = plan.coins.need > 0 && plan.coins.have === null;
  return (
    <section className="one-trip" aria-label="Что нужно">
      <p className="readiness-head">
        🧳 <strong>Что нужно</strong>
        <span className="muted"> — на {plan.stepIds.length} {plan.stepIds.length === 1 ? 'шаг' : 'шага'} вперёд</span>
        {score.percent !== null && <span className={`prep-score is-${score.verdict.toLowerCase()}`}> · готово {score.percent}%</span>}
      </p>
      {(score.critical > 0 || score.important > 0 || score.optimizations > 0 || score.unknown > 0) && (
        <p className="small prep-chips">
          {score.critical > 0 && <span className="prep-chip is-critical">🔴 критично: {score.critical}</span>}
          {score.important > 0 && <span className="prep-chip is-important">🟡 важно: {score.important}</span>}
          {score.optimizations > 0 && <span className="prep-chip is-opt">⚡ улучшений: {score.optimizations}</span>}
          {score.unknown > 0 && <span className="prep-chip is-unknown">? не проверено: {score.unknown}</span>}
        </p>
      )}
      {plan.recovery && !inStatus && <RecoveryBanner step={step} rec={plan.recovery} />}
      {quiet && <p className="small">🟢 <strong>Всё готово</strong> — можно идти.</p>}
      {plan.blockers.length > 0 && (
        <ul className="small">
          {plan.blockers.map((b) => <li key={b.label} className="prep-line is-missing p-critical"><span className="prep-where" aria-hidden="true">🔒</span><strong>{b.label}</strong>{b.detail && <span className="muted"> — {b.detail}</span>}</li>)}
        </ul>
      )}
      <Section title="🔴 Нужно сейчас" lines={plan.now} />
      <Section title="🟡 Заодно" hint="понадобится в ближайших шагах" lines={plan.soon} />
      {plan.byTheWay.length > 0 && (
        <p className="small prep-title"><strong>⚪ По ходу шага:</strong> <span className="muted">{plan.byTheWay.map((l) => `${l.name}${countOf(l)}`).join(', ')} — заранее брать не нужно</span></p>
      )}
      {(coinsShort || unknownCoins) && (
        <p className="small">
          💰 <strong>Монеты на шаги:</strong>{' '}
          {coinsShort
            ? <>не хватает {formatGp(plan.coins.missing!)} gp из {formatGp(plan.coins.need)}{plan.coins.action?.href && <> · <a href={plan.coins.action.href}>как добрать →</a></>}</>
            : <span className="muted">нужно {formatGp(plan.coins.need)} gp — сколько у тебя, пока не знаю</span>}
        </p>
      )}
      {slots.over > 0 && (
        <p className="notice small" role="note">
          ⚠️ <strong>Всё сразу не влезет:</strong> в сумке занято {slots.used} из {BAG_SLOTS}, взять надо ещё ≈{slots.adding} — на {slots.over}{' '}
          {slots.over === 1 ? 'ячейку' : 'ячеек'} больше. Возьми сейчас нужное этому шагу, остальное — позже.
        </p>
      )}
      {plan.weight.items.length > 0 && (
        <div className={`prep-weight is-${plan.weight.level.toLowerCase()}`} role="note">
          <p className="small">
            ⚖️ <strong>{plan.weight.level === 'HEAVY' ? 'Сними лишнее в банк' : 'Можно облегчить сумку'}:</strong>{' '}
            {plan.weight.items.map((i) => `${i.name}${i.count > 1 ? ` ×${i.count}` : ''} (${kgText(i.kg)})`).join(', ')}.
          </p>
          <p className="small muted">
            Шаг без боя — тяжёлое тут не нужно.{' '}
            {plan.weight.current !== null && plan.weight.after !== null && plan.weight.ratio !== null
              ? <>Вес {kgText(plan.weight.current)} → {kgText(Math.max(0, plan.weight.after))}{plan.weight.ratio >= 1.05 ? <>: бег продержится в ~{(Math.round(plan.weight.ratio * 10) / 10).toLocaleString('ru-RU')} раза дольше.</> : '.'}</>
              : <>Снимется {kgText(plan.weight.saving)}; общий вес из игры пока не пришёл.</>}
            {plan.weight.action && <> <span className="prep-action">{plan.weight.action.label}{plan.weight.action.nav && <> <NavigateButton target={plan.weight.action.nav} label="🧭" compact /></>}</span></>}
          </p>
        </div>
      )}
      {plan.have.length > 0 && (
        <details className="small">
          <summary className="muted">🟢 Уже есть: {plan.have.length}</summary>
          <ul>{plan.have.map((l) => <Row key={l.key} l={l} />)}</ul>
        </details>
      )}
      {profile.showLater && plan.later.length > 0 && (
        <details className="small">
          <summary className="muted">⏳ Не бери сейчас — понадобится позже: {plan.later.length}</summary>
          <ul>{plan.later.map((l) => <Row key={l.key} l={l} />)}</ul>
        </details>
      )}
      {plan.optimizations.length > 0 && (
        <details className="small" open={plan.optimizations.some((l) => l.key.startsWith('upgrade:'))}>
          <summary className="muted">⚡ Улучшения: {plan.optimizations.length}</summary>
          <ul>{plan.optimizations.map((l) => <Row key={l.key} l={l} />)}</ul>
        </details>
      )}
      <p className="small"><a className="btn btn-ghost btn-sm" href="#/shopping">🛒 Открыть закупки</a></p>
    </section>
  );
}
