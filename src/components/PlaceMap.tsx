// Places from the wiki dossier — onto the map and into the game: "📍 Port Sarim" opens the world map with a marker and the source caption,
// "🧭" leads the RuneLite arrow there. Coordinates — only from place search (dictionary → OSRS Wiki → wiki search):
// without a found point nothing goes to the game.

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

/** The map of one place: open at once with "Searching for the place…", then the marker or a wiki search. Closed earlier — the answer is discarded. */
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
  // On top of the dossier, not inside it: the slide-out panel has its own window.
  return createPortal(
    <Suspense fallback={null}>
      <WorldMapModal title={view.title} target={view.target} status={view.status} searchUrl={view.searchUrl}
        navigate={view.nav} onClose={onClose} />
    </Suspense>,
    document.body,
  );
}

/** "📍 place" — open on the map. */
export function PlaceButton({ query, children, onShow }: { query: PlaceQuery; children: ReactNode; onShow: (q: PlaceQuery) => void }) {
  return (
    <button type="button" className="place-link" onClick={() => onShow(query)} title="Show on the world map">
      <span aria-hidden="true">📍</span> {children}
    </button>
  );
}

/** "🧭" in a row — find the place and point the RuneLite arrow there at once, without opening the map. */
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
      notify('Could not find the place point — open the 📍 map: it has an OSRS Wiki search');
      return;
    }
    const res = await navigate(navPayload(query, r));
    setBusy(false);
    notify(res.ok ? `🧭 The in-game arrow leads to: ${r.label}` : res.reason === 'refused' ? `RuneLite refused: ${res.message}` : 'RuneLite offline — nowhere to point the arrow');
  };
  return (
    <button type="button" className="icon-btn nav-btn" onClick={() => void go()} disabled={busy}
      title="Point in RuneLite" aria-label={`Point in RuneLite: ${query.shop ?? query.npc ?? query.location}`}>
      🧭
    </button>
  );
}
