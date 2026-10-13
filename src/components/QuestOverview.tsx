// "Quest overview": the canonical walkthrough as a numbered rail. The live line is marked only when the game confirms it
// (the arrow follows a line of this step); without a link the list is an overview and says so.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { overviewCurrent, overviewOf, type SubStep } from '../lib/subStep';
import { TARGET_LABEL, targetStatus } from '../lib/linkState';

export function QuestOverview({ step, sub }: { step: Step; sub: SubStep | null }) {
  const { state, activeStepId, inGame } = useBridge();
  const lines = overviewOf(step);
  if (lines.length === 0) return null;
  const current = overviewCurrent(lines, sub);
  const live = current !== null && state === 'online' && inGame;
  const saved = targetStatus(activeStepId === step.id, state, inGame) === 'saved';
  return (
    <section className="overview" aria-label="Quest overview">
      <h3 className="overview-title">Quest overview</h3>
      <ol className="overview-list">
        {lines.map((l) => (
          <li key={l.n} className={`overview-item ${current === l.n ? 'is-current' : current !== null && l.n < current ? 'is-past' : ''}`} aria-current={current === l.n ? 'step' : undefined}>
            <span className="overview-n" aria-hidden="true">{l.n}</span>
            <span className="overview-text">
              <span className="overview-line">{l.title}</span>
              {current === l.n && <span className="badge badge-now">{live ? 'In the game now' : 'Last known'}</span>}
              {current === null && l.n === 1 && saved && <span className="badge">{TARGET_LABEL.saved}</span>}
            </span>
          </li>
        ))}
      </ol>
      {!live && <p className="muted small overview-note">Overview only. Live instructions resume when RuneLite is connected and your character is in the game.</p>}
    </section>
  );
}
