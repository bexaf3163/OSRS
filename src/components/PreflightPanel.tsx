// "🧳 Departure check": which of the step's items are already in the bag — from RuneLite data, with no manual refresh.
// A step is checked when it is shown in the game ("Show in the game"): the plugin counts the bag and bank for it specifically.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { nameKey } from '../lib/checklist';
import { evaluatePreflight, preflightItems } from '../lib/checklist';

export function PreflightPanel({ step }: { step: Step }) {
  const { state, inGame, activeStepId, owned, questsDone } = useBridge();
  const { progress } = useStore();
  const items = preflightItems(step);
  if (items.length === 0 || state !== 'online') return null;

  // The quest is handed in (a mark in the app or the quest list from the game) — the bag no longer needs checking: the items are spent or handed over.
  const finished = progress.steps[step.id] === 'done'
    || (step.type === 'quest' && (questsDone ?? []).some((q) => nameKey(q) === nameKey(step.title)));

  let body;
  if (finished) {
    body = <p className="small preflight-verdict is-ready" role="status">✓ The step is done — the departure check is no longer needed.</p>;
  } else if (activeStepId !== step.id) {
    body = <p className="muted small">Press "Show in the game" — the bag for this step will be checked by itself.</p>;
  } else if (!inGame || !owned) {
    body = <p className="muted small">Log in to the game in RuneLite — the bag will be checked by itself.</p>;
  } else {
    const r = evaluatePreflight(items, owned);
    body = (
      <>
        <ul className="preflight-list">
          {r.rows.map(({ item, have, inBank, state: s }) => (
            <li key={item.nameEn} className={`preflight-row is-${s === 'IN_BAG_READY' ? 'ok' : s === 'MISSING_FROM_BAG' ? 'missing' : 'absent'}`}>
              <span className="preflight-mark" aria-hidden="true">{s === 'IN_BAG_READY' ? '✓' : '✗'}</span>
              <span className="preflight-name">
                {item.nameEn}
                {item.heals ? <span className="badge badge-heal">+{item.heals} HP</span> : null}
              </span>
              <span className="preflight-count">
                {have}/{item.count}{item.exact ? '' : '+'}
                {s !== 'IN_BAG_READY' && inBank !== null && (
                  <span className="muted"> · {inBank > 0 ? `in the bank ${inBank}` : 'not in the bank'}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className={`preflight-verdict ${r.ready ? 'is-ready' : ''}`} role="status">
          {r.ready ? '🟢 All ready — you can go'
            : owned.bankSeen ? `Not ready to set off: ${r.missing} missing${owned.bankSavedAt ? '. The bank is from a record of an earlier session: open it to refresh.' : ''}`
              : `Not ready to set off: ${r.missing} missing. Open the bank — I will show what is there and highlight what is needed.`}
        </p>
      </>
    );
  }
  return (
    <div className="preflight" aria-label="Departure check">
      <h4 className="subhead">🧳 Departure check</h4>
      {body}
    </div>
  );
}
