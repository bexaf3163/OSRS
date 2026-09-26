// Шаг в списке этапа: чекбокс, код, значок, название; по клику — подробности.

import { useId } from 'react';
import type { Field, Step } from '../types';
import { levelById } from '../data';
import { useStore } from '../store';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { levelOf } from '../lib/progress';
import { IconCheck, IconChevron, IconLock, TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { LevelInput } from './LevelInput';
import { RangeHints } from './RangeHints';

const WARN_LABELS = new Set(['Опасно', 'Внимание']);

interface Props {
  step: Step;
  open: boolean;
  onToggle: () => void;
}

export function StepItem({ step, open, onToggle }: Props) {
  const { progress, qp, setStep } = useStore();
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);
  const detailsId = useId();

  return (
    <li id={`step-${step.id}`} className={`step ${status ? `is-${status}` : ''} ${blockers ? 'is-blocked' : ''} ${open ? 'is-open' : ''}`}>
      <div className="step-row">
        <label className="check">
          <input type="checkbox" checked={status === 'done'}
            onChange={(e) => setStep(step.id, e.target.checked ? 'done' : null)}
            aria-label={`${step.id} ${step.title}`} />
          <span className="check-box" aria-hidden="true"><IconCheck /></span>
        </label>
        <button type="button" className="step-toggle" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
          <code className="code">{step.id}</code>
          <TypeIcon type={step.type} />
          <span className="step-text">
            <span className="step-title">{step.title}</span>
            {status === 'skipped' && <span className="tag">пропущено</span>}
            {step.optional && status !== 'skipped' && <span className="tag">необязательный</span>}
            {blockers && (
              <span className="step-blocked"><IconLock />Сначала: {blockerParts(blockers).join(', ')}</span>
            )}
          </span>
          <IconChevron className="chevron" />
        </button>
      </div>
      {open && <StepDetails id={detailsId} step={step} />}
    </li>
  );
}

function FieldRow({ field }: { field: Field }) {
  if (!field.label) return <div className="field field-plain"><dd><Inline text={field.text} /></dd></div>;
  return (
    <div className={`field ${WARN_LABELS.has(field.label) ? 'is-warn' : ''} ${field.key === 'doneWhen' ? 'is-done-when' : ''}`}>
      <dt>{field.label}</dt>
      <dd><Inline text={field.text} /></dd>
    </div>
  );
}

export function StepDetails({ step, id }: { step: Step; id?: string }) {
  const { progress, qp, setStep, setNote } = useStore();
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);

  return (
    <div className="step-details" id={id}>
      <p className="muted small">{TYPE_LABEL[step.type]} · этап {step.stage}{step.qp ? ` · +${step.qp} QP` : ''}</p>
      <dl className="fields">
        {step.fields.map((f, i) => <FieldRow key={i} field={f} />)}
      </dl>

      {(step.requires.length > 0 || step.minQp !== undefined) && (
        <p className="requires">
          <span className="muted">Зависит от: </span>
          {step.requires.map((r, i) => (
            <span key={r}>
              {i > 0 && ', '}
              <a href={`#/step/${r}`} className={`step-ref ${isClosed(progress, r) ? 'is-met' : ''}`}>{r}</a>
              {isClosed(progress, r) && <span className="visually-hidden"> (выполнено)</span>}
            </span>
          ))}
          {step.minQp !== undefined && (
            <span className={qp >= step.minQp ? 'is-met' : ''}>
              {step.requires.length ? ', ' : ''}очки квестов ≥ {step.minQp} (сейчас {qp})
            </span>
          )}
        </p>
      )}
      {blockers && <p className="notice small">Шаг можно отметить и сейчас, но по плану сначала: {blockerParts(blockers).join(', ')}.</p>}

      {step.targets && step.targets.length > 0 && (
        <div className="targets">
          <h4 className="subhead">Уровни</h4>
          <div className="targets-grid">
            {step.targets.map((t) => {
              const name = levelById.get(t.skill)?.name ?? t.skill;
              const reached = levelOf(progress, t.skill) >= t.level;
              return (
                <div key={t.skill} className={`target ${reached ? 'is-reached' : ''}`}>
                  <LevelInput id={t.skill} label={name} compact />
                  <span className="target-goal">цель {t.level}{reached && <IconCheck />}</span>
                </div>
              );
            })}
          </div>
          <RangeHints step={step} />
        </div>
      )}

      <div className="note">
        <label htmlFor={`note-${step.id}`} className="subhead">Моя заметка</label>
        <textarea id={`note-${step.id}`} rows={2} value={progress.notes[step.id] ?? ''}
          placeholder="Например: в банке 12 шкур из 25"
          onChange={(e) => setNote(step.id, e.target.value)} />
      </div>

      <div className="actions">
        {status === 'done'
          ? <button type="button" className="btn" onClick={() => setStep(step.id, null)}>Снять отметку</button>
          : <button type="button" className="btn btn-primary" onClick={() => setStep(step.id, 'done')}>Сделано</button>}
        {step.optional && (status === 'skipped'
          ? <button type="button" className="btn" onClick={() => setStep(step.id, null)}>Вернуть в план</button>
          : status !== 'done' && <button type="button" className="btn" onClick={() => setStep(step.id, 'skipped')}>Пропустить</button>)}
      </div>
    </div>
  );
}
