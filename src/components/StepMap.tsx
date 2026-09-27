// Карта в карточке шага: превью из тайлов OSRS Wiki, переключатель точек и карта мира на весь экран.
// Выбранная точка — одно состояние на превью, переключатель и карту мира: они всегда показывают одно место.

import { lazy, Suspense, useState } from 'react';
import type { MapLocation, Step } from '../types';
import { DEFAULT_ZOOM, floorLabel, initialPoint, isUnderground, stepPoints, tilesAround } from '../lib/map';
import { Inline } from './Inline';
import { useBridge } from '../bridge';
import { navigationTarget } from '../lib/navigation';
import { NavigateButton } from './NavigateButton';
import { ImageModal } from './StepImage';

const WorldMapModal = lazy(() => import('./WorldMapModal'));

/** Превью рисуется на эту ширину и обрезается по карточке — узкая колонка просто видит середину. */
const PREVIEW_W = 720;
const PREVIEW_H = 132;
/** Метка на 42 % высоты — как .map-marker в стилях. */
const ANCHOR_Y = 0.42;

export function StepMap({ step }: { step: Step }) {
  const points = stepPoints(step);
  const [active, setActive] = useState(() => initialPoint(step));
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const { navTarget, activeStepId, branchChoice } = useBridge();
  const branch = step.branches?.find((b) => b.id === branchChoice[step.id]);
  const arrow = navigationTarget(step, { branch, navTarget, activeStepId });
  if (!points.length) return null;
  const point = points[Math.min(active, points.length - 1)];

  return (
    <section className="step-map" aria-label="Карта">
      {points.length > 1 && (
        <div className="spot-switch" role="radiogroup" aria-label="Точки на карте">
          {points.map((p, i) => (
            <button key={`${p.x},${p.y},${p.plane}`} type="button" role="radio" aria-checked={i === active}
              className={`spot-chip ${i === active ? 'is-active' : ''}`} onClick={() => setActive(i)}>
              📍 {p.label}
            </button>
          ))}
        </div>
      )}

      {step.mapPreviewImage ? (
        <button type="button" className="map-preview" onClick={() => setZoomed(true)} aria-label={`Схема: ${point.label} — открыть крупно`}>
          <img className="map-preview-image" src={step.mapPreviewImage} alt="" referrerPolicy="no-referrer" />
          <MapCaption point={point} />
        </button>
      ) : (
        <MapPreview point={point} onOpen={() => setOpen(true)} />
      )}
      {point.note && <p className="spot-note small"><Inline text={point.note} /></p>}

      <div className="map-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>🗺️ Карта мира</button>
        {/* Выбранная точка — в игру: стрелка и Shortest Path ведут туда, NPC точки подсвечивается, по приходу
            стрелка возвращается к шагу. То же делает «Путь сюда» в панели «OSRS Путь» в RuneLite. */}
        <NavigateButton label="🧭 Вести сюда в игре"
          target={{ label: point.label, x: point.x, y: point.y, plane: point.plane, ...(point.npc ? { npcNames: [point.npc] } : {}), stepId: step.id }} />
      </div>

      {zoomed && step.mapPreviewImage && (
        <ImageModal src={step.mapPreviewImage} alt={`Схема: ${point.label}`} caption={point.label} onClose={() => setZoomed(false)} />
      )}
      {open && (
        <Suspense fallback={null}>
          <WorldMapModal title={`${step.id} · ${step.title}`} points={points} active={active} onActive={setActive}
            arrow={arrow} arrowLive={activeStepId === step.id} wikiUrl={step.mapUrl} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}

function MapCaption({ point }: { point: MapLocation }) {
  return (
    <span className="map-caption">
      <span className="map-caption-label">📍 {point.label}</span>
      <span className="map-caption-floor">{isUnderground(point) ? 'Подземелье' : floorLabel(point.plane)}</span>
    </span>
  );
}

/** Статичное превью: несколько тайлов вокруг точки и заметная метка в центре. */
function MapPreview({ point, onOpen }: { point: MapLocation; onOpen: () => void }) {
  const zoom = point.zoom ?? DEFAULT_ZOOM;
  const tiles = tilesAround(point, zoom, PREVIEW_W, PREVIEW_H, ANCHOR_Y);
  const key = `${point.x},${point.y},${point.plane},${zoom}`;
  // Считаем провалы по конкретной точке: при переключении счёт начинается заново.
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const errors = failed.key === key ? failed.n : 0;
  const offline = errors >= tiles.length;

  return (
    <button type="button" className={`map-preview ${offline ? 'is-offline' : ''}`} onClick={onOpen}
      aria-label={`${point.label}: открыть на карте мира`}>
      {offline ? (
        <span className="map-offline small">Карта не загрузилась — нет связи с OSRS Wiki. Клетка {point.x}, {point.y}</span>
      ) : (
        <span className="map-tiles" style={{ width: PREVIEW_W, height: PREVIEW_H }} key={key} aria-hidden="true">
          {tiles.map((t) => (
            <img key={t.url} src={t.url} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer"
              style={{ left: t.left, top: t.top }}
              onError={() => setFailed((f) => ({ key, n: (f.key === key ? f.n : 0) + 1 }))} />
          ))}
          <span className="map-marker" />
        </span>
      )}
      <MapCaption point={point} />
    </button>
  );
}
