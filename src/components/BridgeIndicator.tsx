// The RuneLite link indicator in the header: 🟢 the bridge is active / ⚪ offline. It leads to the link settings.
// While the link is turned off in settings there is no indicator — those who play without the plugin do not need it.

import { useBridge } from '../bridge';

export function BridgeIndicator() {
  const { state, inGame, plugin } = useBridge();
  if (state === 'off') return null;
  const online = state === 'online';
  // The plugin is older than the app: there is a link but no new features — the icon is yellow, details in settings.
  const stale = online && plugin !== null && plugin.compat !== 'ok';
  const label = stale ? 'Update the RuneLite plugin' : online ? 'RuneLite bridge active' : state === 'connecting' ? 'RuneLite: connecting…' : 'RuneLite bridge offline';
  const hint = stale
    ? `OSRS Path Bridge plugin ${plugin!.version ?? 'before 2.9'} does not match the app — details in settings`
    : online
      ? inGame ? 'OSRS Path Bridge plugin is connected, the character is in the game' : 'The plugin is connected, the character has not logged in yet'
      : 'The OSRS Path Bridge plugin does not respond on 127.0.0.1:38282 — start RuneLite with the plugin';
  return (
    <a className={`bridge-indicator ${online ? 'is-online' : ''} ${stale ? 'is-stale' : ''}`} href="#/settings" title={hint} aria-label={`${label}. ${hint}`}>
      <span className="bridge-dot" aria-hidden="true">{stale ? '🟡' : online ? '🟢' : '⚪'}</span>
      <span className="bridge-label">{label}</span>
    </a>
  );
}
