// "Sync with the account": the game knows the completed quests and the levels reached — steps with such an auto-mark
// can be closed at once. It only marks (removes nothing) and has undo.

import { useMemo, useState } from 'react';
import { stepById } from '../data';
import { useBridge } from '../bridge';
import { syncCandidates, withRequired } from '../lib/accountSync';
import { gateAllows } from '../lib/profiles';
import { withReviewed, withStep } from '../lib/progress';
import { useStore } from '../store';

/** compact — a plaque at the top of "Path" (hidden if there is nothing to mark); otherwise a card in settings. */
export function AccountSync({ compact = false }: { compact?: boolean }) {
  const { steps, progress, replace } = useStore();
  const { state, plugin, questsDone, stats, gate } = useBridge();
  const [hidden, setHidden] = useState(false);
  const allowed = gateAllows(gate);
  const list = useMemo(() => (allowed ? withRequired(steps, syncCandidates(steps, progress, questsDone, stats), progress) : []), [allowed, steps, progress, questsDone, stats]);

  const apply = () => {
    let p = progress;
    for (const c of list) {
      p = withStep(p, c.step.id, 'done');
      if (stepById.get(c.step.id)?.updatedInV2) p = withReviewed(p, [c.step.id]);
    }
    replace(p, `🎮 Steps marked from the game: ${list.length}`);
  };

  if (compact) {
    if (state !== 'online' || hidden || !list.length) return null;
    return (
      <div className="plaque plaque-tip" role="note">
        <p><strong>🎮 The game knows you have already completed {list.length} {list.length === 1 ? 'step' : 'steps'}</strong> (including the steps they need)</p>
        <details>
          <summary className="small">Which ones</summary>
          <ul className="small">{list.map((c) => <li key={c.step.id}><code className="code">{c.step.id}</code> {c.step.title} — {c.why}</li>)}</ul>
        </details>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={apply}>Mark as done</button>
          <button type="button" className="btn btn-ghost" onClick={() => setHidden(true)}>Not now</button>
        </div>
      </div>
    );
  }

  const old = state === 'online' && plugin !== null && (plugin.protocol ?? 0) < 5;
  return (
    <section className="card section-card">
      <h2 className="card-title">Account sync</h2>
      <p className="muted small">
        The plugin reports which quests are completed and which levels are reached. Steps with such an auto-mark can be closed at once without doing
        them again, together with the steps they require (those were done on the way). Use it to restore a lost progress. Steps that also need items
        are not touched, and notes cannot be read back from the game. It only marks, it removes nothing.
      </p>
      {state !== 'online' && <p className="muted small">No link with RuneLite — start the game with the plugin.</p>}
      {old && <p className="notice small">Plugin 2.12 (protocol 5) is needed: restart RuneLite from the app.</p>}
      {state === 'online' && !old && !gateAllows(gate) && <p className="notice small">The game has a different character than this profile — choose the profile above.</p>}
      {state === 'online' && !old && gateAllows(gate) && (questsDone === null
        ? <p className="muted small">The quests have not come from the game yet — log in to the game (data sending must be turned on in the plugin).</p>
        : list.length === 0
          ? <p className="muted small">✓ Everything the game knows is already marked ({questsDone.length} quests completed).</p>
          : (
            <>
              <ul className="small">{list.map((c) => <li key={c.step.id}><code className="code">{c.step.id}</code> {c.step.title} — {c.why}</li>)}</ul>
              <div className="actions"><button type="button" className="btn btn-primary" onClick={apply}>Mark {list.length} steps</button></div>
            </>
          ))}
    </section>
  );
}
