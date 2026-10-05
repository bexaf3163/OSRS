// At the top of the window: a new version is out. The player installs it with a button; the download goes in the background, no data is lost.

import { percent, useUpdates } from '../lib/useUpdates';

export function UpdateBanner() {
  const u = useUpdates();
  if (!u) return null;
  const { state: s } = u;
  if (s.state !== 'available' && s.state !== 'downloading' && s.state !== 'ready') return null;
  return (
    <div className="plaque" role="status" aria-label="App update">
      <p><strong>Version {s.latest} is out</strong> <span className="muted small">(you have {s.current})</span></p>
      {s.notes && <p className="small muted">{s.notes}</p>}
      {!s.canInstall && <p className="small">This build does not update itself — download the new portable version from the GitHub releases.</p>}
      <div className="actions">
        {s.canInstall && s.state === 'available' && <button type="button" className="btn btn-primary" onClick={u.download}>Download the update</button>}
        {s.state === 'downloading' && <span className="small" aria-live="polite">Downloading… {percent(s.progress)}%</span>}
        {s.state === 'ready' && <button type="button" className="btn btn-primary" onClick={u.install}>Restart into the new version</button>}
      </div>
      {s.state === 'ready' && <p className="small muted">Your progress and settings stay: they are kept next to the app. After that restart RuneLite to pick up the new plugin.</p>}
    </div>
  );
}
