// The RuneLite link indicator in the header: connected and in game / waiting for the character / offline. It leads to the link settings.
// While the link is turned off in settings there is no indicator — those who play without the plugin do not need it.

import { useBridge } from '../bridge';
import { LINK_LABEL, LINK_SHORT, linkStatus } from '../lib/linkState';

export function BridgeIndicator() {
  const { state, inGame, plugin } = useBridge();
  if (state === 'off') return null;
  const online = state === 'online';
  const status = linkStatus(state, inGame);
  // The plugin is older than the app: there is a link but no new features — the icon is yellow, details in settings.
  const stale = online && plugin !== null && plugin.compat !== 'ok';
  const label = stale ? 'Update the RuneLite plugin' : LINK_LABEL[status];
  const hint = stale
    ? `OSRS Path Bridge plugin ${plugin!.version ?? 'before 2.9'} does not match the app — details in settings`
    : status === 'connected' ? 'OSRS Path Bridge plugin is connected, the character is in the game'
      : status === 'waiting-character' ? 'The plugin is connected, the character has not logged in yet'
        : status === 'connecting' ? 'Looking for the OSRS Path Bridge plugin on 127.0.0.1:38282'
          : 'The OSRS Path Bridge plugin does not respond on 127.0.0.1:38282 — start RuneLite with the plugin. A saved target waits there.';
  return (
    <a className={`bridge-indicator ${online ? 'is-online' : ''} ${stale ? 'is-stale' : ''}`} href="#/settings" title={hint} aria-label={`${label}. ${hint}`}>
      <span className="bridge-dot" aria-hidden="true">{stale ? '🟡' : online ? '🟢' : '⚪'}</span>
      <span className="bridge-label">{label}</span>
      {/* Between 1280 and 1719 px the full label does not fit: a one-word status keeps the dot from being a riddle. */}
      <span className="bridge-label-short">{stale ? 'Update' : LINK_SHORT[status]}</span>
    </a>
  );
}
