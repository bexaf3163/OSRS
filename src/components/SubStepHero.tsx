// The step view's hero: ONLY the sub-step the player is on (found from the arrow the game follows), what to do and say there, and the one button that leads
// the arrow to it; then the items that very sub-step asks for. The full walkthrough is a collapsed reference, never the thing you must read.

import { useMemo } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';
import { usePlayerState } from '../playerStateContext';
import { findSubStep, itemStatus, subStepItems, type ItemStatus, type SubStep } from '../lib/subStep';
import { Inline } from './Inline';
import { NavigateButton } from './NavigateButton';
import { ItemIcon } from './WikiDrawer';

/** The sub-step the arrow is on for this step; null while closed, offline, or on a detour. */
export function useSubStep(step: Step): SubStep | null {
  const { navTarget } = useBridge();
  const { progress } = useStore();
  const closed = isClosed(progress, step.id);
  return useMemo(() => (closed ? null : findSubStep(step, navTarget)), [step, navTarget, closed]);
}

export function SubStepHero({ step, sub }: { step: Step; sub: SubStep }) {
  const showAction = sub.action && sub.action.replace(/[.\s]+$/, '') !== sub.title.replace(/[….\s]+$/, '');
  return (
    <section className="sub-hero" aria-label="Current sub-step">
      <p className="sub-hero-kicker">
        <span className="badge badge-now">Step {sub.index} of {sub.size}</span>
        <span className="muted small">in the game now</span>
      </p>
      <h3 className="sub-hero-title">{sub.title}</h3>
      {showAction && <p className="sub-hero-action"><Inline text={sub.action} /></p>}
      {sub.dialogue.length > 0 && (
        <div className="sub-hero-say">
          <p className="subhead">Say in the dialogue</p>
          <ol className="sub-hero-options">
            {sub.dialogue.map((o, i) => <li key={i}><span>“{o}”</span></li>)}
          </ol>
        </div>
      )}
      {sub.target && (
        <div className="sub-hero-actions">
          <NavigateButton target={{ ...sub.target, stepId: step.id }} label="🧭 Lead to Target in Game" className="sub-hero-nav" />
        </div>
      )}
    </section>
  );
}

const STATUS_TEXT: Record<ItemStatus, string> = { bag: 'In Bag', bank: 'In Bank', missing: 'Missing', unknown: 'Not checked' };

export function SubStepItems({ step, sub }: { step: Step; sub: SubStep }) {
  const { state } = usePlayerState();
  const items = useMemo(() => subStepItems(step, sub), [step, sub]);
  if (!items.length) return null;
  return (
    <ul className="sub-items" aria-label="Items for this sub-step">
      {items.map((it) => {
        const status = itemStatus(state, it.name);
        return (
          <li key={it.name} className={`sub-item is-${status}`}>
            <ItemIcon src={it.iconUrl} alt="" size={24} />
            <span className="sub-item-name">{it.name}{it.count > 1 ? ` ×${it.count}` : ''}</span>
            <span className={`sub-item-badge is-${status}`}>{STATUS_TEXT[status]}</span>
          </li>
        );
      })}
    </ul>
  );
}
