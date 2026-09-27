// «Что делать сейчас» — главный элемент экрана «Путь».

import { useStore } from '../store';
import { blockerParts, blockersOf, firstOpen, nextStep } from '../lib/next-step';
import { TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { RangeHints } from './RangeHints';

export function NextStepCard({ onDone }: { onDone: (id: string) => void }) {
  const { progress, qp, steps, mode, setStep } = useStore();
  const step = nextStep(steps, progress, qp);

  if (!step) {
    const open = firstOpen(steps, progress);
    if (!open) {
      return (
        <section className="next card is-finished" aria-label="Что делать сейчас">
          <p className="eyebrow">Путь пройден</p>
          <h2 className="next-title">Все {steps.length} шагов закрыты</h2>
          <p className="muted">
            {mode === 'f2p'
              ? 'F2P-маршрут закончен. Если купил Bond — переключись на Members в шапке: откроются этапы 7–9.'
              : 'Дальше — свободная игра. Цели и навыки остаются под рукой.'}
          </p>
        </section>
      );
    }
    const b = blockersOf(open, progress, qp);
    return (
      <section className="next card" aria-label="Что делать сейчас">
        <p className="eyebrow">Что делать сейчас</p>
        <h2 className="next-title">Доступных шагов нет</h2>
        <p className="muted">
          Следующий по плану — <a href={`#/step/${open.id}`}>{open.id} {open.title}</a>
          {b && <>, но сначала: {blockerParts(b).join(', ')}</>}.
        </p>
      </section>
    );
  }

  const where = step.npc ? `${step.npc.nameEn} — ${step.npc.location}` : step.where;

  return (
    <section className={`next card ${step.membersOnly ? 'is-members' : ''}`} aria-labelledby="next-title">
      <p className="eyebrow">Что делать сейчас</p>
      <div className="next-meta">
        <code className="code">{step.id}</code>
        <TypeIcon type={step.type} />
        <span className="muted">{TYPE_LABEL[step.type]} · этап {step.stage}{step.qp ? ` · +${step.qp} QP` : ''}</span>
      </div>
      <h2 className="next-title" id="next-title">{step.title}</h2>
      {step.titleRu && <p className="next-title-ru">{step.titleRu}</p>}
      <dl className="fields">
        {where && <div className="field"><dt>Где</dt><dd><Inline text={where} /></dd></div>}
        {step.npc && <div className="field"><dt>Этаж</dt><dd>{step.npc.floor}</dd></div>}
        {step.itemsRequired && step.itemsRequired.length > 0 && (
          <div className="field"><dt>Взять</dt><dd>{step.itemsRequired.map((i) => i.nameEn).join(', ')}</dd></div>
        )}
        <div className="field is-done-when"><dt>Готово, когда</dt><dd><Inline text={step.doneWhen} /></dd></div>
      </dl>
      <RangeHints step={step} />
      <div className="actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => onDone(step.id)}>Отметить выполненным</button>
        {step.optional && (
          <button type="button" className="btn btn-lg" onClick={() => setStep(step.id, 'skipped')}>Пропустить</button>
        )}
        <a className="btn btn-ghost btn-lg" href={`#/step/${step.id}`}>Подробнее</a>
      </div>
      <p className="next-shop muted small"><a href="#/shopping">🛒 Оптовый список Grand Exchange</a> — закупка сразу на несколько этапов.</p>
      {step.foes?.length ? (
        <p className="next-shop muted small"><a href="#/gear">⚔️ Снаряжение</a> — что надеть и купить, чтобы бить быстрее на этом шаге.</p>
      ) : null}
    </section>
  );
}
