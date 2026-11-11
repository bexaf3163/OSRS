// The app's version and its update control at the foot of the left rail (2.93: Settings → App retired, owner 2026-11-11). Checks run by
// themselves at launch and every few hours; nothing is installed without this button.

import { percent, useUpdates } from '../state/hooks/useUpdates';

const RELEASES = 'https://github.com/bexaf3163/OSRS/releases/latest';

export function VersionControl() {
  const u = useUpdates();
  const s = u?.state;
  const state = !u || !s ? null
    : s.state === 'ready' ? { label: 'Restart to update', title: `Version ${s.latest} is downloaded: restart into it`, run: u.install, main: true }
      : s.state === 'available' && s.canInstall ? { label: `Get ${s.latest}`, title: `Download version ${s.latest}`, run: u.download, main: true }
        : s.state === 'available' ? { label: `${s.latest} is out`, title: 'This build does not update itself: download the new portable version', href: RELEASES, main: true }
          : s.state === 'downloading' ? { label: `${percent(s.progress)}%`, title: `Downloading version ${s.latest}` }
            : s.state === 'checking' ? { label: 'Checking…', title: 'Looking for a new version' }
              : s.state === 'error' ? { label: 'Retry', title: `The update check failed: ${s.error ?? 'no connection'}`, run: u.check }
                : { label: 'Check', title: 'The latest version is installed; check again now', run: u.check };
  return (
    <div className="la-ver" role="group" aria-label="App version">
      <span className="la-ver-num" title={`OSRS Path ${__APP_VERSION__}`}>v{__APP_VERSION__}</span>
      {state && ('href' in state && state.href
        ? <a className={`la-ver-btn ${state.main ? 'la-ver-main' : ''}`} href={state.href} target="_blank" rel="noopener noreferrer" title={state.title}>{state.label}</a>
        : 'run' in state && state.run
          ? <button type="button" className={`la-ver-btn ${state.main ? 'la-ver-main' : ''}`} onClick={state.run} title={state.title}>{state.label}</button>
          : <span className="la-ver-state" aria-live="polite" title={state.title}>{state.label}</span>)}
    </div>
  );
}
