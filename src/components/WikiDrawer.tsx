// Встроенный инспектор вики: досье предмета или NPC.
// На широком экране «Пути» — закреплённая третья колонка, иначе — выдвижная панель справа.
// Открывается кликом по предмету/NPC в карточке шага или из поиска; закрывается ✕, кликом по фону или Escape.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DOCK, useMediaQuery } from '../lib/media';
import type { StepNpcInfo, WikiItemDetail } from '../types';
import { findLocalItem, getItemDetail, getNpcDetail } from '../services/wikiService';
import type { NpcInfo } from '../services/wikiApi';
import { formatXp } from '../lib/goals';
import { IconClose, IconExternal } from './Icons';

type Target =
  | { kind: 'item'; query: string | number; label?: string }
  | { kind: 'npc'; npc: StepNpcInfo };

interface WikiContextValue {
  openItem: (query: string | number, label?: string) => void;
  openNpc: (npc: StepNpcInfo) => void;
  /** Место для закреплённой колонки: страница регистрирует элемент, пока она на экране. */
  setDock: (el: HTMLElement | null) => void;
}

const WikiContext = createContext<WikiContextValue | null>(null);

export function useWiki(): WikiContextValue {
  const v = useContext(WikiContext);
  if (!v) throw new Error('useWiki вне WikiProvider');
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

/** Место под закреплённое досье. Пока оно на экране, инспектор рисуется здесь. */
export function WikiDock({ className }: { className?: string }) {
  const { setDock } = useWiki();
  return <aside className={className} ref={setDock} aria-label="Инспектор OSRS Wiki" />;
}

function DockedInspector({ target, onClose }: { target: Target | null; onClose: () => void }) {
  if (!target) {
    return (
      <div className="dock-empty">
        <p className="dock-empty-title">Досье OSRS Wiki</p>
        <p className="muted small">Нажми на предмет или NPC в шаге — здесь появятся цена на бирже, магазины, дроп и где взять бесплатно.</p>
      </div>
    );
  }
  return (
    <div className="dock-panel" key={target.kind === 'item' ? String(target.query) : target.npc.nameEn}>
      <button type="button" className="icon-btn drawer-close" onClick={onClose} aria-label="Закрыть досье">
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
    <dialog ref={dialog} className={`drawer ${closing ? 'is-closing' : ''}`} aria-label="Инспектор OSRS Wiki"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === dialog.current) close(); }}>
      <div className="drawer-panel">
        <button type="button" className="icon-btn drawer-close" onClick={close} aria-label="Закрыть">
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
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} ч назад` : new Date(iso).toLocaleDateString('ru-RU');
}

const gp = (n: number) => `${formatXp(n)} gp`;

function ItemView({ query, label }: { query: string | number; label?: string }) {
  const local = findLocalItem(query);
  const [item, setItem] = useState<WikiItemDetail | null | undefined>(local);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'missing'>('loading');

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
          ? <p className="muted drawer-state" aria-live="polite">Ищу на OSRS Wiki…</p>
          : <p className="notice is-error">Не удалось найти предмет на OSRS Wiki. Проверь подключение к интернету.</p>}
      </div>
    );
  }

  return (
    <div className="drawer-body">
      <header className="drawer-hero">
        <span className="drawer-icon"><ItemIcon src={item.iconUrl} alt="" size={36} /></span>
        <div className="drawer-title">
          <h2>{item.nameEn}</h2>
          {item.nameRu && <p className="drawer-ru">{item.nameRu}</p>}
          <span className={`badge ${item.members ? 'badge-members' : 'badge-f2p'}`}>{item.members ? 'Members' : 'Free-to-play'}</span>
        </div>
      </header>
      {item.examine && <p className="drawer-examine">«{item.examine}»</p>}

      <div className="tiles">
        <div className="tile tile-ge">
          <span className="tile-label">💰 Grand Exchange</span>
          {item.gePrice ? (
            <>
              <span className="tile-value">{gp(item.gePrice.buyPrice)}</span>
              <span className="tile-sub">покупка · продажа {gp(item.gePrice.sellPrice)}</span>
              <span className="tile-sub">обновлено {timeAgo(item.gePrice.updatedAt)}</span>
            </>
          ) : (
            <span className="tile-sub">{status === 'loading' ? 'Загружаю цену…' : status === 'offline' ? 'Нет связи — цена недоступна' : 'Не продаётся на бирже'}</span>
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
          <span className="tile-sub">базовая цена у торговцев</span>
        </div>
      </div>

      {item.freeSpawns && item.freeSpawns.length > 0 && (
        <section className="drawer-section">
          <h3>Где взять бесплатно</h3>
          <ul className="drawer-list">{item.freeSpawns.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>
      )}

      {item.buyLocations && item.buyLocations.length > 0 && (
        <section className="drawer-section">
          <h3>Магазины и торговцы</h3>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Магазины">
            <table className="table table-compact">
              <thead><tr><th scope="col">Магазин</th><th scope="col">NPC</th><th scope="col">Город</th><th scope="col">Цена</th><th scope="col">Запас</th></tr></thead>
              <tbody>
                {item.buyLocations.map((b) => (
                  <tr key={b.shopName}>
                    <th scope="row">{b.shopName}{b.members && <span className="badge badge-members badge-sm">M</span>}</th>
                    <td>{b.owner ?? '—'}</td>
                    <td>{b.location || '—'}</td>
                    <td className="num">{gp(b.price)}</td>
                    <td className="num">{b.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {item.dropSources && item.dropSources.length > 0 && (
        <section className="drawer-section">
          <h3>Дроп с монстров</h3>
          <ul className="drop-list">
            {item.dropSources.map((d) => (
              <li key={d.monster}>
                <span>{d.monster}</span>
                <span className="muted">{d.combatLevel !== null ? `ур. ${d.combatLevel}` : ''}</span>
                <span className="drop-rate">{d.rate}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === 'offline' && <p className="muted small">Нет связи с OSRS Wiki — показаны сохранённые данные.</p>}

      <footer className="drawer-footer">
        <a className="btn btn-ghost" href={item.wikiUrl} target="_blank" rel="noopener noreferrer">
          Открыть полную статью на OSRS Wiki <IconExternal />
        </a>
      </footer>
    </div>
  );
}

function NpcView({ npc }: { npc: StepNpcInfo }) {
  const [info, setInfo] = useState<NpcInfo | null | undefined>(undefined);
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
          <p className="drawer-ru">{npc.nameRu}</p>
          <span className="badge badge-npc">NPC</span>
        </div>
      </header>
      {info?.examine && <p className="drawer-examine">«{info.examine}»</p>}
      <dl className="fields">
        <div className="field"><dt>Где</dt><dd>{npc.location}</dd></div>
        <div className="field"><dt>Этаж</dt><dd>{npc.floor}</dd></div>
        {npc.dialogue && <div className="field"><dt>Диалог</dt><dd>{npc.dialogue}</dd></div>}
        {info?.location && <div className="field"><dt>По вики</dt><dd>{info.location}</dd></div>}
      </dl>
      {info === undefined && <p className="muted drawer-state" aria-live="polite">Загружаю с OSRS Wiki…</p>}
      <p className="muted small">Этажи в игре считаются по-британски: Ground floor — 1-й этаж (земля), 1st floor — 2-й, 2nd floor — 3-й.</p>
      <footer className="drawer-footer">
        <a className="btn btn-ghost" href={npc.wikiUrl ?? info?.wikiUrl} target="_blank" rel="noopener noreferrer">
          Открыть статью на OSRS Wiki <IconExternal />
        </a>
      </footer>
    </div>
  );
}

/** Иконка с вики фиксированного размера без растяжения; при ошибке — пустая плашка. */
export function ItemIcon({ src, alt, size = 20 }: { src?: string; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="item-icon item-icon-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <img className="item-icon" src={src} alt={alt} width={size} height={size} loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
