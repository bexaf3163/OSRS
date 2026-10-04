// Сверху окна: вышла новая версия. Ставит игрок кнопкой; скачивание идёт в фоне, данные не теряются.

import { percent, useUpdates } from '../lib/useUpdates';

export function UpdateBanner() {
  const u = useUpdates();
  if (!u) return null;
  const { state: s } = u;
  if (s.state !== 'available' && s.state !== 'downloading' && s.state !== 'ready') return null;
  return (
    <div className="plaque" role="status" aria-label="Обновление программы">
      <p><strong>Вышла версия {s.latest}</strong> <span className="muted small">(у тебя {s.current})</span></p>
      {s.notes && <p className="small muted">{s.notes}</p>}
      {!s.canInstall && <p className="small">Эта сборка сама не обновляется — скачай новую переносную версию из выпусков на GitHub.</p>}
      <div className="actions">
        {s.canInstall && s.state === 'available' && <button type="button" className="btn btn-primary" onClick={u.download}>Скачать обновление</button>}
        {s.state === 'downloading' && <span className="small" aria-live="polite">Скачиваю… {percent(s.progress)}%</span>}
        {s.state === 'ready' && <button type="button" className="btn btn-primary" onClick={u.install}>Перезапустить в новую версию</button>}
      </div>
      {s.state === 'ready' && <p className="small muted">Прогресс и настройки останутся: они лежат рядом с программой. RuneLite после этого перезапусти, чтобы подхватить новый плагин.</p>}
    </div>
  );
}
