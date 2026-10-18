// "Launch RuneLite" in the header: always at hand, the same launch as in Settings → RuneLite. Shown only in the desktop app, while the link is
// on and the plugin does not answer; once RuneLite with the plugin is connected there is nothing to press, so the button leaves.

import { useState } from 'react';
import { useBridge } from '../bridge';

export function LaunchRuneLiteButton() {
  const { canLaunch, launchRuneLite, state } = useBridge();
  const [busy, setBusy] = useState(false);
  if (!canLaunch || state === 'off' || state === 'online') return null;
  const launch = async () => {
    setBusy(true);
    await launchRuneLite();
    // A just-started client needs about ten seconds to bring the bridge up: the button stays pressed that long, so it is not clicked twice.
    setTimeout(() => setBusy(false), 12_000);
  };
  const label = busy ? 'Starting…' : 'Launch RuneLite';
  return (
    <button type="button" className="btn btn-sm btn-primary launch-runelite" onClick={launch} disabled={busy}
      title="Start RuneLite with the OSRS Path plugin" aria-label="Launch RuneLite with the OSRS Path plugin">
      <span aria-hidden="true">🎮</span><span className="launch-label">{label}</span>
    </button>
  );
}
