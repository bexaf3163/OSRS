// Карта мира на весь экран: тайлы OSRS Wiki в Leaflet, метки точек шага, переключение точек и этажей.
// Грузится отдельным куском только по кнопке «Карта мира» — Leaflet не утяжеляет запуск.
// Встроить страницу карты вики нельзя (X-Frame-Options: DENY), поэтому рендер свой — из тех же тайлов.
//
// Та же карта показывает и одно место из досье вики (target): где лежит предмет, магазин, NPC.
// Пока место ищется — «Ищу место…», не нашлось — ссылка на поиск вики, а кнопка «🧭» ведёт туда стрелку в игре.

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
  /** Точки шага; для одного места из досье — target. */
  points?: MapLocation[];
  active?: number;
  onActive?: (i: number) => void;
  target?: MapTarget | null;
  /** Место ещё ищется, поиск не удался или точной точки нет — вместо метки сообщение. */
  status?: MapStatus;
  /** Поиск по вики, когда точки нет. */
  searchUrl?: string;
  /** Временная цель для RuneLite; без неё кнопки «🧭» нет. */
  navigate?: NavTargetPayload;
  /** Куда ведёт стрелка в игре для этого шага — своя метка 🧭, даже если это не точка шага. */
  arrow?: NavigationTarget | null;
  /** Шаг показан в игре: карта открывается на цели стрелки. */
  arrowLive?: boolean;
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

/** Метка цели стрелки: крупная, со значком компаса — видна на любом масштабе. */
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
  // Точки приходят новыми объектами при каждой отрисовке — эффекты завязаны на координаты, иначе карта
  // возвращалась бы к метке, пока её двигают.
  const pointKey = point ? `${point.x},${point.y},${point.plane},${point.zoom ?? ''}` : '';
  const pointsKey = points.map((p) => `${p.x},${p.y},${p.plane},${p.label}`).join(';');
  const [plane, setPlane] = useState(point?.plane ?? 0);
  const [offline, setOffline] = useState(false);
  const arrowMarker = useRef<L.Marker | null>(null);
  /** Цель стрелки не совпадает ни с одной точкой шага — у неё своя кнопка «показать». */
  const arrowApart = Boolean(arrow && !target && !points.some((p) => samePoint(p, arrow)));
  const arrowKey = arrow ? `${arrow.x},${arrow.y},${arrow.plane},${arrow.label}` : '';

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Карта создаётся один раз — когда появилась первая точка (у места из досье её сначала ищут).
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
      // Мир OSRS: всё, что дальше, — пустые тайлы (404), их не запрашиваем.
      bounds: L.latLngBounds([1150, 1000], [13000, 4300]),
      attribution: MAP_ATTRIBUTION,
    });
    layer.on('tileload', () => { loaded++; setOffline(false); });
    // Нет связи — пустое окно не оставляем: сообщение поверх и ссылка на вики.
    layer.on('tileerror', () => { failed++; if (!loaded && failed >= 4) setOffline(true); });
    layer.addTo(m);
    // Шаг показан в игре, а стрелка ведёт не к точке шага — карта открывается там, куда ведёт стрелка.
    const start = arrowLive && arrow && arrowApart ? { ...arrow, zoom: undefined as number | undefined } : point;
    m.setView(center(start), start.zoom ?? DEFAULT_ZOOM);
    setPlane(start.plane);
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
  }, [hasPoint]); // Карта создаётся один раз на появление точки.

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
  }, [pointsKey, active, plane, onActive, hasPoint]);

  // Метка цели стрелки — поверх точек шага, с подписью «куда ведёт стрелка».
  useEffect(() => {
    const m = map.current;
    arrowMarker.current?.remove();
    arrowMarker.current = null;
    if (!m || !arrow || target) return;
    const tip = `🧭 ${arrowLive ? 'Стрелка в игре ведёт сюда' : 'Сюда поведёт стрелка'}: ${arrow.label}`;
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

  // Переключение точки: центр, масштаб и этаж точки.
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
    <dialog ref={dialog} className="map-modal" aria-label={`Карта мира: ${title}`}
      onClose={onClose} onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="map-modal-panel">
        <header className="map-modal-head">
          <div className="map-modal-title">
            <strong>🗺️ {title}</strong>
            {point
              ? <span className="muted small">{point.label} · {isUnderground(point) ? 'подземелье' : floorLabel(point.plane)} · клетка {point.x}, {point.y}</span>
              : <span className="muted small">{status === 'loading' ? 'Ищу место…' : 'Место без точной точки'}</span>}
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Закрыть карту">
            <IconClose />
          </button>
        </header>
        {(badge || target?.origin) && point && (
          <p className="map-source small">
            {badge && <span className="map-source-badge">{badge}</span>}
            {target?.origin && <span className="muted"> · координаты: {target.origin}</span>}
          </p>
        )}
        {arrow && !target && (
          <p className="map-source small">
            🧭 {arrowLive ? 'Стрелка в игре ведёт' : 'Стрелка поведёт'} к «{arrow.label}» <span className="muted">({SOURCE_TEXT[arrow.source]}, клетка {arrow.x}, {arrow.y})</span>
            {arrowApart && <> {' '}<button type="button" className="link-btn" onClick={showArrow}>Показать на карте</button></>}
          </p>
        )}
        {points.length > 1 && !target && (
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
          {point && (
            <div className="map-floors" role="radiogroup" aria-label="Этаж">
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
              <p><strong>Ищу место на карте…</strong></p>
              <p className="small muted">Сначала словарь мест, потом страница на OSRS Wiki.</p>
            </div>
          )}
          {(status === 'fallback' || status === 'error') && (
            <div className="map-modal-offline map-modal-status" role="status">
              <p><strong>Точную координату автоматически определить не удалось.</strong></p>
              <p className="small">
                {status === 'error' ? 'OSRS Wiki не ответила, а в словаре мест такого нет. ' : ''}
                Место можно найти поиском на OSRS Wiki — там статья и её карта.
              </p>
              {searchUrl && (
                <p><a className="btn btn-sm" href={searchUrl} target="_blank" rel="noopener noreferrer">Открыть поиск на OSRS Wiki <IconExternal /></a></p>
              )}
            </div>
          )}
          {offline && point && (
            <div className="map-modal-offline" role="status">
              <p><strong>Карта не загрузилась.</strong> Тайлы карты берутся с maps.runescape.wiki — нужен интернет.</p>
              <p className="small">Место: {point.label}, клетка {point.x}, {point.y}, {floorLabel(point.plane)}.</p>
            </div>
          )}
        </div>
        {((navigate && point) || wikiUrl) && (
          <div className="map-modal-foot small">
            {navigate && point && <NavigateButton target={navigate} />}
            {wikiUrl && <a href={wikiUrl} target="_blank" rel="noopener noreferrer">Открыть место на карте вики <IconExternal /></a>}
          </div>
        )}
      </div>
    </dialog>
  );
}
