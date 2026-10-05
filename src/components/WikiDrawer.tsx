// The built-in wiki inspector: an item or NPC dossier.
// On a wide "Path" screen it is a pinned third column, otherwise a slide-out panel on the right.
// Opened by a click on an item/NPC in the step card or from the search; closed by ✕, a click on the backdrop or Escape.
// Places in the dossier (where it lies for free, shops, sellers, towns, the NPC's place) — "📍" onto the world map and "🧭" into the game.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DOCK, useMediaQuery } from '../lib/media';
import type { StepNpcInfo, WikiItemDetail } from '../types';
import { findLocalItem, getItemDetail, getNpcDetail } from '../services/wikiService';
import type { NpcInfo } from '../services/wikiApi';
import { formatXp } from '../lib/goals';
import { IconClose, IconExternal } from './Icons';
import { useFeatures } from '../lib/features';
import { PlaceButton, PlaceMapView, PlaceNavButton, usePlaceMap, type PlaceQuery } from './PlaceMap';

type Target =
  | { kind: 'item'; query: string | number; label?: string }
  | { kind: 'npc'; npc: StepNpcInfo };

interface WikiContextValue {
  openItem: (query: string | number, label?: string) => void;
  openNpc: (npc: StepNpcInfo) => void;
  /** A place for the pinned column: a page registers the element while it is on screen. */
  setDock: (el: HTMLElement | null) => void;
}

const WikiContext = createContext<WikiContextValue | null>(null);

export function useWiki(): WikiContextValue {
  const v = useContext(WikiContext);
  if (!v) throw new Error('useWiki outside WikiProvider');
  return v;
}

export function WikiProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const wide = useMediaQuery(DOCK);
  const openItem = useCallback((query: string | number, label?: string) => setTarget({ kind: 'item', query, label }), []);
  const openNpc = useCallback((npc: StepNpcInfo) => setTarget({ kind: 'npc', npc }), []);
  const value = useMemo(() => ({ openItem, openNpc, setDock }), [openItem, openNpc]);
  const docked = wide && dock !== null;
  const close = useCallback(() => setTarget(null), []);
  return (
    <WikiContext.Provider value={value}>
      {children}
      {docked
        ? createPortal(<DockedInspector target={target} onClose={close} />, dock)
        : <WikiDrawer target={target} onClose={close} />}
    </WikiContext.Provider>
  );
}

/** A place for the pinned dossier. While it is on screen, the inspector is drawn here. */
export function WikiDock({ className }: { className?: string }) {
  const { setDock } = useWiki();
  return <aside className={className} ref={setDock} aria-label="OSRS Wiki inspector" />;
}

function DockedInspector({ target, onClose }: { target: Target | null; onClose: () => void }) {
  if (!target) {
    return (
      <div className="dock-empty">
        <p className="dock-empty-title">OSRS Wiki dossier</p>
        <p className="muted small">Click an item or NPC in a step — the exchange price, shops, drops and where to get it for free will appear here.</p>
      </div>
    );
  }
  return (
    <div className="dock-panel" key={target.kind === 'item' ? String(target.query) : target.npc.nameEn}>
      <button type="button" className="icon-btn drawer-close" onClick={onClose} aria-label="Close the dossier">
        <IconClose />
      </button>
      {target.kind === 'item' ? <ItemView query={target.query} label={target.label} /> : <NpcView npc={target.npc} />}
    </div>
  );
}

const CLOSE_MS = 180;

function WikiDrawer({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (target) setClosing(false);
  }, [target]);

  const close = useCallback(() => {
    const d = dialog.current;
    if (!d?.open) return;
    setClosing(true);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      d.close();
      setClosing(false);
      onClose();
    }, reduce ? 0 : CLOSE_MS);
  }, [onClose]);

  return (
    <dialog ref={dialog} className={`drawer ${closing ? 'is-closing' : ''}`} aria-label="OSRS Wiki inspector"
      // The world map from the dossier is a separate window in a portal, but React events bubble up the component tree:
      // Escape in the map closes only the map, not the dossier under it.
      onCancel={(e) => { if (e.target !== dialog.current) return; e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="drawer-panel">
        <button type="button" className="icon-btn drawer-close" onClick={close} aria-label="Close">
          <IconClose />
        </button>
        {target?.kind === 'item' && <ItemView key={String(target.query)} query={target.query} label={target.label} />}
        {target?.kind === 'npc' && <NpcView key={target.npc.nameEn} npc={target.npc} />}
      </div>
    </dialog>
  );
}

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-US');
}

const gp = (n: number) => `${formatXp(n)} gp`;

function ItemView({ query, label }: { query: string | number; label?: string }) {
  const local = findLocalItem(query);
  const [item, setItem] = useState<WikiItemDetail | null | undefined>(local);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'missing'>('loading');
  const places = usePlaceMap();
  const { autoLocation } = useFeatures();

  useEffect(() => {
    let alive = true;
    getItemDetail(query)
      .then((d) => {
        if (!alive) return;
        if (d) { setItem(d); setStatus('ready'); } else setStatus(local ? 'offline' : 'missing');
      })
      .catch(() => alive && setStatus(local ? 'offline' : 'missing'));
    return () => { alive = false; };
  }, [query, local]);

  if (!item) {
    return (
      <div className="drawer-body">
        <header className="drawer-hero"><div className="drawer-title"><h2>{label ?? String(query)}</h2></div></header>
        {status === 'loading'
          ? <p className="muted drawer-state" aria-live="polite">Searching the OSRS Wiki…</p>
          : <p className="notice is-error">Could not find the item on the OSRS Wiki. Check your internet connection.</p>}
      </div>
    );
  }

  return (
    <div className="drawer-body">
      <header className="drawer-hero">
        <span className="drawer-icon"><ItemIcon src={item.iconUrl} alt="" size={36} /></span>
        <div className="drawer-title">
          <h2>{item.nameEn}</h2>
          <span className={`badge ${item.members ? 'badge-members' : 'badge-f2p'}`}>{item.members ? 'Members' : 'Free-to-play'}</span>
        </div>
      </header>
      {item.examine && <p className="drawer-examine">“{item.examine}”</p>}

      <div className="tiles">
        <div className="tile tile-ge">
          <span className="tile-label">💰 Grand Exchange</span>
          {item.gePrice ? (
            <>
              <span className="tile-value">{gp(item.gePrice.buyPrice)}</span>
              <span className="tile-sub">buy · sell {gp(item.gePrice.sellPrice)}</span>
              <span className="tile-sub">updated {timeAgo(item.gePrice.updatedAt)}</span>
            </>
          ) : (
            <span className="tile-sub">{status === 'loading' ? 'Loading the price…' : status === 'offline' || item.priceUnavailable ? 'No connection — the price is unavailable' : 'Not sold on the exchange'}</span>
          )}
        </div>
        <div className="tile">
          <span className="tile-label">⚗️ High Alchemy</span>
          <span className="tile-value">{item.highAlch !== undefined ? gp(item.highAlch) : '—'}</span>
          {item.lowAlch !== undefined && <span className="tile-sub">Low Alchemy {gp(item.lowAlch)}</span>}
        </div>
        <div className="tile">
          <span className="tile-label">🏪 Store value</span>
          <span className="tile-value">{gp(item.value)}</span>
          <span className="tile-sub">the base price at traders</span>
        </div>
      </div>

      {item.freeSpawns && item.freeSpawns.length > 0 && (
        <section className="drawer-section">
          <h3>Where to get it for free</h3>
          <ul className={`drawer-list ${autoLocation ? 'is-places' : ''}`}>
            {item.freeSpawns.map((s) => {
              if (!autoLocation) return <li key={s}>{s}</li>;
              const q: PlaceQuery = { kind: 'spawn', location: s, item };
              return (
                <li key={s} className="place-row">
                  <PlaceButton query={q} onShow={places.show}>{s}</PlaceButton>
                  <PlaceNavButton query={q} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {item.buyLocations && item.buyLocations.length > 0 && (
        <section className="drawer-section">
          <h3>Shops and traders</h3>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Shops">
            <table className="table table-compact">
              <thead><tr><th scope="col">Shop</th><th scope="col">NPC</th><th scope="col">Town</th><th scope="col">Price</th><th scope="col">Stock</th></tr></thead>
              <tbody>
                {item.buyLocations.map((b) => {
                  const shop: PlaceQuery = { kind: 'shop', location: b.location, shop: b.shopName, npc: b.owner };
                  return (
                    <tr key={b.shopName}>
                      <th scope="row">
                        {autoLocation ? <PlaceButton query={shop} onShow={places.show}>{b.shopName}</PlaceButton> : b.shopName}
                        {b.members && <span className="badge badge-members badge-sm">M</span>}
                        {autoLocation && <PlaceNavButton query={shop} />}
                      </th>
                      <td>
                        {b.owner && autoLocation
                          ? <PlaceButton query={{ ...shop, kind: 'npc' }} onShow={places.show}>{b.owner}</PlaceButton>
                          : b.owner ?? '—'}
                      </td>
                      <td>
                        {b.location && autoLocation
                          ? <PlaceButton query={{ kind: 'city', location: b.location }} onShow={places.show}>{b.location}</PlaceButton>
                          : b.location || '—'}
                      </td>
                      <td className="num">{gp(b.price)}</td>
                      <td className="num">{b.stock}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {item.dropSources && item.dropSources.length > 0 && (
        <section className="drawer-section">
          <h3>Monster drops</h3>
          <ul className="drop-list">
            {item.dropSources.map((d) => (
              <li key={d.monster}>
                <span>{d.monster}</span>
                <span className="muted">{d.combatLevel !== null ? `lvl ${d.combatLevel}` : ''}</span>
                <span className="drop-rate">{d.rate}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === 'offline' && <p className="muted small">No connection to the OSRS Wiki — the saved data is shown.</p>}

      <footer className="drawer-footer">
        <a className="btn btn-ghost" href={item.wikiUrl} target="_blank" rel="noopener noreferrer">
          Open the full article on the OSRS Wiki <IconExternal />
        </a>
      </footer>
      <PlaceMapView view={places.view} onClose={places.close} />
    </div>
  );
}

function NpcView({ npc }: { npc: StepNpcInfo }) {
  const [info, setInfo] = useState<NpcInfo | null | undefined>(undefined);
  const places = usePlaceMap();
  const { autoLocation } = useFeatures();
  const here: PlaceQuery = { kind: 'npc', location: info?.location || npc.location, npc: npc.nameEn };
  useEffect(() => {
    let alive = true;
    getNpcDetail(npc.nameEn).then((d) => alive && setInfo(d)).catch(() => alive && setInfo(null));
    return () => { alive = false; };
  }, [npc.nameEn]);

  return (
    <div className="drawer-body">
      <header className="drawer-hero">
        {info?.imageUrl && <span className="drawer-icon drawer-icon-npc"><ItemIcon src={info.imageUrl} alt="" size={48} /></span>}
        <div className="drawer-title">
          <h2>{npc.nameEn}</h2>
          <span className="badge badge-npc">NPC</span>
        </div>
      </header>
      {info?.examine && <p className="drawer-examine">“{info.examine}”</p>}
      <dl className="fields">
        <div className="field"><dt>Where</dt><dd>{npc.location}</dd></div>
        <div className="field"><dt>Floor</dt><dd>{npc.floor}</dd></div>
        {npc.dialogue && <div className="field"><dt>Dialogue</dt><dd>{npc.dialogue}</dd></div>}
        {info?.location && <div className="field"><dt>Per the wiki</dt><dd>{info.location}</dd></div>}
      </dl>
      {autoLocation && (
        <p className="place-row">
          <PlaceButton query={here} onShow={places.show}>{npc.nameEn} on the world map</PlaceButton>
          <PlaceNavButton query={here} />
        </p>
      )}
      {info === undefined && <p className="muted drawer-state" aria-live="polite">Loading from the OSRS Wiki…</p>}
      <p className="muted small">Floors are numbered the British way: the Ground floor is ground level, the 1st floor is the one above it (the 2nd floor in US numbering).</p>
      <footer className="drawer-footer">
        <a className="btn btn-ghost" href={npc.wikiUrl ?? info?.wikiUrl} target="_blank" rel="noopener noreferrer">
          Open the article on the OSRS Wiki <IconExternal />
        </a>
      </footer>
      <PlaceMapView view={places.view} onClose={places.close} />
    </div>
  );
}

/** A fixed-size wiki icon without stretching; on error — an empty plate. */
export function ItemIcon({ src, alt, size = 20 }: { src?: string; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="item-icon item-icon-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <img className="item-icon" src={src} alt={alt} width={size} height={size} loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
