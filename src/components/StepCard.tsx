// Карточка шага: шапка в списке и подробности по секциям.
// Порядок: статус → название → контекст (NPC, место) → предметы → действия → советы → завершение.

import { useId, useState } from 'react';
import type { Field, Step, StepItemRequirement } from '../types';
import { levelById } from '../data';
import { useStore } from '../store';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { levelOf } from '../lib/progress';
import { needsReview } from '../lib/review';
import { IconCheck, IconChevron, IconExternal, IconLock, TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { LevelInput } from './LevelInput';
import { RangeHints } from './RangeHints';
import { StepImage } from './StepImage';
import { ItemIcon, useWiki } from './WikiDrawer';

const WARN_LABELS = new Set(['Опасно', 'Внимание', 'Бой']);

interface Props {
  step: Step;
  open: boolean;
  onToggle: () => void;
  onDone: (id: string) => void;
}

export function StepCard({ step, open, onToggle, onDone }: Props) {
  const { progress, qp, setStep } = useStore();
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);
  const review = needsReview(step, progress);
  const detailsId = useId();
  // Подробности монтируются при первом раскрытии и дальше только сворачиваются — анимация без скачков.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const cls = ['step', status ? `is-${status}` : '', blockers ? 'is-blocked' : '', open ? 'is-open' : '',
    review ? 'is-review' : '', step.membersOnly ? 'is-members' : '', step.optional ? 'is-optional' : ''].filter(Boolean).join(' ');

  return (
    <li id={`step-${step.id}`} className={cls}>
      <div className="step-row">
        <label className="check">
          <input type="checkbox" checked={status === 'done'}
            onChange={(e) => (e.target.checked ? onDone(step.id) : setStep(step.id, null))}
            aria-label={`${step.id} ${step.title}`} />
          <span className="check-box" aria-hidden="true"><IconCheck /></span>
        </label>
        <button type="button" className="step-toggle" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
          <code className="code step-code">{step.id}</code>
          <TypeIcon type={step.type} />
          <span className="step-text">
            <span className="step-title">{step.title}</span>
            {step.titleRu && <span className="step-title-ru">{step.titleRu}</span>}
            <span className="step-badges">
              {step.qp ? <span className="badge badge-qp">+{step.qp} QP</span> : null}
              {status === 'skipped' && <span className="tag">пропущено</span>}
              {step.optional && status !== 'skipped' && <span className="tag">необязательный</span>}
              {review && <span className="badge badge-review">V2: проверь</span>}
            </span>
            {blockers && (
              <span className="step-blocked"><IconLock />Сначала: {blockerParts(blockers).join(', ')}</span>
            )}
          </span>
          <IconChevron className="chevron" />
        </button>
      </div>
      <div className={`collapse ${open ? 'is-open' : ''}`} id={detailsId} inert={!open}>
        <div className="collapse-inner">
          {mounted && <StepBody step={step} onDone={onDone} />}
        </div>
      </div>
    </li>
  );
}

function amountText(a: string | number): string {
  return typeof a === 'number' ? `×${a.toLocaleString('ru-RU')}` : /^\d/.test(a) ? `×${a}` : a;
}

function ItemChip({ item }: { item: StepItemRequirement }) {
  const { openItem } = useWiki();
  return (
    <li>
      <button type="button" className="item-chip" onClick={() => openItem(item.wikiItemId ?? item.nameEn, item.nameEn)}
        title="Открыть в инспекторе OSRS Wiki">
        <span className="item-chip-head">
          <ItemIcon src={item.iconUrl} alt="" />
          <span className="item-chip-name">
            <strong>{item.nameEn}</strong> <span className="muted">({item.nameRu})</span> <strong className="item-amount">{amountText(item.amount)}</strong>
          </span>
          <span className="item-chip-lens" aria-hidden="true">🔍</span>
        </span>
        {item.howToGet && <span className="item-chip-how"><Inline text={item.howToGet} /></span>}
      </button>
    </li>
  );
}

function FieldRow({ field }: { field: Field }) {
  return (
    <div className={`field ${WARN_LABELS.has(field.label) ? 'is-warn' : ''}`}>
      <dt>{field.label}</dt>
      <dd><Inline text={field.text} /></dd>
    </div>
  );
}

export function StepBody({ step, onDone }: { step: Step; onDone: (id: string) => void }) {
  const { progress, qp, mode, setStep, setNote, review, reactivate } = useStore();
  const { openNpc } = useWiki();
  const status = progress.steps[step.id];
  const blockers = isClosed(progress, step.id) ? null : blockersOf(step, progress, qp);
  const reviewing = needsReview(step, progress);
  const links = [
    step.wikiUrl && { href: step.wikiUrl, label: 'Wiki' },
    step.quickGuideUrl && { href: step.quickGuideUrl, label: 'Quick Guide' },
    step.mapUrl && { href: step.mapUrl, label: '🗺️ Карта' },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div className="step-details">
      <div className="step-meta-row">
        <span className="muted small">{TYPE_LABEL[step.type]} · этап {step.stage}</span>
        {links.length > 0 && (
          <span className="link-chips">
            {links.map((l) => (
              <a key={l.label} className="link-chip" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label} <IconExternal />
              </a>
            ))}
          </span>
        )}
      </div>

      {reviewing && (
        <div className="plaque plaque-review" role="note">
          <p><strong>⚠️ Новое в версии V2:</strong> {step.v2ChangesSummary}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => reactivate([step.id])}>Сбросить в активные</button>
            <button type="button" className="btn btn-primary" onClick={() => review([step.id])}>Подтвердить и закрыть</button>
          </div>
        </div>
      )}

      {step.npc ? (
        <section className="plaque plaque-npc" aria-label="NPC и точка старта">
          <button type="button" className="npc-name" onClick={() => openNpc(step.npc!)} title="Открыть в инспекторе OSRS Wiki">
            {step.npc.nameEn} <span className="muted">({step.npc.nameRu})</span> <span aria-hidden="true">🔍</span>
          </button>
          <p><Inline text={step.npc.location} /></p>
          <p className="npc-badges">
            <span className="badge badge-floor">Floor: {step.npc.floor}</span>
            {step.npc.dialogue && <span className="badge badge-dialogue">Диалог: {step.npc.dialogue}</span>}
          </p>
        </section>
      ) : step.where ? (
        <section className="plaque plaque-npc" aria-label="Место">
          <p><Inline text={step.where} /></p>
          {step.floor && <p className="npc-badges"><span className="badge badge-floor">Floor: {step.floor}</span></p>}
        </section>
      ) : null}
      {step.npc && step.where && <p><Inline text={step.where} /></p>}

      {step.how && <p className="step-how"><Inline text={step.how} /></p>}
      {step.bring && <p className="small"><span className="muted">Взять: </span><Inline text={step.bring} /></p>}

      {step.itemsRequired && step.itemsRequired.length > 0 && (
        <section className="step-section">
          <h4 className="subhead">Что взять с собой</h4>
          <ul className="item-grid">{step.itemsRequired.map((it, i) => <ItemChip key={`${it.nameEn}-${i}`} item={it} />)}</ul>
        </section>
      )}
      {step.itemsRecommended && step.itemsRecommended.length > 0 && (
        <section className="step-section">
          <h4 className="subhead">Рекомендуется взять</h4>
          <ul className="item-grid">{step.itemsRecommended.map((it, i) => <ItemChip key={`${it.nameEn}-${i}`} item={it} />)}</ul>
        </section>
      )}

      {step.imageUrl && <StepImage src={step.imageUrl} caption={step.imageCaption} />}

      {step.quickSteps && step.quickSteps.length > 0 && (
        <section className="step-section">
          <h4 className="subhead">Прохождение</h4>
          <ol className="quick-steps">{step.quickSteps.map((q, i) => <li key={i}><Inline text={q} /></li>)}</ol>
        </section>
      )}

      {step.fields && step.fields.length > 0 && (
        <dl className="fields">{step.fields.map((f, i) => <FieldRow key={i} field={f} />)}</dl>
      )}

      {step.proTip && <div className="plaque plaque-tip"><strong>Совет:</strong> <Inline text={step.proTip} /></div>}
      {step.safespot && <div className="plaque plaque-safespot"><strong>🛡️ Safespot:</strong> <Inline text={step.safespot} /></div>}
      {mode === 'members' && step.membersAlternative && (
        <div className="plaque plaque-members"><Inline text={step.membersAlternative} /></div>
      )}
      {step.reward && <p className="step-reward"><span className="muted">Награда: </span><Inline text={step.reward} /></p>}

      {(step.requires.length > 0 || step.minQp !== undefined) && (
        <p className="requires small">
          <span className="muted">Зависит от: </span>
          {step.requires.map((r, i) => (
            <span key={r}>
              {i > 0 && ', '}
              <a href={`#/step/${r}`} className={`step-ref ${isClosed(progress, r) ? 'is-met' : ''}`}>{r}</a>
              {isClosed(progress, r) && <span className="visually-hidden"> (выполнено)</span>}
            </span>
          ))}
          {step.minQp !== undefined && (
            <span className={qp >= step.minQp ? 'is-met' : ''}>{step.requires.length ? ', ' : ''}очки квестов ≥ {step.minQp} (сейчас {qp})</span>
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

      <div className="plaque plaque-done"><strong>Готово, когда:</strong> <Inline text={step.doneWhen} /></div>

      <div className="note">
        <label htmlFor={`note-${step.id}`} className="subhead">Моя заметка</label>
        <textarea id={`note-${step.id}`} rows={2} value={progress.notes[step.id] ?? ''}
          placeholder="Например: в банке 12 шкур из 25"
          onChange={(e) => setNote(step.id, e.target.value)} />
      </div>

      <div className="actions">
        {status === 'done'
          ? <button type="button" className="btn" onClick={() => setStep(step.id, null)}>Снять отметку</button>
          : <button type="button" className="btn btn-primary btn-lg" onClick={() => onDone(step.id)}><IconCheck /> Отметить выполненным</button>}
        {step.optional && (status === 'skipped'
          ? <button type="button" className="btn" onClick={() => setStep(step.id, null)}>Вернуть в план</button>
          : status !== 'done' && <button type="button" className="btn" onClick={() => setStep(step.id, 'skipped')}>Пропустить</button>)}
      </div>
    </div>
  );
}
