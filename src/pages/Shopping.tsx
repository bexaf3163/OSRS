// «🛒 Оптовый список Grand Exchange»: одна закупка на несколько этапов вперёд.
// Цены — из того же сервиса цен OSRS Wiki, что и инспектор предметов; что уже есть — из RuneLite.
// Покупать приходится самому: программа только собирает список, копирует названия и подсказывает на бирже.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed, currentStage } from '../lib/next-step';
import { parseAmount } from '../lib/checklist';
import {
  aggregateShopping, formatGp, holdingFor, plural, pluginCount, shoppingText, type Holding, type ShoppingItemStatus, type ShoppingLine,
} from '../lib/shopping';
import { MAX_OWNED } from '../lib/progress';
import { getGePrice, getMapping, type GePrice } from '../services/pricesApi';
import { ItemIcon } from '../components/WikiDrawer';
import { copyText as copy } from '../lib/clipboard';

const RANGE_KEY = 'osrs-put:shopping-range';
const FILTER_KEY = 'osrs-put:shopping-filter';

/** Что показывать: по умолчанию — то, что ещё надо купить (и что неизвестно), чтобы список не рос от купленного. */
type Filter = 'need' | 'partial' | 'have' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'need', label: 'Нужно купить' },
  { id: 'partial', label: 'Частично есть' },
  { id: 'have', label: 'Уже есть' },
  { id: 'all', label: 'Все' },
];
const shows = (f: Filter, st: ShoppingItemStatus) => (f === 'all' ? true
  : f === 'have' ? st === 'SUFFICIENT'
    : f === 'partial' ? st === 'PARTIAL'
      : st !== 'SUFFICIENT');

function loadFilter(): Filter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    return FILTERS.some((f) => f.id === v) ? (v as Filter) : 'need';
  } catch {
    return 'need';
  }
}

interface Range {
  from: number;
  to: number;
  openOnly: boolean;
}

/** Сохранённый диапазон; `null`, массив и прочий мусор в хранилище — как будто ничего не сохраняли. */
function loadRange(): Partial<Range> {
  try {
    const data = JSON.parse(localStorage.getItem(RANGE_KEY) ?? '{}') as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const r = data as Record<string, unknown>;
    return {
      from: typeof r.from === 'number' ? r.from : undefined,
      to: typeof r.to === 'number' ? r.to : undefined,
      openOnly: typeof r.openOnly === 'boolean' ? r.openOnly : undefined,
    };
  } catch {
    return {};
  }
}

interface Row {
  line: ShoppingLine;
  /** Сколько есть, откуда это известно и сколько купить. */
  h: Holding;
  price?: GePrice | null;
}

/** Где что лежит: «в сумке 5 · в банке 8», «отмечено вручную», «? банк не открыт». */
function sourceNote(h: Holding): string {
  const parts: string[] = [];
  if (h.source === 'live') parts.push(`в сумке ${h.carried ?? 0} · в банке ${h.bank ?? 0}`);
  else if (h.source === 'manual') {
    parts.push(`отмечено вручную: ${h.manual}`);
    if (h.carried) parts.push(`в сумке ${h.carried}`);
  } else if (h.source === 'bag') parts.push(`в сумке ${h.carried ?? 0} · ? банк не открыт`);
  return parts.join(' · ');
}

/** Поле «уже есть»: −, число, +. Мусор (буквы, минус, дробь) не сохраняется — поле возвращается к прежнему. */
function OwnedInput({ value, max, name, onSet }: { value: number; max: number; name: string; onSet: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft.trim());
    if (draft.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_OWNED) onSet(n);
    else setDraft(String(value));
  };
  return (
    <span className="owned-input">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSet(Math.max(0, value - 1))} disabled={value <= 0}
        aria-label={`${name}: на один меньше`}>−</button>
      <input type="text" inputMode="numeric" value={draft} aria-label={`${name}: сколько уже есть`}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSet(Math.min(MAX_OWNED, value + 1))}
        aria-label={`${name}: на один больше`}>+</button>
      <span className="muted small">из {max}</span>
    </span>
  );
}

export function ShoppingPage() {
  const { steps, stages, progress, notify, setOwnedManual } = useStore();
  const [filter, setFilterState] = useState<Filter>(loadFilter);
  const setFilter = (f: Filter) => {
    setFilterState(f);
    try { localStorage.setItem(FILTER_KEY, f); } catch { /* до перезапуска */ }
  };
  const { state, owned, syncPlan } = useBridge();
  const stageIds = useMemo(() => stages.map((s) => s.id).filter((id) => steps.some((st) => st.stage === id)), [stages, steps]);
  const [range, setRange] = useState<Range>(() => {
    const saved = loadRange();
    const cur = currentStage(steps, progress);
    const ok = (n: unknown) => typeof n === 'number' && stageIds.includes(n);
    const from = ok(saved.from) ? saved.from! : cur;
    const to = ok(saved.to) && saved.to! >= from ? saved.to! : Math.min(from + 1, stageIds[stageIds.length - 1] ?? from);
    return { from, to, openOnly: saved.openOnly ?? true };
  });
  const update = (patch: Partial<Range>) => {
    setRange((r) => {
      const next = { ...r, ...patch };
      if (next.to < next.from) next.to = next.from;
      try { localStorage.setItem(RANGE_KEY, JSON.stringify(next)); } catch { /* до перезапуска */ }
      return next;
    });
  };

  const selected = useMemo(
    () => steps.filter((s) => s.stage >= range.from && s.stage <= range.to && (!range.openOnly || !isClosed(progress, s.id))),
    [steps, range, progress],
  );
  const list = useMemo(() => aggregateShopping(selected), [selected]);

  // Что продаётся на бирже: справочник предметов из API цен. null — ещё грузится или недоступен.
  const [tradeable, setTradeable] = useState<Set<number> | null>(null);
  const [pricesError, setPricesError] = useState(false);
  useEffect(() => {
    let alive = true;
    getMapping().then((m) => { if (alive) setTradeable(new Set(m.keys())); }).catch(() => { if (alive) setPricesError(true); });
    return () => { alive = false; };
  }, []);

  const [prices, setPrices] = useState<Map<number, GePrice | null>>(new Map());
  const idsKey = list.required.concat(list.recommended).map((l) => l.id).filter((id): id is number => id !== undefined).join(',');
  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    const ids = idsKey.split(',').map(Number);
    Promise.all(ids.map((id) => getGePrice(id).then((p) => [id, p] as const).catch(() => [id, null] as const)))
      .then((pairs) => { if (alive) setPrices(new Map(pairs)); })
      .catch(() => { if (alive) setPricesError(true); });
    return () => { alive = false; };
  }, [idsKey]);

  const onGe = (l: ShoppingLine) => tradeable === null || l.id === undefined || tradeable.has(l.id);
  const manual = progress.ownedManual ?? {};
  const toRow = (line: ShoppingLine): Row => ({
    line,
    h: holdingFor(line, owned, manual[line.key]?.count, onGe(line)),
    price: line.id !== undefined ? prices.get(line.id) : undefined,
  });
  const buyRows = list.required.filter((l) => !l.inStepOnly && onGe(l)).map(toRow);
  const gatherRows = list.required.filter((l) => l.inStepOnly && onGe(l)).map(toRow);
  const notGeRows = list.required.filter((l) => !onGe(l)).map(toRow);
  const recRows = list.recommended.filter(onGe).map(toRow);

  const budget = buyRows.reduce((sum, r) => sum + (r.price ? r.price.buyPrice * r.h.buy : 0), 0);
  const unpriced = buyRows.filter((r) => r.h.buy > 0 && !r.price).length;
  const count = (st: ShoppingItemStatus) => buyRows.filter((r) => r.h.status === st).length;
  const have = count('SUFFICIENT');
  const partial = count('PARTIAL');
  const missing = count('MISSING');
  const unknown = count('UNKNOWN');
  const left = buyRows.filter((r) => r.h.buy > 0).length;
  const stale = [...buyRows, ...gatherRows, ...recRows].filter((r) => r.h.stale);

  // Список — в подсказку на бирже в RuneLite. Плагин сам вычитает то, что видит в игре; ручные отметки — вычтены здесь.
  // Количество 0 у плагина значит «сколько по ситуации» — отмеченное вручную как имеющееся в список не идёт.
  const planItems = buyRows.map((r) => ({ name: r.line.nameEn, id: r.line.id, count: pluginCount(r.h) })).filter((i) => i.count > 0);
  const planKey = planItems.map((i) => `${i.name}:${i.count}`).join('|');
  useEffect(() => {
    if (state !== 'online') return;
    const timer = setTimeout(() => {
      void syncPlan({ items: planItems });
    }, 400);
    return () => clearTimeout(timer);
    // planItems пересчитывается каждую отрисовку — следим за его содержимым через planKey.
  }, [planKey, state, syncPlan]);

  const syncFromGame = () => {
    if (state !== 'online') {
      notify('RuneLite не подключён — укажи, что уже есть, вручную в строках списка');
      return;
    }
    if (!owned?.bankSeen) {
      notify('Открой банк в игре — программа посчитает, что там лежит, и обновит список');
      return;
    }
    const live = [...buyRows, ...gatherRows, ...recRows].filter((r) => r.h.source === 'live' && r.h.manual !== undefined);
    for (const r of live) setOwnedManual(r.line.key, null);
    notify(live.length ? `Взято из игры: ${live.length} ${plural(live.length, 'позиция', 'позиции', 'позиций')} — ручные отметки заменены` : 'Список уже по данным игры: сумка и банк учтены');
  };

  const title = `Grand Exchange — этап${range.from === range.to ? ` ${range.from}` : `ы ${range.from}–${range.to}`}`;
  const copyAll = async () => {
    const text = shoppingText(title, buyRows.map((r) => ({ nameEn: r.line.nameEn, buy: r.h.buy, exact: r.line.exact })), list.coins);
    notify(await copy(text) ? '📋 Список скопирован — вставь его в заметку рядом с игрой' : 'Не удалось скопировать — браузер запретил доступ к буферу обмена');
  };
  const copyName = async (name: string) => {
    notify(await copy(name) ? `📋 «${name}» скопировано — вставь в поиск GE` : 'Не удалось скопировать');
  };

  const bridgeNote = state === 'online'
    ? owned
      ? owned.bankSeen ? 'Учтено, что уже лежит в сумке и в банке (RuneLite).' : 'Учтена сумка. Открой банк в игре — учту и его.'
      : 'Войди в игру в RuneLite — учту то, что уже есть.'
    : state === 'off' ? 'Что уже есть — отмечай в строках вручную.' : 'RuneLite не подключён — что уже есть, отмечай в строках вручную.';

  const rowView = (r: Row) => {
    const { line, h } = r;
    const single = line.count === 1 || line.reusable;
    const setManual = (n: number | null) => setOwnedManual(line.key, n);
    const note = sourceNote(h);
    return (
      <li key={line.key} className={`shop-row is-${h.status.toLowerCase()}`}>
        <ItemIcon src={line.iconUrl} alt="" />
        <div className="shop-main">
          <p className="shop-name"><strong>{line.nameEn}</strong> <span className="muted">({line.nameRu})</span></p>
          <p className="shop-src muted small">
            {line.sources.map((s, i) => {
              const n = parseAmount(s.amount);
              return (
                <span key={`${s.stepId}-${i}`}>
                  {i > 0 && ', '}
                  <a href={`#/step/${s.stepId}`}>{s.stepId}</a>{n !== null && n > 1 && !s.carryOver ? ` ×${n}` : ''}{s.carryOver ? ' (тот же)' : ''}
                </span>
              );
            })}
            {line.reusable && line.sources.length > 1 ? ' · инструмент: одного хватит' : ''}
          </p>
          {note && <p className="muted small">{note}</p>}
          {h.stale && (
            <p className="small warn-text">
              ⚠️ Игра больше не подтверждает отметку «есть {h.manual}» — считаю по игре.{' '}
              <button type="button" className="link-btn" onClick={() => setManual(null)}>Убрать отметку</button>
            </p>
          )}
        </div>
        <div className="shop-count">
          {h.status === 'SUFFICIENT'
            ? <strong className="ok-text">✓ {h.owned ?? 0} / {line.count}{line.exact ? '' : '+'}</strong>
            : <strong>×{line.count}{line.exact ? '' : '+'}</strong>}
          {h.status === 'PARTIAL' && <span className="small">есть {h.owned} · купить {h.buy}</span>}
          {h.status === 'UNKNOWN' && h.source === 'bag' && <span className="muted small">купить до {h.buy}</span>}
          {r.price && h.buy > 0 && <span className="muted small">≈ {formatGp(r.price.buyPrice * h.buy)} gp</span>}
          {r.price === null && h.buy > 0 && !pricesError && <span className="muted small">цена неизвестна</span>}
        </div>
        <div className="shop-actions">
          {h.source === 'live' ? (
            // Сумка и банк известны из игры — ручная отметка ничего бы не изменила.
            <span className="muted small">✓ по данным игры</span>
          ) : single ? (
            h.manual !== undefined && h.manual > 0
              ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>↺ Снять «уже есть»</button>
              : h.status !== 'SUFFICIENT' && <button type="button" className="btn btn-sm" onClick={() => setManual(line.count)}>✓ Уже есть</button>
          ) : (
            <>
              <OwnedInput value={h.manual ?? h.owned ?? 0} max={line.count} name={line.nameEn} onSet={setManual} />
              {h.status !== 'SUFFICIENT' && <button type="button" className="btn btn-sm" onClick={() => setManual(line.count)}>✓ Есть все</button>}
              {h.manual !== undefined && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>↺ Снять отметку</button>}
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyName(line.nameEn)}
            aria-label={`Копировать название ${line.nameEn}`}>📋 Название</button>
        </div>
      </li>
    );
  };
  const visible = (rows: Row[]) => rows.filter((r) => shows(filter, r.h.status));

  return (
    <div className="page shop-page">
      <header className="page-head">
        <h1>🛒 Оптовый список Grand Exchange</h1>
        <p className="muted">Всё, что нужно на несколько этапов вперёд, — одной закупкой. Одинаковые предметы сложены, инструменты не повторяются.</p>
      </header>

      <div className="card shop-controls">
        <label>С этапа{' '}
          <select value={range.from} onChange={(e) => update({ from: Number(e.target.value) })}>
            {stageIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>по{' '}
          <select value={range.to} onChange={(e) => update({ to: Number(e.target.value) })}>
            {stageIds.filter((id) => id >= range.from).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="shop-check">
          <input type="checkbox" checked={range.openOnly} onChange={(e) => update({ openOnly: e.target.checked })} /> только невыполненные шаги
        </label>
      </div>

      <div className="card shop-summary">
        {buyRows.length > 0 && left === 0 ? (
          <p><strong>🟢 Всё уже подготовлено</strong> — покупки не требуются.</p>
        ) : (
          <p>
            <strong>{left ? `Купить: ${left} ${plural(left, 'позицию', 'позиции', 'позиций')}` : 'Покупать нечего'}</strong>
            {budget > 0 && <> · бюджет оставшихся покупок ≈ <strong>{formatGp(budget)} gp</strong></>}
            {list.coins > 0 && <> · ещё {formatGp(list.coins)} gp монетами на сами шаги</>}
          </p>
        )}
        {buyRows.length > 0 && (
          <p className="small shop-tally">
            {buyRows.length} {plural(buyRows.length, 'позиция', 'позиции', 'позиций')}:
            {' '}✓ уже есть {have}
            {partial > 0 && <> · 🟡 частично {partial}</>}
            {missing > 0 && <> · ✗ нет {missing}</>}
            {unknown > 0 && <> · ? неизвестно {unknown}</>}
            {notGeRows.length > 0 && <> · не продаётся на бирже {notGeRows.length}</>}
          </p>
        )}
        <p className="muted small">
          {pricesError ? 'Цены сейчас недоступны (нет интернета?) — список работает и без них.'
            : `Цены — справочно, с prices.runescape.wiki${unpriced ? `; без цены: ${unpriced}` : ''}.`}
          {bridgeNote && <> {bridgeNote}</>}
          {state === 'online' && ' Список показан и в игре — открой биржу.'}
        </p>
        {stale.length > 0 && <p className="small warn-text">⚠️ Игра не подтверждает {stale.length} {plural(stale.length, 'ручную отметку', 'ручные отметки', 'ручных отметок')} — они помечены в списке.</p>}
        <div className="shop-buttons">
          <button type="button" className="btn btn-primary" onClick={() => void copyAll()} disabled={!left}>
            📋 Скопировать список для биржи
          </button>
          <button type="button" className="btn" onClick={syncFromGame}>✓ Синхронизировать с моим банком</button>
        </div>
        <div className="segmented shop-filter" role="group" aria-label="Что показывать">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`seg ${filter === f.id ? 'is-active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="seg-count">{buyRows.filter((r) => shows(f.id, r.h.status)).length}</span>
            </button>
          ))}
        </div>
      </div>

      {buyRows.length > 0 && (
        <section className="shop-group">
          <h2 className="subhead">Купить на бирже · {visible(buyRows).length} из {buyRows.length}</h2>
          {visible(buyRows).length
            ? <ul className="shop-list">{visible(buyRows).map(rowView)}</ul>
            : <p className="muted small">В этом фильтре пусто — выбери «Все».</p>}
        </section>
      )}
      {gatherRows.length > 0 && (
        <details className="shop-group">
          <summary className="subhead">Добудешь по ходу шагов — можно купить, чтобы не собирать · {gatherRows.length}</summary>
          <ul className="shop-list">{visible(gatherRows).map(rowView)}</ul>
        </details>
      )}
      {recRows.length > 0 && (
        <details className="shop-group">
          <summary className="subhead">Рекомендуется, не обязательно · {recRows.length}</summary>
          <ul className="shop-list">{visible(recRows).map(rowView)}</ul>
        </details>
      )}
      {notGeRows.length > 0 && (
        <details className="shop-group">
          <summary className="subhead">На бирже не продаются — получишь по ходу · {notGeRows.length}</summary>
          <ul className="shop-list">
            {notGeRows.map((r) => (
              <li key={r.line.key} className="shop-row is-quest">
                <ItemIcon src={r.line.iconUrl} alt="" />
                <div className="shop-main">
                  <p className="shop-name"><strong>{r.line.nameEn}</strong> <span className="muted">({r.line.nameRu})</span></p>
                  <p className="muted small">{r.line.howToGet}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!list.required.length && !list.recommended.length && <p className="muted empty">На выбранных этапах покупать нечего.</p>}
      <p className="muted small">Программа ничего не покупает сама: ордера на бирже выставляешь ты.</p>
    </div>
  );
}
