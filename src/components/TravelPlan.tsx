// «🧭 Как добраться»: где ты сейчас (плагин) и как проще дойти до места шага — пешком, телепортом или каноэ.
// Что доступно, считается по уровням и вещам из игры; чего не знаем (банк не открывали), помечено «?». Расстояния — по
// прямой: это сравнение вариантов, а не точное время.

import { useMemo, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { stepPlaces } from '../lib/stepPlaces';
import { dist, travelOptions, TRANSPORT, walkText, type Availability, type Point, type TravelOption } from '../lib/travel';

const BADGE: Record<Availability, string> = { ready: '✓ можно сейчас', maybe: '? проверь', locked: '🔒 пока нельзя' };

export function TravelPlan({ step }: { step: Step }) {
  const { progress } = useStore();
  const { enabled, state, inGame, stats, gear, owned, locate, navigate } = useBridge();
  const places = useMemo(() => stepPlaces(step), [step]);
  const [pos, setPos] = useState<Point | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState(0);
  if (!enabled || !places.length) return null;
  const target = places[Math.min(to, places.length - 1)];

  const ask = async () => {
    setBusy(true);
    setPos(await locate());
    setAsked(true);
    setBusy(false);
  };

  const levels = { ...progress.levels, ...(stats ?? {}) };
  const carried = gear && (gear.equipment || gear.inventory) ? [...(gear.equipment ?? []), ...(gear.inventory ?? [])] : null;
  const options: TravelOption[] = pos && pos.plane === 0 && target.plane === 0
    ? travelOptions({ from: pos, to: target, levels, carried, bankSeen: Boolean(owned?.bankSeen) })
    : [];

  return (
    <section className="step-section travel-plan" aria-label="Как добраться">
      <div className="ingame-row">
        <button type="button" className="btn" onClick={() => void ask()} disabled={busy || state !== 'online' || !inGame}>
          📍 Где я? Как добраться
        </button>
        {places.length > 1 && (
          <label className="small select-field">
            <span className="muted">до</span>
            <select value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="Куда добираться">
              {places.map((p, i) => <option key={`${p.x},${p.y},${i}`} value={i}>{p.label}</option>)}
            </select>
          </label>
        )}
      </div>
      {(state !== 'online' || !inGame) && <p className="muted small">Нужна игра с плагином: зайди в игру в RuneLite, и программа узнает, где ты.</p>}
      {asked && !pos && state === 'online' && inGame && (
        <p className="muted small" role="status">Плагин не сообщил положение: нужен плагин 2.12+ и включённая передача «уровни и опыт» в его настройках.</p>
      )}
      {pos && (pos.plane !== 0 || target.plane !== 0) && (
        <p className="muted small">Ты или цель не на земле (этаж {pos.plane} / {target.plane}): считать по прямой нельзя.</p>
      )}
      {pos && options.length > 0 && (
        <>
          <p className="small">Ты на клетке {pos.x}, {pos.y} — до «{target.label}» по прямой {dist(pos, target)} кл.</p>
          <ul className="travel-list">
            {options.slice(0, 4).map((o) => (
              <li key={o.id} className={`travel-option is-${o.availability}`}>
                <div className="travel-head">
                  <strong className="travel-title">{o.title}</strong>
                  <span className={`badge travel-badge is-${o.availability}`}>{BADGE[o.availability]}</span>
                </div>
                <p className="muted small travel-walk">пешком {walkText(o.walkTiles)}</p>
                {o.legs.length > 1 && <p className="muted small">{o.legs.map((l) => l.label).join(' → ')}</p>}
                {o.needs.filter((n) => n.ok !== true).length > 0 && (
                  <p className="small">
                    Нужно: {o.needs.filter((n) => n.ok !== true).map((n) => `${n.text}${n.ok === null ? ' (?)' : ''}`).join(', ')}.
                  </p>
                )}
                {o.note && <p className="muted small">{o.note}</p>}
                {o.id === 'canoe' && o.availability !== 'locked' && (
                  <button type="button" className="btn btn-sm" onClick={() => void navigateToStation(o, navigate)}>🧭 Вести к станции</button>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">Точки и условия — вики (проверено {TRANSPORT.checked}). Расстояние — по прямой: преграды программа не знает, в бою и при низкой энергии дольше.</p>
        </>
      )}
      {pos && options.length === 1 && (
        <p className="small">Ты уже рядом — ни телепорт, ни каноэ не выгоднее, чем дойти пешком.</p>
      )}
    </section>
  );
}

/** Стрелка в игре — к станции каноэ, с которой начинается этот вариант. */
async function navigateToStation(o: TravelOption, navigate: ReturnType<typeof useBridge>['navigate']): Promise<void> {
  const name = o.title.replace(/^Каноэ\s+/, '').split(' → ')[0];
  const station = TRANSPORT.canoe.stations.find((s) => s.name === name);
  if (station) await navigate({ label: `Станция каноэ — ${station.name}`, x: station.x, y: station.y, plane: station.plane });
}
