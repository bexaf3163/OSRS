// Места из досье вики — на карту и в игру: «📍 Port Sarim» открывает карту мира с меткой и подписью источника,
// «🧭» ведёт туда стрелку в RuneLite. Координаты — только из поиска мест (словарь → OSRS Wiki → поиск вики):
// без найденной точки в игру ничего не уходит.

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { isPoint } from '../services/locationResolver';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { mapTarget, navPayload, resolvePlace, type MapTarget, type PlaceQuery } from '../lib/places';
import type { MapStatus } from './WorldMapModal';

export type { PlaceQuery } from '../lib/places';

const WorldMapModal = lazy(() => import('./WorldMapModal'));

interface View {
  title: string;
  status?: MapStatus;
  target?: MapTarget;
  searchUrl?: string;
  nav?: NavTargetPayload;
}

/** Карта одного места: открыть сразу с «Ищу место…», потом метка или поиск вики. Закрыли раньше — ответ отбрасывается. */
export function usePlaceMap() {
  const [view, setView] = useState<View | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);

  const show = useCallback(async (q: PlaceQuery) => {
    const id = ++request.current;
    const title = q.kind === 'city' ? q.location : q.shop ?? q.npc ?? q.location;
    setView({ title, status: 'loading' });
    const r = await resolvePlace(q).catch(() => null);
    if (id !== request.current) return;
    if (!r) setView({ title, status: 'error' });
    else if (isPoint(r)) setView({ title, target: mapTarget(q, r), nav: navPayload(q, r) });
    else setView({ title, status: 'fallback', searchUrl: r.searchUrl });
  }, []);

  const close = useCallback(() => {
    request.current++;
    setView(null);
  }, []);

  return { view, show, close };
}

export function PlaceMapView({ view, onClose }: { view: View | null; onClose: () => void }) {
  if (!view) return null;
  // Поверх досье, а не внутри него: у выдвижной панели своё окно.
  return createPortal(
    <Suspense fallback={null}>
      <WorldMapModal title={view.title} target={view.target} status={view.status} searchUrl={view.searchUrl}
        navigate={view.nav} onClose={onClose} />
    </Suspense>,
    document.body,
  );
}

/** «📍 место» — открыть на карте. */
export function PlaceButton({ query, children, onShow }: { query: PlaceQuery; children: ReactNode; onShow: (q: PlaceQuery) => void }) {
  return (
    <button type="button" className="place-link" onClick={() => onShow(query)} title="Показать на карте мира">
      <span aria-hidden="true">📍</span> {children}
    </button>
  );
}

/** «🧭» в строке — найти место и сразу направить туда стрелку в RuneLite, не открывая карту. */
export function PlaceNavButton({ query }: { query: PlaceQuery }) {
  const { enabled, navigate } = useBridge();
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  const go = async () => {
    setBusy(true);
    const r = await resolvePlace(query).catch(() => null);
    if (!r || !isPoint(r)) {
      setBusy(false);
      notify('Точку места не нашёл — открой 📍 карту: там поиск на OSRS Wiki');
      return;
    }
    const res = await navigate(navPayload(query, r));
    setBusy(false);
    notify(res.ok ? `🧭 Стрелка в игре ведёт к: ${r.label}` : res.reason === 'refused' ? `RuneLite отказал: ${res.message}` : 'RuneLite offline — стрелку поставить некуда');
  };
  return (
    <button type="button" className="icon-btn nav-btn" onClick={() => void go()} disabled={busy}
      title="Указать в RuneLite" aria-label={`Указать в RuneLite: ${query.shop ?? query.npc ?? query.location}`}>
      🧭
    </button>
  );
}
