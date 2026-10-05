// The plugin in RuneLite is older than the app: there is a link but no new features. The app starts RuneLite with the plugin
// from its folder, and an already running RuneLite keeps the plugin it started with — after the app update
// it must be restarted. Before, only the header ("Update the RuneLite plugin") and settings said so — and the player
// did not see the new "What you need" list in the game and did not understand why.

import { useBridge } from '../bridge';
import { APP_PROTOCOL, missingWithPlugin } from '../services/runeliteBridge';

export function PluginUpdateNote() {
  const { state, plugin, canLaunch } = useBridge();
  if (state !== 'online' || !plugin || plugin.compat === 'ok') return null;
  if (plugin.compat === 'newer') {
    return (
      <div className="plaque plaque-warning" role="note">
        <p><strong>⚠️ The plugin in RuneLite is newer than the app</strong></p>
        <p className="small">App: {__APP_VERSION__} (bridge protocol {APP_PROTOCOL}) · Plugin: {plugin.version} (protocol {plugin.protocol}). Update the "OSRS Path" app.</p>
      </div>
    );
  }
  const missing = missingWithPlugin(plugin.protocol);
  return (
    <div className="plaque plaque-warning" role="note">
      <p><strong>⚠️ An old plugin {plugin.version ?? 'before 2.9'} is running in RuneLite — restart RuneLite</strong></p>
      <p className="small">
        The app {__APP_VERSION__} brought a new plugin, but a RuneLite started earlier keeps the old one.
        {missing.length > 0 && <> Missing with the old one: {missing.join('; ')}.</>}
      </p>
      <p className="small">
        {canLaunch
          ? 'Leave the game, close RuneLite and press "🎮 Launch RuneLite with the bridge" in settings — RuneLite will open with the new plugin.'
          : 'Leave the game, close RuneLite and start it again with the new plugin (the jar from the app folder).'}
        {' '}The steps, the arrow and the hints work for now.
      </p>
    </div>
  );
}
