// A stage section with its list of steps.
import { useId } from 'react';
import type { Stage, Step } from '../types';
import { BASE_QP } from '../data';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';
import { stageQuestPoints } from '../lib/qp';
import { IconCheck, IconChevron } from './Icons';
import { ProgressBar } from './ProgressBar';
import { StepCard } from './StepCard';

interface Props {
  stage: Stage;
  steps: Step[];
  open: boolean;
  current: boolean;
  onToggle: () => void;
  expanded: Set<string>;
  onToggleStep: (id: string) => void;
  onDone: (id: string) => void;
}

export function StageSection({ stage, steps, open, current, onToggle, expanded, onToggleStep, onDone }: Props) {
  const { progress, steps: all } = useStore();
  const closed = steps.filter((s) => isClosed(progress, s.id)).length;
  const complete = closed === steps.length;
  const qpAtEnd = stageQuestPoints(all, stage.id, BASE_QP);
  const bodyId = useId();

  return (
    <section className={`stage ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''} ${stage.membersOnly ? 'is-members' : ''}`}
      id={`stage-${stage.id}`} aria-labelledby={`${bodyId}-h`}>
      <h2 className="stage-head" id={`${bodyId}-h`}>
        <button type="button" className="stage-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="stage-num">{complete ? <IconCheck /> : stage.id}</span>
          <span className="stage-name">
            <span className="stage-kicker">
              Stage {stage.id}{stage.membersOnly && ' · 👑 Members'}{current && ' · current'}
            </span>
            <span className="stage-title">{stage.title}</span>
          </span>
          <span className="stage-count">{closed} / {steps.length}<span className="visually-hidden"> steps</span></span>
          <IconChevron className="chevron" />
        </button>
      </h2>
      <ProgressBar value={steps.length ? closed / steps.length : 0} label={`Stage ${stage.id}: steps done`} />
      <div className={`collapse ${open ? 'is-open' : ''}`} id={bodyId} inert={!open}>
        <div className="collapse-inner">
          <ol className="steps">
            {steps.map((s) => (
              <StepCard key={s.id} step={s} open={expanded.has(s.id)} onToggle={() => onToggleStep(s.id)} onDone={onDone} />
            ))}
          </ol>
          <p className="stage-summary muted small">Quest points by the end of the stage: {qpAtEnd}</p>
        </div>
      </div>
    </section>
  );
}
