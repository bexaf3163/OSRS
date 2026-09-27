// Индикатор связи с RuneLite в шапке: 🟢 мост активен / ⚪ оффлайн. Ведёт в настройки связи.
// Пока связь выключена в настройках, индикатора нет — он не нужен тем, кто играет без плагина.

import { useBridge } from '../bridge';

export function BridgeIndicator() {
  const { state, inGame, plugin } = useBridge();
  if (state === 'off') return null;
  const online = state === 'online';
  // Плагин старше программы: связь есть, но новых функций нет — значок жёлтый, подробности в настройках.
  const stale = online && plugin !== null && plugin.compat !== 'ok';
  const label = stale ? 'Обнови плагин RuneLite' : online ? 'RuneLite мост активен' : state === 'connecting' ? 'RuneLite: подключение…' : 'RuneLite мост оффлайн';
  const hint = stale
    ? `Плагин OSRS Path Bridge ${plugin!.version ?? 'до 2.9'} не совпадает с программой — подробности в настройках`
    : online
      ? inGame ? 'Плагин OSRS Path Bridge на связи, персонаж в игре' : 'Плагин на связи, персонаж ещё не вошёл в игру'
      : 'Плагин OSRS Path Bridge не отвечает на 127.0.0.1:38282 — запусти RuneLite с плагином';
  return (
    <a className={`bridge-indicator ${online ? 'is-online' : ''} ${stale ? 'is-stale' : ''}`} href="#/settings" title={hint} aria-label={`${label}. ${hint}`}>
      <span className="bridge-dot" aria-hidden="true">{stale ? '🟡' : online ? '🟢' : '⚪'}</span>
      <span className="bridge-label">{label}</span>
    </a>
  );
}
