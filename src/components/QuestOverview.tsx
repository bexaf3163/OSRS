// "Quest overview": the canonical walkthrough as a numbered rail. The live line is marked only when the game confirms it
// (the arrow follows a line of this step); without a link the list is an overview and says so.

import { useEffect, useRef } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { overviewCurrent, overviewOf, type SubStep } from '../lib/subStep';
import { TARGET_LABEL, targetStatus } from '../lib/linkState';

export function QuestOverview({ step, sub }: { step: Step; sub: SubStep | null }) {
  const { state, activeStepId, inGame, questInstruction } = useBridge();
  const lines = overviewOf(step);
  const current = overviewCurrent(lines, sub);
  const list = useRef<HTMLOListElement>(null);
  // On a wide screen the list scrolls inside its own box, and the box itself may reach below the window: the current line goes to the top of the box,
  // with one earlier line above it for context. Only the list moves, never the page.
  useEffect(() => {
    const ol = list.current;
    const li = ol?.querySelector<HTMLElement>('.overview-item.is-current');
    if (!ol || !li || ol.scrollHeight <= ol.clientHeight) return;
    const box = ol.getBoundingClientRect();
    const row = li.getBoundingClientRect();
    ol.scrollTop += row.top - box.top - row.height;
  }, [current, step.id]);
  if (lines.length === 0) return null;
  const live = current !== null && state === 'online' && inGame;
  const confirmedProgress = live && questInstruction?.stepId === step.id && !questInstruction.peeking;
  const saved = targetStatus(activeStepId === step.id, state, inGame) === 'saved';
  return (
    <section className="overview" aria-label="Quest overview">
      <h3 className="overview-title">Quest overview</h3>
      <ol className="overview-list" ref={list}>
        {lines.map((l) => (
          <li key={l.n} className={`overview-item ${current === l.n ? 'is-current' : confirmedProgress && current !== null && l.n < current ? 'is-past' : ''}`} aria-current={current === l.n ? 'step' : undefined}>
            <span className="overview-n" aria-hidden="true">{l.n}</span>
            <span className="overview-text">
              <span className="overview-line">{l.title}</span>
              {current === l.n && <span className="badge badge-now">{live ? questInstruction?.stepId === step.id ? questInstruction.peeking ? 'Viewing an earlier instruction' : 'In the game now' : 'Navigation target' : 'Last known'}</span>}
              {current === null && l.n === 1 && saved && <span className="badge">{TARGET_LABEL.saved}</span>}
            </span>
          </li>
        ))}
      </ol>
      {!live && <p className="muted small overview-note">Overview only. Live instructions resume when RuneLite is connected and your character is in the game.</p>}
    </section>
  );
}
