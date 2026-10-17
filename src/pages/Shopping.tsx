// "🛒 Grand Exchange shopping list": one purchase for several stages ahead.
// The prices come from the same OSRS Wiki price service as the item inspector; what you already have — from RuneLite.
// You have to buy yourself: the app only assembles the list, copies the names and hints at the exchange.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed, currentStage } from '../lib/next-step';
import { parseAmount } from '../lib/checklist';
import {
  aggregateShopping, formatGp, holdingFor, plural, pluginCount, shoppingText, summarizeShopping, type Holding, type ShoppingItemStatus, type ShoppingLine,
} from '../lib/shopping';
import { MAX_OWNED } from '../lib/progress';
import { getGePrice, getMapping, type GePrice } from '../services/pricesApi';
import { ItemIcon } from '../components/WikiDrawer';
import { copyText as copy } from '../lib/clipboard';
import { RoadSupplies } from '../components/RoadSupplies';
import { InventoryCleanup } from '../components/InventoryCleanup';

const RANGE_KEY = 'osrs-put:shopping-range';
const FILTER_KEY = 'osrs-put:shopping-filter';

/** What to show: by default what is still to buy (and what is unknown), so the list does not grow from what was bought. */
type Filter = 'need' | 'confirmed' | 'unverified' | 'partial' | 'have' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  // 'need' keeps its saved id: everything not confirmed as owned, with the unverified items listed apart.
  { id: 'need', label: 'Still open' },
  { id: 'confirmed', label: 'To obtain' },
  { id: 'unverified', label: 'Unverified' },
  { id: 'partial', label: 'Partly owned' },
  { id: 'have', label: 'Owned' },
  { id: 'all', label: 'All' },
];
const STATE_LABEL: Record<ShoppingItemStatus, string> = {
  MISSING: 'To obtain', PARTIAL: 'Partly owned', SUFFICIENT: 'Owned', UNKNOWN: '? Unverified', UNAVAILABLE: 'Not sold at the exchange',
};
const shows = (f: Filter, st: ShoppingItemStatus) => (f === 'all' ? true
  : f === 'have' ? st === 'SUFFICIENT'
    : f === 'partial' ? st === 'PARTIAL'
      : f === 'confirmed' ? st === 'MISSING' || st === 'PARTIAL'
        : f === 'unverified' ? st === 'UNKNOWN'
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

/** The saved range; `null`, an array and other garbage in the storage — as if nothing had been saved. */
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
  /** How many there are, how it is known and how many to buy. */
  h: Holding;
  price?: GePrice | null;
}

/** Where things are: "in the bag 5 · in the bank 8", "marked by hand", "? bank not opened". */
function sourceNote(h: Holding): string {
  const parts: string[] = [];
  if (h.source === 'live') parts.push(`in the bag ${h.carried ?? 0} · in the bank ${h.bank ?? 0}`);
  else if (h.source === 'manual') {
    parts.push(`marked by hand: ${h.manual}`);
    if (h.carried) parts.push(`in the bag ${h.carried}`);
  } else if (h.source === 'bag') parts.push(`in the bag ${h.carried ?? 0} · ? bank not opened`);
  return parts.join(' · ');
}

/** The "already have" field: −, a number, +. Garbage (letters, a minus, a fraction) is not saved — the field returns to the previous value. */
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
        aria-label={`${name}: one less`}>−</button>
      <input type="text" inputMode="numeric" value={draft} aria-label={`${name}: how many you already have`}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSet(Math.min(MAX_OWNED, value + 1))}
        aria-label={`${name}: one more`}>+</button>
      <span className="muted small">of {max}</span>
    </span>
  );
}

export function ShoppingPage() {
  const { steps, stages, progress, notify, setOwnedManual } = useStore();
  const [filter, setFilterState] = useState<Filter>(loadFilter);
  const setFilter = (f: Filter) => {
    setFilterState(f);
    try { localStorage.setItem(FILTER_KEY, f); } catch { /* until a restart */ }
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
      try { localStorage.setItem(RANGE_KEY, JSON.stringify(next)); } catch { /* until a restart */ }
      return next;
    });
  };

  const selected = useMemo(
    () => steps.filter((s) => s.stage >= range.from && s.stage <= range.to && (!range.openOnly || !isClosed(progress, s.id))),
    [steps, range, progress],
  );
  const list = useMemo(() => aggregateShopping(selected, { wholeGoal: true }), [selected]);

  // What is sold on the exchange: the item reference from the price API. null — still loading or unavailable.
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

  // Confirmed shortages and unverified items are counted apart: an unverified item is not a purchase until ownership is known.
  const sum = summarizeShopping(buyRows.map((r) => ({ h: r.h, unitPrice: r.price ? r.price.buyPrice : null })));
  const { confirmed: left, unverified: unknown, unpriced, owned: have, partial, missing } = sum;
  const budget = sum.confirmedGp;
  const upTo = sum.confirmedGp + sum.unverifiedGp;
  const stale = [...buyRows, ...gatherRows, ...recRows].filter((r) => r.h.stale);

  // The list — into the exchange hint in RuneLite. The plugin subtracts what it sees in the game itself; the manual marks are subtracted here.
  // A quantity of 0 for the plugin means "as the situation requires" — what is marked by hand as owned does not go into the list.
  const planItems = buyRows.map((r) => ({ name: r.line.nameEn, id: r.line.id, count: pluginCount(r.h) })).filter((i) => i.count > 0);
  const planKey = planItems.map((i) => `${i.name}:${i.count}`).join('|');
  useEffect(() => {
    if (state !== 'online') return;
    const timer = setTimeout(() => {
      void syncPlan({ items: planItems });
    }, 400);
    return () => clearTimeout(timer);
    // planItems is recomputed on every render — we watch its content through planKey.
  }, [planKey, state, syncPlan]);

  const syncFromGame = () => {
    if (state !== 'online') {
      notify('RuneLite is not connected — mark what you already have by hand in the list rows');
      return;
    }
    if (!owned?.bankSeen) {
      notify('Open the bank in the game — the app will count what is there and update the list');
      return;
    }
    const live = [...buyRows, ...gatherRows, ...recRows].filter((r) => r.h.source === 'live' && r.h.manual !== undefined);
    for (const r of live) setOwnedManual(r.line.key, null);
    notify(live.length ? `Taken from the game: ${live.length} ${plural(live.length, 'item', 'items')} — the manual marks were replaced` : 'The list is already by the game data: the bag and bank are counted');
  };

  const title = `Grand Exchange — stage${range.from === range.to ? ` ${range.from}` : `s ${range.from}–${range.to}`}`;
  const copyAll = async () => {
    const text = shoppingText(title, buyRows.map((r) => ({ nameEn: r.line.nameEn, buy: r.h.buy, exact: r.line.exact, unverified: r.h.status === 'UNKNOWN' })), list.coins);
    notify(await copy(text) ? '📋 The list is copied — paste it into a note next to the game' : 'Could not copy — the browser denied access to the clipboard');
  };
  const copyName = async (name: string) => {
    notify(await copy(name) ? `📋 "${name}" is copied — paste it into the GE search` : 'Could not copy');
  };

  const bridgeNote = state === 'online'
    ? owned
      ? owned.bankSeen ? 'What already lies in the bag and bank is counted (RuneLite).' : 'The bag is counted. Open the bank in the game — I will count it too.'
      : 'Log in to the game in RuneLite — I will count what you already have.'
    : state === 'off' ? 'Mark what you already have by hand in the rows.' : 'RuneLite is not connected — mark what you already have by hand in the rows.';

  const rowView = (r: Row) => {
    const { line, h } = r;
    const single = line.count === 1 || line.reusable;
    const setManual = (n: number | null) => setOwnedManual(line.key, n);
    const note = sourceNote(h);
    const ownedText = h.owned === null ? '?' : String(h.owned);
    const toObtain = h.status === 'SUFFICIENT' ? '—' : h.status === 'UNKNOWN' ? '?' : String(h.buy);
    const cost = r.price && h.buy > 0 && h.status !== 'SUFFICIENT'
      ? `${h.status === 'UNKNOWN' ? 'up to ' : '≈ '}${formatGp(r.price.buyPrice * h.buy)} gp`
      : r.price === null && h.buy > 0 && !pricesError ? 'price unknown' : '—';
    return (
      <li key={line.key} className={`shop-row is-${h.status.toLowerCase()}`}>
        <div className="shop-cell shop-item" data-label="Item">
          <ItemIcon src={line.iconUrl} alt="" />
          <div className="shop-main">
            <p className="shop-name"><strong>{line.nameEn}</strong></p>
            <p className="shop-src muted small">
              {line.sources.map((s, i) => {
                const n = parseAmount(s.amount);
                return (
                  <span key={`${s.stepId}-${i}`}>
                    {i > 0 && ', '}
                    <a href={`#/step/${s.stepId}`}>{s.stepId}</a>{n !== null && n > 1 && !s.carryOver ? ` ×${n}` : ''}{s.carryOver ? ' (same)' : ''}
                  </span>
                );
              })}
              {line.reusable && line.sources.length > 1 ? ' · a tool: one is enough' : ''}
            </p>
            {note && <p className="muted small">{note}</p>}
            {h.stale && (
              <p className="small warn-text">
                ⚠️ The game no longer confirms the mark "have {h.manual}" — counting by the game.{' '}
                <button type="button" className="link-btn" onClick={() => setManual(null)}>Remove the mark</button>
              </p>
            )}
          </div>
        </div>
        <div className="shop-cell shop-num" data-label="Required">
          <strong>×{line.count}{line.exact ? '' : '+'}</strong>
        </div>
        <div className="shop-cell shop-num" data-label="Owned">
          <span className={h.status === 'SUFFICIENT' ? 'ok-text' : undefined}>{h.status === 'SUFFICIENT' ? `✓ ${ownedText}` : ownedText}</span>
        </div>
        <div className="shop-cell shop-num" data-label="To obtain">
          <strong>{toObtain}</strong>
          <span className={`shop-state is-${h.status.toLowerCase()}`}>{STATE_LABEL[h.status]}</span>
          {h.status === 'UNKNOWN' && h.source === 'bag' && <span className="muted small">up to {h.buy} may be missing</span>}
        </div>
        <div className="shop-cell shop-source" data-label="Source">
          <span className="small">{onGe(line) ? 'Grand Exchange' : 'Along the way'}</span>
        </div>
        <div className="shop-cell shop-num" data-label="Estimated cost">
          <span className="muted small">{cost}</span>
        </div>
        <div className="shop-cell shop-actions" data-label="Action">
          {h.source === 'live' ? (
            // The bag and bank are known from the game — a manual mark would change nothing.
            <span className="muted small">✓ by the game data</span>
          ) : single ? (
            h.manual !== undefined && h.manual > 0
              ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>↺ Clear "already have"</button>
              : h.status !== 'SUFFICIENT' && <button type="button" className="btn btn-sm" onClick={() => setManual(line.count)}>✓ Already have</button>
          ) : (
            <>
              <OwnedInput value={h.manual ?? h.owned ?? 0} max={line.count} name={line.nameEn} onSet={setManual} />
              {h.status !== 'SUFFICIENT' && <button type="button" className="btn btn-sm" onClick={() => setManual(line.count)}>✓ Have all</button>}
              {h.manual !== undefined && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>↺ Remove the mark</button>}
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyName(line.nameEn)}
            aria-label={`Copy the name ${line.nameEn}`}>📋 Name</button>
        </div>
      </li>
    );
  };
  const visible = (rows: Row[]) => rows.filter((r) => shows(filter, r.h.status));
  const tableHead = (
    <div className="shop-head" aria-hidden="true">
      <span>Item</span><span>Required</span><span>Owned</span><span>To obtain</span><span>Source</span><span>Estimated cost</span><span>Action</span>
    </div>
  );

  return (
    <div className="page shop-page">
      <header className="page-head">
        <h1>Preparation shopping</h1>
        <p className="muted">Everything needed for several stages ahead — in one purchase. Identical items are merged, tools are not repeated.</p>
      </header>

      <div className="card shop-controls">
        <label>From stage{' '}
          <select value={range.from} onChange={(e) => update({ from: Number(e.target.value) })}>
            {stageIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>to{' '}
          <select value={range.to} onChange={(e) => update({ to: Number(e.target.value) })}>
            {stageIds.filter((id) => id >= range.from).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="shop-check">
          <input type="checkbox" checked={range.openOnly} onChange={(e) => update({ openOnly: e.target.checked })} /> only unfinished steps
        </label>
      </div>

        <div className="segmented shop-filter" role="group" aria-label="What to show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`seg ${filter === f.id ? 'is-active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="seg-count">{buyRows.filter((r) => shows(f.id, r.h.status)).length}</span>
            </button>
          ))}
        </div>

      {buyRows.length > 0 && (
        <section className="shop-group">
          <h2 className="subhead">Buy at the exchange · {visible(buyRows).length} of {buyRows.length}</h2>
          {visible(buyRows).length === 0 && <p className="muted small">This filter is empty — choose "All".</p>}
          {visible(buyRows).some((r) => r.h.status !== 'UNKNOWN') && (
            <>{tableHead}<ul className="shop-list">{visible(buyRows).filter((r) => r.h.status !== 'UNKNOWN').map(rowView)}</ul></>
          )}
          {visible(buyRows).some((r) => r.h.status === 'UNKNOWN') && (
            <>
              <h3 className="shop-unverified-head">? Unverified: ownership not checked</h3>
              <p className="muted small">
                Open your bank in the game or mark what you own. These items may already be yours, so they are not counted as purchases.
              </p>
              <>{tableHead}<ul className="shop-list">{visible(buyRows).filter((r) => r.h.status === 'UNKNOWN').map(rowView)}</ul></>
            </>
          )}
        </section>
      )}
      {gatherRows.length > 0 && (
        <details id="shop-gather" className="shop-group">
          <summary className="subhead">You will get these along the way — you can buy them to avoid gathering · {gatherRows.length}</summary>
          <ul className="shop-list">{visible(gatherRows).map(rowView)}</ul>
        </details>
      )}
      {recRows.length > 0 && (
        <details id="shop-recommended" className="shop-group">
          <summary className="subhead">Recommended, not required · {recRows.length}</summary>
          <ul className="shop-list">{visible(recRows).map(rowView)}</ul>
        </details>
      )}
      {notGeRows.length > 0 && (
        <details className="shop-group">
          <summary className="subhead">Not sold at the exchange — you get them along the way · {notGeRows.length}</summary>
          <ul className="shop-list">
            {notGeRows.map((r) => (
              <li key={r.line.key} className="shop-row is-quest">
                <ItemIcon src={r.line.iconUrl} alt="" />
                <div className="shop-main">
                  <p className="shop-name"><strong>{r.line.nameEn}</strong></p>
                  <p className="muted small">{r.line.howToGet}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!list.required.length && !list.recommended.length && <p className="muted empty">There is nothing to buy in the chosen stages.</p>}
      <div className="card">
        {/* From where the player stands when the chosen stages start at the current one (only the open steps: the next one is where they go). */}
        <RoadSupplies steps={selected} locate={range.openOnly && range.from <= currentStage(steps, progress)} heading="For the road: teleport supplies for these stages" />
      </div>
      <InventoryCleanup />
      <p className="muted small">The app buys nothing by itself: you place the exchange orders.</p>
      <div className="card shop-summary">
        {buyRows.length > 0 && left === 0 && unknown === 0 ? (
          <p><strong>🟢 Everything is already prepared</strong> — no purchases are needed.</p>
        ) : (
          <p>
            <strong>
              {left ? `To obtain: ${left} ${plural(left, 'item', 'items')}` : unknown ? 'Nothing is confirmed missing' : 'Nothing to buy'}
            </strong>
            {unknown > 0 && <> · <strong>{unknown} unverified</strong>, ownership not checked</>}
            {budget > 0 && <> · confirmed purchases ≈ <strong>{formatGp(budget)} gp</strong></>}
            {unknown > 0 && upTo > budget && <> · up to <strong>{formatGp(upTo)} gp</strong> if none of the unverified items are owned</>}
            {list.coins > 0 && <> · another {formatGp(list.coins)} gp in coins for the steps themselves</>}
          </p>
        )}
        {buyRows.length > 0 && (
          <p className="small shop-tally">
            {buyRows.length} {plural(buyRows.length, 'item', 'items')}:
            {' '}✓ already have {have}
            {partial > 0 && <> · 🟡 partly {partial}</>}
            {missing > 0 && <> · ✗ confirmed missing {missing}</>}
            {unknown > 0 && <> · ? unverified {unknown}</>}
            {notGeRows.length > 0 && <> · not sold on the exchange {notGeRows.length}</>}
          </p>
        )}
        <p className="muted small">
          {pricesError ? 'The prices are unavailable now (no internet?) — the list works without them too.'
            : `Prices are for reference, from prices.runescape.wiki${unpriced ? `; without a price: ${unpriced}` : ''}.`}
          {bridgeNote && <> {bridgeNote}</>}
          {state === 'online' && ' The list is shown in the game too — open the exchange.'}
        </p>
        {stale.length > 0 && <p className="small warn-text">⚠️ The game does not confirm {stale.length} {plural(stale.length, 'manual mark', 'manual marks')} — they are marked in the list.</p>}
        <div className="shop-buttons">
          <button type="button" className="btn btn-primary" onClick={() => void copyAll()} disabled={!left && !unknown}>
            📋 Copy the list for the exchange
          </button>
          <button type="button" className="btn" onClick={syncFromGame}>✓ Sync with my bank</button>
        </div>
      </div>
    </div>
  );
}
