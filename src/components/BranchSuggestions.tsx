// "⚡ A quick variant for your stats": a teleport, a canoe, a shortcut — if the level allows.
// Levels — from RuneLite, and without it — entered by hand in "Skills". The step's ordinary path stays as it is.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { conditionLabel, evaluateBranches, formatSaving, reasonLabel, type BranchResult } from '../lib/branching';
import { Inline } from './Inline';

export function BranchSuggestions({ step }: { step: Step }) {
  const { progress, steps } = useStore();
  const { stats, owned, enabled, branchChoice, chooseBranch } = useBridge();
  if (!step.branches?.length) return null;
  const results = evaluateBranches(step, { stats, owned, progress, steps });
  const available = results.filter((r) => r.status === 'available');
  const unknown = results.filter((r) => r.status === 'unknown');
  const locked = results.filter((r) => r.status === 'locked');
  const chosen = branchChoice[step.id];

  const card = (r: BranchResult, kind: 'available' | 'unknown') => {
    const { branch } = r;
    const isChosen = chosen === branch.id;
    return (
      <li key={branch.id} className={`branch is-${kind} ${isChosen ? 'is-chosen' : ''}`}>
        <p className="branch-head">
          <strong>⚡ {branch.label}</strong>
          <span className="muted small">
            {kind === 'available'
              ? ` · ${reasonLabel(r)}`
              : ` · needs ${conditionLabel(branch.condition)}`}
          </span>
          {branch.timeSavingSeconds ? <span className="badge badge-qp">saves {formatSaving(branch.timeSavingSeconds)}</span> : null}
        </p>
        {branch.replacementText && <p className="branch-text"><Inline text={branch.replacementText} /></p>}
        {r.missing?.length ? (
          <p className="branch-missing small" role="note">
            {r.missing.every((m) => m.certain)
              ? <>⚠ Missing: {r.missing.map((m) => `${m.label} (have ${m.have} of ${m.need})`).join(', ')}. Take or buy it before the variant works.</>
              : <>⚠ I do not see in the bag: {r.missing.map((m) => `${m.label} (${m.have} of ${m.need})`).join(', ')}. It may be in the bank — open the bank and I will check.</>}
          </p>
        ) : branch.needs?.length ? (
          <p className="muted small">Bring with you: {branch.needs.map((n) => `${n.label}${n.count > 1 ? ` ×${n.count}` : ''}`).join(', ')}.</p>
        ) : null}
        {kind === 'available' && enabled && branch.replacementTarget && !r.missing?.some((m) => m.certain) && (
          <button type="button" className={`btn btn-sm ${isChosen ? 'btn-ingame-active' : ''}`}
            onClick={() => chooseBranch(step, isChosen ? null : branch.id)} aria-pressed={isChosen}>
            {isChosen ? '✓ This variant leads in the game — return the ordinary one' : '🧭 Lead in the game by this route'}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="step-section branches" aria-label="Quick variants">
      <h4 className="subhead">⚡ {available.length ? 'A quick variant for your stats' : 'Quick variants'}</h4>
      {(available.length > 0 || unknown.length > 0) && (
        <ul className="branch-list">
          {available.map((r) => card(r, 'available'))}
          {unknown.map((r) => card(r, 'unknown'))}
        </ul>
      )}
      {unknown.length > 0 && (
        <p className="muted small">The level is unknown: start RuneLite with the bridge or enter the level on the "Skills" page.</p>
      )}
      {locked.length > 0 && (
        <ul className="branch-locked">
          {locked.map((r) => (
            <li key={r.branch.id} className="muted small">
              🔒 {r.branch.label} — needs {conditionLabel(r.branch.condition)}
              {typeof r.have === 'number' && r.branch.condition.type === 'SKILL_LEVEL' ? `, you have ${r.have}` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">The ordinary path below works too — the quick variant only shortens it.</p>
    </section>
  );
}
