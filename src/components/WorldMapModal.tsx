// Карта мира на весь экран: тайлы OSRS Wiki в Leaflet, метки точек шага, переключение точек и этажей.
// Грузится отдельным куском только по кнопке «Карта мира» — Leaflet не утяжеляет запуск.
// Встроить страницу карты вики нельзя (X-Frame-Options: DENY), поэтому рендер свой — из тех же тайлов.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapLocation } from '../types';
import { DEFAULT_ZOOM, floorLabel, isUnderground, MAP_ATTRIBUTION, MAX_ZOOM, MIN_ZOOM, tileUrl } from '../lib/map';
import { IconClose, IconExternal } from './Icons';

interface Props {
  title: string;
  points: MapLocation[];
  active: number;
  onActive: (i: number) => void;
  wikiUrl?: string;
  onClose: () => void;
}

/** Тайлы вики в системе координат игры: широта — y клетки, долгота — x. Тайл Leaflet (x, y) — это тайл вики (x, −y − 1). */
const WikiTiles = L.TileLayer.extend({
  getTileUrl(this: L.TileLayer & { options: { plane: number } }, c: L.Coords) {
    return tileUrl(c.z, this.options.plane, c.x, -c.y - 1);
  },
});

/** Центр клетки — чтобы метка стояла посередине, а не на углу. */
const center = (p: MapLocation) => L.latLng(p.y + 0.5, p.x + 0.5);

function pinIcon(active: boolean): L.DivIcon {
  return L.divIcon({ className: `map-pin ${active ? 'is-active' : ''}`, html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
}

export default function WorldMapModal({ title, points, active, onActive, wikiUrl, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const point = points[Math.min(active, points.length - 1)];
  // Точки приходят новыми объектами при каждой отрисовке — эффекты завязаны на координаты, иначе карта
  // возвращалась бы к метке, пока её двигают.
  const pointKey = `${point.x},${point.y},${point.plane},${point.zoom ?? ''}`;
  const pointsKey = points.map((p) => `${p.x},${p.y},${p.plane},${p.label}`).join(';');
  const [plane, setPlane] = useState(point.plane);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Карта создаётся один раз; точки и этаж дальше меняются без пересоздания.
  useEffect(() => {
    if (!holder.current) return;
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
      // Мир OSRS: всё, что дальше, — пустые тайлы (404), их не запрашиваем.
      bounds: L.latLngBounds([1150, 1000], [13000, 4300]),
      attribution: MAP_ATTRIBUTION,
    });
    layer.on('tileload', () => { loaded++; setOffline(false); });
    // Нет связи — пустое окно не оставляем: сообщение поверх и ссылка на вики.
    layer.on('tileerror', () => { failed++; if (!loaded && failed >= 4) setOffline(true); });
    layer.addTo(m);
    m.setView(center(point), point.zoom ?? DEFAULT_ZOOM);
    map.current = m;
    tiles.current = layer;
    // Размер окна известен только после showModal.
    const t = window.setTimeout(() => m.invalidateSize(), 0);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      tiles.current = null;
      markers.current = [];
    };
  }, []); // Карта создаётся один раз.

  // Метки всех точек: активная — крупнее и пульсирует, подпись видна всегда.
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
  }, [pointsKey, active, plane, onActive]);

  // Переключение точки: центр, масштаб и этаж точки.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
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

  return (
    <dialog ref={dialog} className="map-modal" aria-label={`Карта мира: ${title}`}
      onClose={onClose} onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="map-modal-panel">
        <header className="map-modal-head">
          <div className="map-modal-title">
            <strong>🗺️ {title}</strong>
            <span className="muted small">{point.label} · {isUnderground(point) ? 'подземелье' : floorLabel(point.plane)} · клетка {point.x}, {point.y}</span>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Закрыть карту">
            <IconClose />
          </button>
        </header>
        {points.length > 1 && (
          <div className="spot-switch" role="radiogroup" aria-label="Точки на карте">
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
          <div className="map-floors" role="radiogroup" aria-label="Этаж">
            {[0, 1, 2, 3].map((f) => (
              <button key={f} type="button" role="radio" aria-checked={plane === f} className={`map-floor ${plane === f ? 'is-active' : ''}`}
                onClick={() => setPlane(f)} title={floorLabel(f)}>
                {f + 1}
              </button>
            ))}
          </div>
          {offline && (
            <div className="map-modal-offline" role="status">
              <p><strong>Карта не загрузилась.</strong> Тайлы карты берутся с maps.runescape.wiki — нужен интернет.</p>
              <p className="small">Место: {point.label}, клетка {point.x}, {point.y}, {floorLabel(point.plane)}.</p>
            </div>
          )}
        </div>
        {wikiUrl && (
          <p className="map-modal-foot small">
            <a href={wikiUrl} target="_blank" rel="noopener noreferrer">Открыть место на карте вики <IconExternal /></a>
          </p>
        )}
      </div>
    </dialog>
  );
}
