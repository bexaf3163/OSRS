// «Готовность к шагу»: светофор и что сделать до выхода — у каждой проблемы своё действие.
// Расчёт — lib/readiness.ts; здесь только показ. Шаг без требований и предметов панели не получает.

import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from '../lib/next-step';
import { STATUS_TEXT, type ReadinessAction, type RequirementStatus, type StepReadiness } from '../lib/readiness';
import { useReadiness, useReadinessEngine } from '../readinessContext';
import { NavigateButton } from './NavigateButton';
import { PrepRouteBlock } from './PrepRoute';

export { useReadiness };

const MARK: Record<RequirementStatus['state'], string> = { OK: '✓', BANK: '🏦', PARTIAL: '◐', MISSING: '✗', UNKNOWN: '?' };

function Action({ a }: { a: ReadinessAction }) {
  if (a.kind === 'nav') return <NavigateButton target={a.target} label={a.label} />;
  return <a className="btn btn-ghost btn-sm" href={a.href}>{a.label}</a>;
}

function Row({ r }: { r: RequirementStatus }) {
  return (
    <li className={`ready-row is-${r.state.toLowerCase()}`}>
      <span className="ready-mark" aria-hidden="true">{MARK[r.state]}</span>
      <span className="ready-text">
        <strong>{r.label}</strong>
        {!r.hard && <span className="muted"> · по ходу квеста</span>}
        {r.detail && <span className="muted"> — {r.detail}</span>}
      </span>
      {r.action && <span className="ready-action"><Action a={r.action} /></span>}
    </li>
  );
}

/** «✓ Цель шага уже выполнена»: уровни не ниже цели — качать заново не нужно, шаг можно закрыть. */
function GoalMet({ step, r }: { step: Step; r: StepReadiness }) {
  const { setStep } = useStore();
  if (!r.goalMet) return null;
  const fromGame = r.goalMet.every((g) => g.source === 'game');
  return (
    <section className="readiness is-ready" aria-label="Цель шага">
      <p className="readiness-head" role="status">
        🟢 <strong>Цель шага уже выполнена</strong>: {r.goalMet.map((g) => `${g.skill} ${g.have} (нужно ${g.level})`).join(', ')}
        <span className="muted"> — {fromGame ? 'по данным игры' : 'по уровням из профиля'}. Качать заново не нужно.</span>
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(step.id, 'done', `${step.id} закрыт: цель уже выполнена`)}>
          ✓ Отметить выполненным
        </button>
      </div>
    </section>
  );
}

/** «🧩 Цепочка до готовности»: что пройти по порядку, чтобы шаг открылся (до трёх звеньев вглубь). */
function Chain({ step }: { step: Step }) {
  const chain = useReadinessEngine().chain(step);
  if (!chain.length) return null;
  return (
    <details className="ready-chain" open>
      <summary className="small">🧩 Цепочка до готовности: {chain.length + 1} {chain.length === 1 ? 'шаг' : 'шага'}</summary>
      <ol className="small">
        {chain.map((l) => (
          <li key={l.step.id}>
            <a href={`#/step/${l.step.id}`}><strong>{l.step.id}</strong> {l.step.title}</a>
            {l.why.length > 0 && <span className="muted"> — ещё нужно: {l.why.map((w) => w.label).join(', ')}</span>}
          </li>
        ))}
        <li><strong>{step.id}</strong> {step.title} — этот шаг</li>
      </ol>
    </details>
  );
}

export function ReadinessPanel({ step }: { step: Step }) {
  const { progress } = useStore();
  const { navTarget, clearNav } = useBridge();
  const r = useReadiness(step);
  if (!r || isClosed(progress, step.id)) return null;
  if (r.goalMet && !r.problems.length) return <GoalMet step={step} r={r} />;
  if (!r.requirements.length) return null;
  const s = STATUS_TEXT[r.status];
  const detour = navTarget?.stepId === step.id ? navTarget : null;
  const ok = r.requirements.filter((x) => x.state === 'OK');
  return (
    <section className={`readiness is-${r.status.toLowerCase()}`} aria-label="Готовность к шагу">
      <p className="readiness-head" role="status"><span aria-hidden="true">{s.icon}</span> <strong>{s.text}</strong></p>
      {detour && (
        // Обход: стрелка в игре ведёт за подготовкой; когда предмет окажется в сумке (или ты дойдёшь до места),
        // плагин сам снимет цель, и стрелка вернётся к этому шагу.
        <p className="small readiness-detour">
          ⚡ Подготовка: {detour.label}. Вернёмся к {step.id}, когда {detour.itemName ? `${detour.itemName} будет в сумке` : 'дойдёшь до места'}.{' '}
          <button type="button" className="link-btn" onClick={() => void clearNav()}>Вернуться к шагу сейчас</button>
        </p>
      )}
      <PrepRouteBlock step={step} />
      {r.problems.length > 0 && <ul className="ready-list">{r.problems.map((x) => <Row key={`${x.kind}-${x.label}`} r={x} />)}</ul>}
      <Chain step={step} />
      {r.unknown.length > 0 && (
        <details className="ready-unknown">
          <summary className="small">⚪ Не проверено: {r.unknown.length}</summary>
          <ul className="ready-list">{r.unknown.map((x) => <Row key={`${x.kind}-${x.label}`} r={x} />)}</ul>
        </details>
      )}
      {ok.length > 0 && (
        <p className="small ready-ok">✓ {ok.map((x) => x.label).join(' · ')}</p>
      )}
    </section>
  );
}

/** Одна строка для «Что делать сейчас»: светофор и главное, что мешает. */
export function ReadinessLine({ step }: { step: Step }) {
  const r = useReadiness(step);
  if (r?.goalMet && !r.problems.length) {
    return (
      <p className="readiness-line is-ready">
        🟢 Цель шага уже выполнена: {r.goalMet.map((g) => `${g.skill} ${g.have}`).join(', ')} — качать заново не нужно.{' '}
        <a href={`#/step/${step.id}`}>Подробнее</a>
      </p>
    );
  }
  if (!r || !r.requirements.length) return null;
  const s = STATUS_TEXT[r.status];
  const first = r.problems[0];
  return (
    <p className={`readiness-line is-${r.status.toLowerCase()}`}>
      <span aria-hidden="true">{s.icon}</span> {s.text}
      {first && <>: <strong>{first.label}</strong>{first.detail ? <span className="muted"> — {first.detail}</span> : null}</>}
      {r.problems.length > 1 && <span className="muted"> (и ещё {r.problems.length - 1})</span>}
      {' '}<a href={`#/step/${step.id}`}>Подробнее</a>
    </p>
  );
}
