// The full-screen world map: OSRS Wiki tiles in Leaflet, the step point markers, switching of points and floors.
// Loaded as a separate chunk only by the "World map" button — Leaflet does not weigh down the start.
// The wiki's map page cannot be embedded (X-Frame-Options: DENY), so the rendering is our own — from the same tiles.
//
// The same map shows one place from the wiki dossier (target): where an item lies, a shop, an NPC.
// While the place is being searched — "Searching for the place…", not found — a link to the wiki search, and the "🧭" button leads the in-game arrow there.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapLocation } from '../types';
import { DEFAULT_ZOOM, floorLabel, isUnderground, MAP_ATTRIBUTION, MAX_ZOOM, MIN_ZOOM, tileUrl } from '../lib/map';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { NavigateButton } from './NavigateButton';
import { sourceBadge, type MapTarget } from '../lib/places';
import { SOURCE_TEXT, type NavigationTarget } from '../lib/navigation';

export type { MapTarget } from '../lib/places';
import { IconClose, IconExternal } from './Icons';

export type MapStatus = 'loading' | 'error' | 'fallback';

interface Props {
  title: string;
  /** The step points; for a single place from the dossier — target. */
  points?: MapLocation[];
  active?: number;
  onActive?: (i: number) => void;
  target?: MapTarget | null;
  /** The place is still being searched, the search failed or there is no exact point — a message instead of a marker. */
  status?: MapStatus;
  /** A wiki search when there is no point. */
  searchUrl?: string;
  /** A temporary target for RuneLite; without it there is no "🧭" button. */
  navigate?: NavTargetPayload;
  /** Where the in-game arrow leads for this step — its own 🧭 marker, even if it is not a step point. */
  arrow?: NavigationTarget | null;
  /** The step is shown in the game: the map opens on the arrow target. */
  arrowLive?: boolean;
  wikiUrl?: string;
  onClose: () => void;
}

/** The wiki tiles in the game coordinate system: latitude is the tile y, longitude is x. The Leaflet tile (x, y) is the wiki tile (x, −y − 1). */
const WikiTiles = L.TileLayer.extend({
  getTileUrl(this: L.TileLayer & { options: { plane: number } }, c: L.Coords) {
    return tileUrl(c.z, this.options.plane, c.x, -c.y - 1);
  },
});

/** The centre of a tile — so the marker stands in the middle, not on a corner. */
const center = (p: MapLocation) => L.latLng(p.y + 0.5, p.x + 0.5);

function pinIcon(active: boolean): L.DivIcon {
  return L.divIcon({ className: `map-pin ${active ? 'is-active' : ''}`, html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
}

/** The arrow target marker: large, with a compass icon — visible at any zoom. */
const arrowIcon = L.divIcon({ className: 'map-arrow-pin', html: '<span>🧭</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
const samePoint = (a: { x: number; y: number; plane: number }, b: { x: number; y: number; plane: number }) =>
  Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && a.plane === b.plane;

const noop = () => {};

export default function WorldMapModal({
  title, points: stepPoints = [], active = 0, onActive = noop, target, status, searchUrl, navigate, arrow, arrowLive, wikiUrl, onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const points: MapLocation[] = target ? [{ x: target.x, y: target.y, plane: target.plane, label: target.label }] : stepPoints;
  const point: MapLocation | undefined = status ? undefined : points[Math.min(active, points.length - 1)];
  // The points arrive as new objects on every render — the effects are tied to the coordinates, otherwise the map
  // would return to the marker while it is being moved.
  const pointKey = point ? `${point.x},${point.y},${point.plane},${point.zoom ?? ''}` : '';
  const pointsKey = points.map((p) => `${p.x},${p.y},${p.plane},${p.label}`).join(';');
  const [plane, setPlane] = useState(point?.plane ?? 0);
  const [offline, setOffline] = useState(false);
  const arrowMarker = useRef<L.Marker | null>(null);
  /** The arrow target matches none of the step points — it has its own "show" button. */
  const arrowApart = Boolean(arrow && !target && !points.some((p) => samePoint(p, arrow)));
  const arrowKey = arrow ? `${arrow.x},${arrow.y},${arrow.plane},${arrow.label}` : '';

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  // The map is created once — when the first point appeared (for a dossier place it is searched first).
  const hasPoint = Boolean(point);
  useEffect(() => {
    if (!holder.current || !point) return;
    const m = L.map(holder.current, {
      crs: L.CRS.Simple,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM + 2,
      zoomSnap: 1,
      attributionControl: true,
      zoomControl: true,
    });
    m.attributionControl.setPrefix(false);
    let loaded = 0;
    let failed = 0;
    const layer = new (WikiTiles as unknown as new (url: string, o: L.TileLayerOptions & { plane: number }) => L.TileLayer)('', {
      plane: point.plane,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM + 2,
      minNativeZoom: MIN_ZOOM,
      maxNativeZoom: MAX_ZOOM,
      noWrap: true,
      // The OSRS world: everything beyond is empty tiles (404), we do not request them.
      bounds: L.latLngBounds([1150, 1000], [13000, 4300]),
      attribution: MAP_ATTRIBUTION,
    });
    layer.on('tileload', () => { loaded++; setOffline(false); });
    // No connection — we do not leave an empty window: a message on top and a wiki link.
    layer.on('tileerror', () => { failed++; if (!loaded && failed >= 4) setOffline(true); });
    layer.addTo(m);
    // The step is shown in the game, and the arrow leads not to the step point — the map opens where the arrow leads.
    const start = arrowLive && arrow && arrowApart ? { ...arrow, zoom: undefined as number | undefined } : point;
    m.setView(center(start), start.zoom ?? DEFAULT_ZOOM);
    setPlane(start.plane);
    map.current = m;
    tiles.current = layer;
    // The window size is known only after showModal.
    const t = window.setTimeout(() => m.invalidateSize(), 0);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      tiles.current = null;
      markers.current = [];
    };
  }, [hasPoint]); // The map is created once per point appearance.

  // Markers of all points: the active one is larger and pulses, the caption is always visible.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current) mk.remove();
    markers.current = points.map((p, i) => {
      const mk = L.marker(center(p), { icon: pinIcon(i === active), keyboard: false, zIndexOffset: i === active ? 1000 : 0, title: p.label })
        .bindTooltip(p.label, { direction: 'top', offset: [0, -12], permanent: i === active, className: 'map-tip' })
        .on('click', () => onActive(i));
      if (p.plane === plane) mk.addTo(m);
      return mk;
    });
  }, [pointsKey, active, plane, onActive, hasPoint]);

  // The arrow target marker — over the step points, with the caption "where the arrow leads".
  useEffect(() => {
    const m = map.current;
    arrowMarker.current?.remove();
    arrowMarker.current = null;
    if (!m || !arrow || target) return;
    const tip = `🧭 ${arrowLive ? 'The in-game arrow leads here' : 'The arrow will lead here'}: ${arrow.label}`;
    const mk = L.marker(center(arrow), { icon: arrowIcon, keyboard: false, zIndexOffset: 2000, title: tip })
      .bindTooltip(tip, { direction: 'bottom', offset: [0, 14], permanent: arrowApart, className: 'map-tip map-tip-arrow' });
    if (arrow.plane === plane) mk.addTo(m);
    arrowMarker.current = mk;
    return () => { mk.remove(); };
  }, [arrowKey, arrowLive, arrowApart, plane, hasPoint]);

  const showArrow = () => {
    const m = map.current;
    if (!m || !arrow) return;
    setPlane(arrow.plane);
    m.setView(center(arrow), Math.max(m.getZoom(), DEFAULT_ZOOM));
  };

  // Switching a point: the centre, zoom and floor of the point.
  useEffect(() => {
    const m = map.current;
    if (!m || !point) return;
    setPlane(point.plane);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    m.setView(center(point), point.zoom ?? Math.max(m.getZoom(), DEFAULT_ZOOM), { animate: !reduce });
  }, [pointKey]);

  useEffect(() => {
    const layer = tiles.current as (L.TileLayer & { options: { plane: number } }) | null;
    if (!layer || layer.options.plane === plane) return;
    layer.options.plane = plane;
    layer.redraw();
  }, [plane]);

  const close = () => dialog.current?.close();
  const badge = target ? sourceBadge(target) : null;

  return (
    <dialog ref={dialog} className="map-modal" aria-label={`World map: ${title}`}
      onClose={onClose} onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="map-modal-panel">
        <header className="map-modal-head">
          <div className="map-modal-title">
            <strong>🗺️ {title}</strong>
            {point
              ? <span className="muted small">{point.label} · {isUnderground(point) ? 'underground' : floorLabel(point.plane)} · tile {point.x}, {point.y}</span>
              : <span className="muted small">{status === 'loading' ? 'Searching for the place…' : 'A place without an exact point'}</span>}
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close the map">
            <IconClose />
          </button>
        </header>
        {(badge || target?.origin) && point && (
          <p className="map-source small">
            {badge && <span className="map-source-badge">{badge}</span>}
            {target?.origin && <span className="muted"> · coordinates: {target.origin}</span>}
          </p>
        )}
        {arrow && !target && (
          <p className="map-source small">
            🧭 {arrowLive ? 'The in-game arrow leads' : 'The arrow will lead'} to "{arrow.label}" <span className="muted">({SOURCE_TEXT[arrow.source]}, tile {arrow.x}, {arrow.y})</span>
            {arrowApart && <> {' '}<button type="button" className="link-btn" onClick={showArrow}>Show on the map</button></>}
          </p>
        )}
        {points.length > 1 && !target && (
          <div className="spot-switch" role="radiogroup" aria-label="Points on the map">
            {points.map((p, i) => (
              <button key={`${p.x},${p.y},${p.plane}`} type="button" role="radio" aria-checked={i === active}
                className={`spot-chip ${i === active ? 'is-active' : ''}`} onClick={() => onActive(i)}>
                📍 {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="map-modal-body">
          <div ref={holder} className="map-canvas" />
          {point && (
            <div className="map-floors" role="radiogroup" aria-label="Floor">
              {[0, 1, 2, 3].map((f) => (
                <button key={f} type="button" role="radio" aria-checked={plane === f} className={`map-floor ${plane === f ? 'is-active' : ''}`}
                  onClick={() => setPlane(f)} title={floorLabel(f)}>
                  {f + 1}
                </button>
              ))}
            </div>
          )}
          {status === 'loading' && (
            <div className="map-modal-offline map-modal-status" role="status" aria-live="polite">
              <p><strong>Searching for the place on the map…</strong></p>
              <p className="small muted">First the place dictionary, then a page on the OSRS Wiki.</p>
            </div>
          )}
          {(status === 'fallback' || status === 'error') && (
            <div className="map-modal-offline map-modal-status" role="status">
              <p><strong>The exact coordinate could not be determined automatically.</strong></p>
              <p className="small">
                {status === 'error' ? 'The OSRS Wiki did not answer, and the place dictionary does not have it. ' : ''}
                The place can be found by searching the OSRS Wiki — there is an article and its map.
              </p>
              {searchUrl && (
                <p><a className="btn btn-sm" href={searchUrl} target="_blank" rel="noopener noreferrer">Open the search on the OSRS Wiki <IconExternal /></a></p>
              )}
            </div>
          )}
          {offline && point && (
            <div className="map-modal-offline" role="status">
              <p><strong>The map did not load.</strong> The map tiles come from maps.runescape.wiki — the internet is needed.</p>
              <p className="small">Place: {point.label}, tile {point.x}, {point.y}, {floorLabel(point.plane)}.</p>
            </div>
          )}
        </div>
        {((navigate && point) || wikiUrl) && (
          <div className="map-modal-foot small">
            {navigate && point && <NavigateButton target={navigate} />}
            {wikiUrl && <a href={wikiUrl} target="_blank" rel="noopener noreferrer">Open the place on the wiki map <IconExternal /></a>}
          </div>
        )}
      </div>
    </dialog>
  );
}
