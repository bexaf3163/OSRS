// Плагин в RuneLite старше программы: связь есть, но новых функций нет. Программа запускает RuneLite с плагином
// из своей папки, а уже запущенный RuneLite держит тот плагин, с которым стартовал, — после обновления программы
// его нужно перезапустить. Раньше об этом писали только шапка («Обнови плагин RuneLite») и настройки — и игрок
// не видел в игре нового списка «Что нужно», не понимая почему.

import { useBridge } from '../bridge';
import { APP_PROTOCOL, missingWithPlugin } from '../services/runeliteBridge';

export function PluginUpdateNote() {
  const { state, plugin, canLaunch } = useBridge();
  if (state !== 'online' || !plugin || plugin.compat === 'ok') return null;
  if (plugin.compat === 'newer') {
    return (
      <div className="plaque plaque-warning" role="note">
        <p><strong>⚠️ Плагин в RuneLite новее программы</strong></p>
        <p className="small">Программа: {__APP_VERSION__} (протокол моста {APP_PROTOCOL}) · Плагин: {plugin.version} (протокол {plugin.protocol}). Обнови программу «OSRS Путь».</p>
      </div>
    );
  }
  const missing = missingWithPlugin(plugin.protocol);
  return (
    <div className="plaque plaque-warning" role="note">
      <p><strong>⚠️ В RuneLite работает старый плагин {plugin.version ?? 'до 2.9'} — перезапусти RuneLite</strong></p>
      <p className="small">
        Программа {__APP_VERSION__} привезла новый плагин, но RuneLite, запущенный раньше, держит старый.
        {missing.length > 0 && <> Со старым нет: {missing.join('; ')}.</>}
      </p>
      <p className="small">
        {canLaunch
          ? 'Выйди из игры, закрой RuneLite и нажми «🎮 Запустить RuneLite с мостом» в настройках — RuneLite откроется уже с новым плагином.'
          : 'Выйди из игры, закрой RuneLite и запусти его снова с новым плагином (jar из папки программы).'}
        {' '}Шаги, стрелка и подсказки пока работают.
      </p>
    </div>
  );
}
