// В игре другой персонаж, чем в активном профиле: уровни и отметки из игры не пишем, пока игрок не выберет.

import { useBridge } from '../bridge';
import { addProfile, readProfiles, switchProfile, writeProfiles } from '../lib/profiles';

export function ProfileBanner() {
  const { gate } = useBridge();
  if (gate.kind !== 'switch' && gate.kind !== 'new') return null;
  const create = () => {
    const r = addProfile(readProfiles(), gate.player, gate.player);
    if (!r) return;
    writeProfiles(r.state);
    switchProfile(r.id);
  };
  return (
    <div className="plaque plaque-warning" role="alert">
      {gate.kind === 'switch'
        ? (
          <>
            <p><strong>В игре персонаж {gate.player} — это профиль «{gate.profile.name}»</strong></p>
            <p className="small">Пока открыт другой профиль, уровни и отметки из игры в него не записываются.</p>
            <div className="actions"><button type="button" className="btn btn-primary" onClick={() => switchProfile(gate.profile.id)}>Переключить на «{gate.profile.name}»</button></div>
          </>
        )
        : (
          <>
            <p><strong>В игре новый персонаж: {gate.player}</strong></p>
            <p className="small">Активный профиль привязан к другому персонажу, поэтому уровни и отметки из игры сюда не записываются. Создай отдельный профиль — у него будет свой прогресс.</p>
            <div className="actions"><button type="button" className="btn btn-primary" onClick={create}>Создать профиль «{gate.player}»</button></div>
          </>
        )}
    </div>
  );
}
