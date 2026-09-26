// «Что делать сейчас» — главный элемент экрана «Путь».

import { steps } from '../data';
import { useStore } from '../store';
import { blockerParts, blockersOf, firstOpen, nextStep } from '../lib/next-step';
import { TypeIcon, TYPE_LABEL } from './Icons';
import { Inline } from './Inline';
import { RangeHints } from './RangeHints';

export function NextStepCard() {
  const { progress, qp, setStep } = useStore();
  const step = nextStep(steps, progress, qp);

  if (!step) {
    const open = firstOpen(steps, progress);
    if (!open) {
      return (
        <section className="next card is-finished" aria-label="Что делать сейчас">
          <p className="eyebrow">Путь пройден</p>
          <h2 className="next-title">Все {steps.length} шагов закрыты</h2>
          <p className="muted">Дальше — свободная игра. Цели и навыки остаются под рукой.</p>
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

  const main: [string, string | undefined][] = [
    ['Где', step.where],
    ['Взять', step.bring],
    ['Готово, когда', step.doneWhen],
  ];

  return (
    <section className="next card" aria-labelledby="next-title">
      <p className="eyebrow">Что делать сейчас</p>
      <div className="next-meta">
        <code className="code">{step.id}</code>
        <TypeIcon type={step.type} />
        <span className="muted">{TYPE_LABEL[step.type]} · этап {step.stage}{step.qp ? ` · +${step.qp} QP` : ''}</span>
      </div>
      <h2 className="next-title" id="next-title">{step.title}</h2>
      <dl className="fields">
        {main.filter(([, v]) => v).map(([label, v]) => (
          <div key={label} className={`field ${label === 'Готово, когда' ? 'is-done-when' : ''}`}>
            <dt>{label}</dt>
            <dd><Inline text={v!} /></dd>
          </div>
        ))}
      </dl>
      <RangeHints step={step} />
      <div className="actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep(step.id, 'done')}>Сделано</button>
        {step.optional && (
          <button type="button" className="btn btn-lg" onClick={() => setStep(step.id, 'skipped')}>Пропустить</button>
        )}
        <a className="btn btn-ghost btn-lg" href={`#/step/${step.id}`}>Подробнее</a>
      </div>
    </section>
  );
}
