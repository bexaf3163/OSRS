// What the player is doing right now: the current action of a step, whether the companion is connected and whether the target is saved.
// The two workspaces that use it are the cockpit (the big window) and the companion strip (the compact view).

import type { ReactNode } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from '../lib/next-step';
import { LINK_LABEL, linkStatus, TARGET_LABEL, targetStatus } from '../lib/linkState';
import { IconTalk, TypeIcon } from './Icons';
import { Inline } from './Inline';
import { useSubStep } from './SubStepHero';
import { alternativeAt, overviewOf, subStepNpcInfo } from '../lib/subStep';

/** The place line of a step: where it starts and on which floor. */
export function placeOf(step: Step): string {
  const floor = step.npc?.floor ?? step.floor;
  const where = step.npc?.location ?? step.where ?? '';
  return [where, floor].filter(Boolean).join(' · ');
}

export function CurrentAction({ step, children }: { step: Step; children?: ReactNode }) {
  const { progress } = useStore();
  const { enabled, state, inGame, activeStepId, navTarget, questInstruction } = useBridge();
  const sub = useSubStep(step);
  const closed = isClosed(progress, step.id);
  const link = linkStatus(state, inGame);
  const target = targetStatus(activeStepId === step.id || navTarget?.stepId === step.id, state, inGame);
  // The quest's starting NPC is not the location of every later instruction.
  const npc = sub ? subStepNpcInfo(step, sub) : null;
  const place = sub ? npc ? [npc.location, npc.floor].filter(Boolean).join(' · ') : null : placeOf(step);

  // Live evidence (the arrow follows a line of this step) names the instruction. Without it the card names where the step starts and says so.
  const start = step.npc ? `Talk to ${step.npc.nameEn}` : overviewOf(step)[0]?.title ?? step.quickSteps?.[0] ?? step.title;
  const title = closed ? 'This step is done' : sub ? sub.title : start;
  const confirmed = state === 'online' && inGame && questInstruction?.stepId === step.id;
  const kicker = closed ? 'Completed' : sub ? confirmed ? questInstruction.peeking ? 'Viewing an earlier instruction' : 'What to do now' : 'Navigation target' : 'Starting point';
  const alternative = step.type === 'quest' ? alternativeAt(title) : -1;

  return (
    <section className={`current-action ${closed ? 'is-done' : ''}`} aria-label="Current action">
      <span className="current-action-icon" aria-hidden="true">{step.npc ? <IconTalk /> : <TypeIcon type={step.type} />}</span>
      <div className="current-action-body">
        <p className="eyebrow">{kicker}</p>
        <h3 className="current-action-title">{alternative > 0 ? <><Inline text={title.slice(0, alternative)} />{' '}<span className="action-alternative"><Inline text={title.slice(alternative + 1)} /></span></> : <Inline text={title} />}</h3>
        {place && <p className="current-action-place muted"><Inline text={place} /></p>}
      </div>
      <div className="current-action-side">
      {enabled && !closed && link !== 'connected' && (
        <div className="current-action-link">
          {state === 'online' ? (
            <p className={`link-chip-status is-${link}`} role="status">
              <span aria-hidden="true">○</span> {LINK_LABEL[link]}
              {target === 'live' && <> · {TARGET_LABEL.live}</>}
            </p>
          ) : (
            <p className="link-chip-status is-offline" role="status">
              <span aria-hidden="true">⚠</span>{' '}
              {state === 'connecting'
                ? LINK_LABEL.connecting
                : target === 'saved'
                  ? 'RuneLite is offline. Target saved; live guidance is inactive.'
                  : 'RuneLite is offline. Live guidance is inactive.'}
            </p>
          )}
        </div>
      )}
      {children}
      </div>
    </section>
  );
}
