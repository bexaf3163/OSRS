// "Inventory cleanup": what in the bag can be sold or looked at because nothing ahead in the route asks for it. Advice only: the app sells,
// drops and destroys nothing. The engine is lib/cleanup.ts; the player's "Always keep" and dismissals are saved per profile and character.

import { ACTION_LABEL, proceedsText, recLabel, type AccountKind, type CleanupRec } from '../lib/cleanup';
import { withAccount, withDismissed, withKeep } from '../lib/cleanupPrefs';
import { useCleanupAdvice } from '../lib/useCleanupAdvice';
import { formatGp } from '../lib/shopping';

export function InventoryCleanup() {
  const { result, prefs, update, account, live } = useCleanupAdvice();

  const hidden = prefs.dismissed.length;
  const kept = new Set(prefs.keep);
  const actionable = result.recs;

  const row = (r: CleanupRec) => (
    <li key={`${r.key}|${r.noted}|${r.action}`} className={`cleanup-row is-${r.action}`}>
      <div className="cleanup-main">
        <span className={`cleanup-act act-${r.action}`}>{ACTION_LABEL[r.action]}</span>
        <strong>{recLabel(r)}</strong>
        {r.action === 'sell' && proceedsText(r) && <span className="muted small"> · {proceedsText(r)}</span>}
        <p className="small cleanup-why">{r.reason}</p>
        {r.recovery && <p className="small muted">If you need it again: {r.recovery}</p>}
      </div>
      <div className="cleanup-btns">
        <button type="button" className="btn btn-sm" onClick={() => update((p) => withKeep(p, r.key, true))}>Always keep</button>
        <button type="button" className="btn btn-sm" onClick={() => update((p) => withDismissed(p, r.key, r.action, true))}>Dismiss</button>
      </div>
    </li>
  );

  return (
    <details className="card cleanup-card" open={actionable.length > 0}>
      <summary className="subhead">
        🧹 Inventory cleanup{live ? ` · ${actionable.length} ${actionable.length === 1 ? 'suggestion' : 'suggestions'}` : ''}
      </summary>
      {!live ? (
        <p className="muted small">Connect the game (plugin on, character logged in) and the bag will be checked against the route. Nothing is guessed without it.</p>
      ) : (
        <>
          {account === null && (
            <p className="small">
              <label>Account type is not known yet — sales are only suggested for a regular account.{' '}
                <select value="" onChange={(e) => update((p) => withAccount(p, e.target.value === '' ? null : (e.target.value as AccountKind)))}>
                  <option value="">choose…</option>
                  <option value="normal">Regular</option>
                  <option value="ironman">Ironman</option>
                </select>
              </label>
            </p>
          )}
          {actionable.length === 0 && <p className="muted small">Nothing in the bag stands out: everything is needed, always carried, or already handled.</p>}
          {actionable.length > 0 && (
            <>
              {result.proceeds > 0 && <p className="small">If you sell every “Sell” line: about <strong>{formatGp(result.proceeds)} gp</strong> (an estimate from exchange prices, before tax).</p>}
              <ul className="cleanup-list">{actionable.map(row)}</ul>
            </>
          )}
          {result.keeps.length > 0 && (
            <details className="small cleanup-keeps">
              <summary className="muted">Staying in the bag · {result.keeps.length}</summary>
              <ul className="cleanup-list">
                {result.keeps.map((r) => (
                  <li key={`${r.key}|${r.noted}`} className="cleanup-row is-keep">
                    <div className="cleanup-main">
                      <strong>{recLabel(r)}</strong>
                      <p className="small cleanup-why">{r.reason}</p>
                    </div>
                    {kept.has(r.key) && (
                      <div className="cleanup-btns"><button type="button" className="btn btn-sm" onClick={() => update((p) => withKeep(p, r.key, false))}>Stop always keeping</button></div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
          {hidden > 0 && <p className="small"><button type="button" className="btn btn-sm" onClick={() => update((p) => ({ ...p, dismissed: [] }))}>Show dismissed suggestions ({hidden})</button></p>}
        </>
      )}
      <p className="small muted">Advice only: the app sells, drops and destroys nothing. “No future use identified” means only that nothing in your route asks for it; it is not a promise. The same lines show in the game on the bank, shop and exchange card and under the guide's Advice tab (plugin 2.61.0 or later).</p>
    </details>
  );
}
