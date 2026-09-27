// «🛒 Оптовый список Grand Exchange»: одна закупка на несколько этапов вперёд.
// Цены — из того же сервиса цен OSRS Wiki, что и инспектор предметов; что уже есть — из RuneLite.
// Покупать приходится самому: программа только собирает список, копирует названия и подсказывает на бирже.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed, currentStage } from '../lib/next-step';
import { ownedTotal } from '../lib/checklist';
import { aggregateShopping, formatGp, plural, shoppingText, type ShoppingLine } from '../lib/shopping';
import { getGePrice, getMapping, type GePrice } from '../services/pricesApi';
import { ItemIcon } from '../components/WikiDrawer';

const RANGE_KEY = 'osrs-put:shopping-range';

interface Range {
  from: number;
  to: number;
  openOnly: boolean;
}

function loadRange(): Partial<Range> {
  try {
    return JSON.parse(localStorage.getItem(RANGE_KEY) ?? '{}') as Partial<Range>;
  } catch {
    return {};
  }
}

interface Row {
  line: ShoppingLine;
  /** Сколько уже есть у игрока; null — неизвестно (нет связи с RuneLite). */
  have: number | null;
  buy: number;
  price?: GePrice | null;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Буфер обмена закрыт (нет фокуса, старый браузер) — старый способ через выделение текста.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

export function ShoppingPage() {
  const { steps, stages, progress, notify } = useStore();
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
  const toRow = (line: ShoppingLine): Row => {
    const have = ownedTotal(owned, line.nameEn);
    return { line, have, buy: Math.max(0, line.count - (have ?? 0)), price: line.id !== undefined ? prices.get(line.id) : undefined };
  };
  const buyRows = list.required.filter((l) => !l.inStepOnly && onGe(l)).map(toRow);
  const gatherRows = list.required.filter((l) => l.inStepOnly && onGe(l)).map(toRow);
  const notGeRows = list.required.filter((l) => !onGe(l)).map(toRow);
  const recRows = list.recommended.filter(onGe).map(toRow);

  const budget = buyRows.reduce((sum, r) => sum + (r.price ? r.price.buyPrice * r.buy : 0), 0);
  const unpriced = buyRows.filter((r) => r.buy > 0 && !r.price).length;
  const left = buyRows.filter((r) => r.buy > 0).length;

  // Список — в подсказку на бирже в RuneLite (плагин сам считает, что уже есть). Не на каждое нажатие — с паузой.
  const planKey = buyRows.map((r) => `${r.line.key}:${r.line.count}`).join('|');
  useEffect(() => {
    if (state !== 'online') return;
    const timer = setTimeout(() => {
      void syncPlan({ items: buyRows.map((r) => ({ name: r.line.nameEn, id: r.line.id, count: r.line.count })) });
    }, 400);
    return () => clearTimeout(timer);
    // buyRows пересчитывается каждую отрисовку — следим за его содержимым через planKey.
  }, [planKey, state, syncPlan]);

  const title = `Grand Exchange — этап${range.from === range.to ? ` ${range.from}` : `ы ${range.from}–${range.to}`}`;
  const copyAll = async () => {
    const text = shoppingText(title, buyRows.map((r) => ({ nameEn: r.line.nameEn, buy: r.buy, exact: r.line.exact })), list.coins);
    notify(await copy(text) ? '📋 Список скопирован — вставь его в заметку рядом с игрой' : 'Не удалось скопировать — браузер запретил доступ к буферу обмена');
  };
  const copyName = async (name: string) => {
    notify(await copy(name) ? `📋 «${name}» скопировано — вставь в поиск GE` : 'Не удалось скопировать');
  };

  const bridgeNote = state === 'online'
    ? owned
      ? owned.bankSeen ? 'Учтено, что уже лежит в сумке и в банке (RuneLite).' : 'Учтена сумка. Открой банк в игре — учту и его.'
      : 'Войди в игру в RuneLite — учту то, что уже есть.'
    : state === 'off' ? null : 'RuneLite не подключён — показано полное количество.';

  const rowView = (r: Row) => (
    <li key={r.line.key} className={`shop-row ${r.buy === 0 ? 'is-have' : ''}`}>
      <ItemIcon src={r.line.iconUrl} alt="" />
      <div className="shop-main">
        <p className="shop-name"><strong>{r.line.nameEn}</strong> <span className="muted">({r.line.nameRu})</span></p>
        <p className="shop-src muted small">
          {r.line.sources.map((s, i) => (
            <span key={`${s.stepId}-${i}`}>
              {i > 0 && ', '}
              <a href={`#/step/${s.stepId}`}>{s.stepId}</a>{s.carryOver ? ' (тот же)' : ''}
            </span>
          ))}
          {r.line.reusable && r.line.sources.length > 1 ? ' · инструмент: одного хватит' : ''}
        </p>
      </div>
      <div className="shop-count">
        <strong>×{r.line.count}{r.line.exact ? '' : '+'}</strong>
        {r.have !== null && r.have > 0 && <span className="muted small">{r.buy === 0 ? '✓ есть' : `есть ${r.have} · купить ${r.buy}`}</span>}
        {r.price && r.buy > 0 && <span className="muted small">≈ {formatGp(r.price.buyPrice * r.buy)} gp</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyName(r.line.nameEn)}
        aria-label={`Копировать название ${r.line.nameEn}`}>📋 Копировать название</button>
    </li>
  );

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
        <p>
          <strong>{left ? `Купить: ${left} ${plural(left, 'позицию', 'позиции', 'позиций')}` : buyRows.length ? 'Всё уже есть' : 'Покупать нечего'}</strong>
          {budget > 0 && <> · бюджет ≈ <strong>{formatGp(budget)} gp</strong></>}
          {list.coins > 0 && <> · ещё {formatGp(list.coins)} gp монетами на сами шаги</>}
        </p>
        <p className="muted small">
          {pricesError ? 'Цены сейчас недоступны (нет интернета?) — список работает и без них.'
            : `Цены — справочно, с prices.runescape.wiki${unpriced ? `; без цены: ${unpriced}` : ''}.`}
          {bridgeNote && <> {bridgeNote}</>}
          {state === 'online' && ' Список показан и в игре — открой биржу.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void copyAll()} disabled={!buyRows.length}>
          📋 Скопировать список для биржи
        </button>
      </div>

      {buyRows.length > 0 && (
        <section className="shop-group">
          <h2 className="subhead">Купить на бирже · {buyRows.length}</h2>
          <ul className="shop-list">{buyRows.map(rowView)}</ul>
        </section>
      )}
      {gatherRows.length > 0 && (
        <details className="shop-group">
          <summary className="subhead">Добудешь по ходу шагов — можно купить, чтобы не собирать · {gatherRows.length}</summary>
          <ul className="shop-list">{gatherRows.map(rowView)}</ul>
        </details>
      )}
      {recRows.length > 0 && (
        <details className="shop-group">
          <summary className="subhead">Рекомендуется, не обязательно · {recRows.length}</summary>
          <ul className="shop-list">{recRows.map(rowView)}</ul>
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
