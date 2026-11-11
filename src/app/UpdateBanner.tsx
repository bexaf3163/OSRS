// At the top of the window: a new version is out. The player installs it with a button; the download goes in the background, no data is lost.
// A Ledger notice: an emblem, a small-caps title, one line of text and the Ledger's own buttons.

import { percent, useUpdates } from '../state/hooks/useUpdates';
import { Icon } from '../ledger';

export function UpdateBanner() {
  const u = useUpdates();
  if (!u) return null;
  const { state: s } = u;
  // A failed download of a known newer version stays here with its reason and a retry; a failed check alone is reported in Settings.
  const failed = s.state === 'error' && s.canInstall && !!s.latest && s.latest !== s.current;
  if (s.state !== 'available' && s.state !== 'downloading' && s.state !== 'ready' && !failed) return null;
  const title = s.state === 'ready' ? `Version ${s.latest} is ready` : s.state === 'downloading' ? `Downloading ${s.latest} · ${percent(s.progress)}%` : `Version ${s.latest} is out`;
  const line = failed ? `The download did not finish: ${s.error}`
    : !s.canInstall ? 'This build does not update itself: download the new portable version from the GitHub releases.'
      : s.notes || `You have ${s.current}.`;
  return (
    <div className="update-banner la-notice" role="status" aria-label="App update">
      <div className="la-shield" aria-hidden="true"><Icon name="scroll" size={26} strokeWidth={1.4} /></div>
      <div className="update-text">
        <b>{title} <i>· you have {s.current}</i></b>
        <span title={line}>{line}</span>
        {s.state === 'ready' && <small>Progress and settings stay next to the app. Restart RuneLite afterwards for the new plugin.</small>}
      </div>
      <div className="update-actions">
        {s.canInstall && s.state === 'available' && <button type="button" className="la-btn la-p" onClick={u.download}>Download the update</button>}
        {s.state === 'downloading' && u.cancel && <button type="button" className="la-btn" onClick={u.cancel}>Cancel</button>}
        {failed && <button type="button" className="la-btn la-p" onClick={u.download}>Try again</button>}
        {s.state === 'ready' && <button type="button" className="la-btn la-p" onClick={u.install}>Restart into the new version</button>}
      </div>
    </div>
  );
}
