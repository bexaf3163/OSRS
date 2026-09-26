// Глобальный поиск: окно поверх страницы, открывается кнопкой в шапке или клавишей «/».

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { plugins, reference, skills, steps } from '../data';
import { buildIndex, search, type SearchKind } from '../lib/search';
import { go } from '../lib/router';
import { IconClose, IconSearch, TYPE_LABEL } from './Icons';

const KIND_LABEL: Record<SearchKind, string> = {
  step: 'Шаг',
  range: 'Прокачка',
  skill: 'Навык',
  ref: 'Справка',
  plugin: 'Плагин',
};

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const index = useMemo(() => buildIndex({ steps, skills, reference, plugins, typeLabel: TYPE_LABEL }), []);
  const hits = useMemo(() => search(index, query), [index, query]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.select();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const pick = (href: string) => {
    onClose();
    go(href);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active].item.href); }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  return (
    <dialog ref={dialog} className="search-dialog" aria-label="Поиск" onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="search-box">
        <IconSearch />
        <input ref={input} type="search" className="search-input" placeholder="Код шага, квест, предмет, навык…"
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
          role="combobox" aria-expanded={hits.length > 0} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={hits.length ? `${listId}-${active}` : undefined} aria-label="Поиск" enterKeyHint="go" />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть поиск"><IconClose /></button>
      </div>
      <ul className="search-results" id={listId} role="listbox" aria-label="Результаты">
        {hits.map((h, i) => (
          <li key={`${h.item.href}-${h.item.code ?? h.item.title}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            className={`search-hit ${i === active ? 'is-active' : ''}`}
            onClick={() => pick(h.item.href)} onMouseMove={() => setActive(i)}>
            <span className="search-hit-head">
              {h.item.code && <code className="code">{h.item.code}</code>}
              <span className="search-hit-title">{h.item.title}</span>
            </span>
            <span className="search-hit-sub">{KIND_LABEL[h.item.kind]} · {h.item.subtitle}</span>
            {h.snippet && <span className="search-hit-snippet">{h.snippet}</span>}
          </li>
        ))}
      </ul>
      {query.trim() && !hits.length && <p className="muted empty">Ничего не нашлось.</p>}
      {!query.trim() && <p className="muted empty small">Например: S3-05, лосось, Quest Helper, WC-3, омары.</p>}
    </dialog>
  );
}
