// The map in the step card: a preview from OSRS Wiki tiles, a point switch and the full-screen world map.
// The chosen point is one state for the preview, the switch and the world map: they always show the same place.

import { lazy, Suspense, useState } from 'react';
import type { MapLocation, Step } from '../types';
import { DEFAULT_ZOOM, floorLabel, initialPoint, isUnderground, tilesAround } from '../lib/map';
import { mapPlaces } from '../lib/stepPlaces';
import { Inline } from './Inline';
import { useBridge } from '../bridge';
import { navigationTarget } from '../lib/navigation';
import { usePrep } from '../lib/usePrep';
import { NavigateButton } from './NavigateButton';
import { ImageModal } from './StepImage';

const WorldMapModal = lazy(() => import('./WorldMapModal'));

/** The preview is drawn at this width and cropped by the card — a narrow column just sees the middle. */
const PREVIEW_W = 720;
const PREVIEW_H = 132;
/** The marker at 42% of the height — like .map-marker in the styles. */
const ANCHOR_Y = 0.42;

export function StepMap({ step }: { step: Step }) {
  // The step map points, where items and quest NPCs are — the same places as in the "What you need" list in the game.
  const points = mapPlaces(step);
  const [active, setActive] = useState(() => initialPoint(step));
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const { navTarget, activeStepId, branchChoice } = useBridge();
  const branch = step.branches?.find((b) => b.id === branchChoice[step.id]);
  const { prep } = usePrep();
  const arrow = navigationTarget(step, { branch, navTarget, activeStepId, detourActive: prep.stack.some((f) => f.sourceStepId === step.id) });
  if (!points.length) return null;
  const point = points[Math.min(active, points.length - 1)];

  return (
    <section className="step-map" aria-label="Map">
      {points.length > 1 && (
        <div className="spot-switch" role="radiogroup" aria-label="Points on the map">
          {points.map((p, i) => (
            <button key={`${p.x},${p.y},${p.plane}`} type="button" role="radio" aria-checked={i === active}
              className={`spot-chip ${i === active ? 'is-active' : ''}`} onClick={() => setActive(i)}>
              📍 {p.label}
            </button>
          ))}
        </div>
      )}

      {step.mapPreviewImage ? (
        <button type="button" className="map-preview" onClick={() => setZoomed(true)} aria-label={`Diagram: ${point.label} — open larger`}>
          <img className="map-preview-image" src={step.mapPreviewImage} alt="" referrerPolicy="no-referrer" />
          <MapCaption point={point} />
        </button>
      ) : (
        <MapPreview point={point} onOpen={() => setOpen(true)} />
      )}
      {point.note && <p className="spot-note small"><Inline text={point.note} /></p>}

      <div className="map-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>🗺️ World map</button>
        {/* The chosen point goes to the game: the arrow and Shortest Path lead there, the point's NPC is highlighted, on arrival
            the arrow returns to the step. "Go here" in the "OSRS Path" panel in RuneLite does the same. */}
        <NavigateButton label="🧭 Lead here in the game"
          target={{ label: point.label, x: point.x, y: point.y, plane: point.plane, ...(point.npc ? { npcNames: [point.npc] } : {}), stepId: step.id }} />
      </div>

      {zoomed && step.mapPreviewImage && (
        <ImageModal src={step.mapPreviewImage} alt={`Diagram: ${point.label}`} caption={point.label} onClose={() => setZoomed(false)} />
      )}
      {open && (
        <Suspense fallback={null}>
          <WorldMapModal title={`${step.id} · ${step.title}`} points={points} active={active} onActive={setActive}
            arrow={arrow?.instanced ? null : arrow} arrowLive={activeStepId === step.id} wikiUrl={step.mapUrl} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}

function MapCaption({ point }: { point: MapLocation }) {
  return (
    <span className="map-caption">
      <span className="map-caption-label">📍 {point.label}</span>
      <span className="map-caption-floor">{isUnderground(point) ? 'Underground' : floorLabel(point.plane)}</span>
    </span>
  );
}

/** A static preview: several tiles around the point and a visible marker in the centre. */
function MapPreview({ point, onOpen }: { point: MapLocation; onOpen: () => void }) {
  const zoom = point.zoom ?? DEFAULT_ZOOM;
  const tiles = tilesAround(point, zoom, PREVIEW_W, PREVIEW_H, ANCHOR_Y);
  const key = `${point.x},${point.y},${point.plane},${zoom}`;
  // We count failures per point: on switching the count starts over.
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const errors = failed.key === key ? failed.n : 0;
  const offline = errors >= tiles.length;

  return (
    <button type="button" className={`map-preview ${offline ? 'is-offline' : ''}`} onClick={onOpen}
      aria-label={`${point.label}: open on the world map`}>
      {offline ? (
        <span className="map-offline small">The map did not load — no connection to the OSRS Wiki. Tile {point.x}, {point.y}</span>
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
