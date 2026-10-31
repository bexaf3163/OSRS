// The map in the step card: a preview from OSRS Wiki tiles, a point switch and the full-screen world map.
// The chosen point is one state for the preview, the switch and the world map: they always show the same place.

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { MapLocation, Step } from '../types';
import { DEFAULT_ZOOM, floorLabel, initialPoint, isUnderground, mapSourceAt, tilesAround } from '../lib/map';
import { useMapSources } from '../lib/useMapSources';
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

/** A map point; `now` marks the game's current target for this step. */
type Spot = MapLocation & { now?: boolean };
const spotKey = (p: Pick<MapLocation, 'x' | 'y' | 'plane'>) => `${p.x},${p.y},${p.plane}`;

/** shownTarget: where the view's own "Show in game" button leads; "Lead here" is left out when it would only repeat it (one place, the same tile). */
/** mapRequest: the hotbar asked for the world map; onMapOpened clears the request so it does not open again on the next visit. */
export function StepMap({ step, shownTarget, mapRequest = false, onMapOpened }: { step: Step; shownTarget?: { x: number; y: number; plane: number } | null; mapRequest?: boolean; onMapOpened?: () => void }) {
  // The step map points, where items and quest NPCs are — the same places as in the "What you need" list in the game.
  const places = mapPlaces(step);
  // The point the player picked, by place: the list can gain the game's current target while the card is open.
  const [chosen, setChosen] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!mapRequest) return;
    setOpen(true);
    onMapOpened?.();
  }, [mapRequest, onMapOpened]);
  const { navTarget, activeStepId, branchChoice } = useBridge();
  const branch = step.branches?.find((b) => b.id === branchChoice[step.id]);
  const { prep } = usePrep();
  const arrow = navigationTarget(step, { branch, navTarget, activeStepId, detourActive: prep.stack.some((f) => f.sourceStepId === step.id) });
  // Mid-quest the game's arrow leads past the step's own places (a quest's are where it starts): that target comes first and is
  // chosen until the player picks another point, so "Where" and "Lead here" agree with the arrow.
  const live: Spot | null = arrow && activeStepId === step.id && arrow.source !== 'step' && arrow.source !== 'branch' && !arrow.instanced
    && !places.some((p) => spotKey(p) === spotKey(arrow)) ? { label: arrow.label, x: arrow.x, y: arrow.y, plane: arrow.plane, now: true } : null;
  const points: Spot[] = live ? [live, ...places] : places;
  if (!points.length) return null;
  const picked = chosen ? points.findIndex((p) => spotKey(p) === chosen) : -1;
  const active = picked >= 0 ? picked : live ? 0 : initialPoint(step);
  const point = points[Math.min(active, points.length - 1)];
  const repeatsShow = !!shownTarget && points.length === 1 && !point.now && spotKey(point) === spotKey(shownTarget);

  return (
    <section className="step-map" aria-label="Map">
      {points.length > 1 && (
        <div className="spot-switch" role="radiogroup" aria-label="Points on the map">
          {points.map((p, i) => (
            <button key={`${p.x},${p.y},${p.plane}`} type="button" role="radio" aria-checked={i === active}
              className={`spot-chip ${i === active ? 'is-active' : ''}`} onClick={() => setChosen(spotKey(p))}>
              {p.now ? '🧭 Now: ' : '📍 '}{p.label}
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
        {!repeatsShow && <NavigateButton label="🧭 Lead here in the game"
          target={{ label: point.label, x: point.x, y: point.y, plane: point.plane, ...(point.npc ? { npcNames: [point.npc] } : {}), stepId: step.id }} />}
      </div>

      {zoomed && step.mapPreviewImage && (
        <ImageModal src={step.mapPreviewImage} alt={`Diagram: ${point.label}`} caption={point.label} onClose={() => setZoomed(false)} />
      )}
      {open && (
        <Suspense fallback={null}>
          <WorldMapModal title={`${step.id} · ${step.title}`} points={points} active={active} onActive={(i) => setChosen(spotKey(points[i]))}
            arrow={arrow?.instanced ? null : arrow} arrowLive={activeStepId === step.id} wikiUrl={step.mapUrl} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}

function MapCaption({ point }: { point: Spot }) {
  return (
    <span className="map-caption">
      <span className="map-caption-label">{point.now ? '🧭 Now: ' : '📍 '}{point.label}</span>
      <span className="map-caption-floor">{isUnderground(point) ? 'Underground' : floorLabel(point.plane)}</span>
    </span>
  );
}

/** A static preview: several tiles around the point and a visible marker in the centre. */
function MapPreview({ point, onOpen }: { point: Spot; onOpen: () => void }) {
  const [retry, setRetry] = useState(0);
  const source = mapSourceAt(useMapSources(retry), point);
  const zoom = point.zoom ?? DEFAULT_ZOOM;
  const tiles = tilesAround(point, zoom, PREVIEW_W, PREVIEW_H, ANCHOR_Y, source);
  const key = `${point.x},${point.y},${point.plane},${zoom},${source.mapId},${source.cacheVersion},${retry}`;
  const current = useRef(key);
  current.current = key;
  const [failed, setFailed] = useState<{ key: string; urls: string[] }>({ key, urls: [] });
  const errors = failed.key === key ? failed.urls.length : 0;
  const offline = errors >= tiles.length;

  return (
    <><button type="button" className={`map-preview ${offline ? 'is-offline' : ''}`} onClick={onOpen}
      title={`OSRS Wiki base imagery: ${source.cacheVersion.split('_')[0]}. Route markers use game coordinates.`}
      aria-label={`${point.label}: open on the world map`}>
      {offline ? (
        <span className="map-offline small">Map imagery unavailable. Tile {point.x}, {point.y}. Directions remain available.</span>
      ) : (
        <span className="map-tiles" style={{ width: PREVIEW_W, height: PREVIEW_H }} key={key} aria-hidden="true">
          {tiles.map((t) => (
            <img key={t.url} src={retry ? `${t.url}?retry=${retry}` : t.url} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer"
              style={{ left: t.left, top: t.top }}
              onError={() => {
                if (current.current !== key) return;
                setFailed((f) => ({ key, urls: [...new Set([...(f.key === key ? f.urls : []), t.url])] }));
              }} />
          ))}
          <span className="map-marker" />
        </span>
      )}
      <MapCaption point={point} />
    </button>{offline && <button type="button" className="btn btn-sm" onClick={() => setRetry((n) => n + 1)}>Retry map</button>}</>
  );
}
