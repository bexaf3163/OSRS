// The global search: a window over the page, opened by the header button or the "/" key.
// The results are in groups: the walkthrough steps, the item database (with the exchange price), skills and the reference, the OSRS Wiki.

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { items, membersSkills, plugins, reference, skills } from '../data';
import { useStore } from '../store';
import { buildIndex, search, type SearchHit, type SearchKind } from '../lib/search';
import { formatXp } from '../lib/goals';
import { go } from '../lib/router';
import { getGePrice } from '../services/pricesApi';
import { IconClose, IconSearch, TYPE_LABEL } from './Icons';
import { ItemIcon, useWiki } from './WikiDrawer';

const KIND_LABEL: Record<SearchKind, string> = {
  step: 'Step',
  item: 'Item',
  range: 'Training',
  skill: 'Skill',
  ref: 'Reference',
  plugin: 'Plugin',
};

interface Group {
  id: string;
  title: string;
  hits: SearchHit[];
}

/** The "find on the wiki" row: a live search when the local database lacks what is needed. */
const WIKI_ROW = 'wiki';

export function SearchBox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { steps, mode } = useStore();
  const { openItem } = useWiki();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [prices, setPrices] = useState<Record<number, number | null>>({});
  const listId = useId();
  // Members skills are searched only in Members mode — like the steps of stages 7–9.
  const index = useMemo(() => buildIndex({
    steps, skills: mode === 'members' ? [...skills, ...membersSkills] : skills, reference, plugins, items, typeLabel: TYPE_LABEL,
  }), [steps, mode]);

  const groups = useMemo<Group[]>(() => {
    const hits = search(index, query, 400);
    const of = (kinds: SearchKind[], limit: number) => hits.filter((h) => kinds.includes(h.item.kind)).slice(0, limit);
    return [
      { id: 'steps', title: 'Walkthrough steps', hits: of(['step'], 12) },
      { id: 'items', title: 'OSRS item database', hits: of(['item'], 8) },
      { id: 'other', title: 'Skills and reference', hits: of(['skill', 'range', 'ref', 'plugin'], 10) },
    ].filter((g) => g.hits.length);
  }, [index, query]);

  const flat = groups.flatMap((g) => g.hits);
  const hasQuery = query.trim().length > 1;
  const rows = flat.length + (hasQuery ? 1 : 0);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.select();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // The exchange prices for found items: one shared request, then a 5-minute cache.
  useEffect(() => {
    let alive = true;
    const ids = flat.map((h) => h.item.itemId).filter((id): id is number => id !== undefined && !(id in prices));
    if (!ids.length) return;
    Promise.all(ids.map((id) => getGePrice(id).then((p) => [id, p?.buyPrice ?? null] as const).catch(() => [id, null] as const)))
      .then((pairs) => alive && setPrices((old) => ({ ...old, ...Object.fromEntries(pairs) })));
    return () => { alive = false; };
    // prices is not in the dependencies: otherwise every update would start another round.
  }, [groups]);

  const pick = (hit: SearchHit | typeof WIKI_ROW) => {
    onClose();
    if (hit === WIKI_ROW) openItem(query.trim());
    else if (hit.item.itemId !== undefined) openItem(hit.item.itemId, hit.item.title);
    else go(hit.item.href);
  };

  const rowAt = (i: number) => (i < flat.length ? flat[i] : WIKI_ROW);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && rows) { e.preventDefault(); pick(rowAt(active)); }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  let n = -1;
  return (
    <dialog ref={dialog} className="search-dialog" aria-label="Search" onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="search-box">
        <IconSearch />
        <input ref={input} type="search" className="search-input" placeholder="Step, quest, NPC, item, skill…"
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
          role="combobox" aria-expanded={rows > 0} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={rows ? `${listId}-${active}` : undefined} aria-label="Search" enterKeyHint="go" />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close the search"><IconClose /></button>
      </div>
      <ul className="search-results" id={listId} role="listbox" aria-label="Results">
        {groups.map((g) => (
          <Fragment key={g.id}>
            <li role="presentation" className="search-group">{g.title}</li>
            {g.hits.map((h) => {
              const i = ++n;
              const price = h.item.itemId !== undefined ? prices[h.item.itemId] : undefined;
              return (
                <li key={`${h.item.href}-${h.item.code ?? h.item.title}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  className={`search-hit ${h.item.kind === 'item' ? 'is-item' : ''} ${i === active ? 'is-active' : ''}`}
                  onClick={() => pick(h)} onMouseMove={() => setActive(i)}>
                  <span className="search-hit-head">
                    {h.item.icon !== undefined && <ItemIcon src={h.item.icon} alt="" />}
                    {h.item.code && <code className="code">{h.item.code}</code>}
                    <span className="search-hit-title">{h.item.title}</span>
                    {h.item.kind === 'item' && (
                      <span className="search-hit-price">{price ? `${formatXp(price)} gp` : price === null ? '—' : ''}</span>
                    )}
                  </span>
                  <span className="search-hit-sub">{h.item.kind === 'item' ? h.item.subtitle : `${KIND_LABEL[h.item.kind]} · ${h.item.subtitle}`}</span>
                  {h.snippet && <span className="search-hit-snippet">{h.snippet}</span>}
                </li>
              );
            })}
          </Fragment>
        ))}
        {hasQuery && (
          <>
            <li role="presentation" className="search-group">OSRS Wiki</li>
            <li id={`${listId}-${flat.length}`} role="option" aria-selected={active === flat.length}
              className={`search-hit ${active === flat.length ? 'is-active' : ''}`}
              onClick={() => pick(WIKI_ROW)} onMouseMove={() => setActive(flat.length)}>
              <span className="search-hit-head"><IconSearch /><span className="search-hit-title">Find "{query.trim()}" on the OSRS Wiki</span></span>
              <span className="search-hit-sub">It opens in the inspector: price, shops, drops</span>
            </li>
          </>
        )}
      </ul>
      {!query.trim() && <p className="muted empty small">For example: S3-05, Mizgog, salmon, Anti-dragon shield, WC-3, Quest Helper.</p>}
    </dialog>
  );
}
