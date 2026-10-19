// Shopping: "what do I still have to obtain before I go on?" For the next trip by default (the current step and the next open ones, the same window
// as the step's preparation), for this step alone, or for stages the player picks. Rows are grouped by what to do: buy (at the exchange or in a
// shop), take from the bank, put on, check first, get on the way; what is already owned and what is optional are folded away. The model is
// lib/shoppingView.ts; the app buys nothing: the player places the orders.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { usePlayerState } from '../playerStateContext';
import { currentStage, nextStep } from '../lib/next-step';
import { coinsOf } from '../lib/playerState';
import { formatGp, plural, type ShoppingLine } from '../lib/shopping';
import {
  budgetOf, emptyStateOf, geListText, scopeList, scopeSteps, shopRows, syncLine, type Channel, type EmptyKind, type ScopeKind, type ShopRow, type StageRange,
} from '../lib/shoppingView';
import { MAX_OWNED } from '../lib/progress';
import { itemById } from '../data';
import { getMapping } from '../services/pricesApi';
import { gearById } from '../services/gearAdvisor';
import { usePriceView } from '../lib/funding/usePriceView';
import { ItemIcon } from '../components/WikiDrawer';
import { copyText as copy } from '../lib/clipboard';
import { RoadSupplies } from '../components/RoadSupplies';
import { InventoryCleanup } from '../components/InventoryCleanup';
import { useQuestDone, useSkillLevel } from '../components/SkillRoadmap';
import { guideFor } from '../data/skillGuideRegistry';
import { buildPath, currentIndex, followedShoppingStep } from '../lib/skillGuide';
import { freeOnlyOf, useTracked } from '../lib/skillTrack';

const RANGE_KEY = 'osrs-put:shopping-range';
const SCOPE_KEY = 'osrs-put:shopping-scope';

const SCOPES: { id: ScopeKind; label: string }[] = [
  { id: 'trip', label: 'Next trip' },
  { id: 'step', label: 'This step' },
  { id: 'range', label: 'Stages' },
];

function loadScope(): ScopeKind {
  try {
    const v = localStorage.getItem(SCOPE_KEY);
    return SCOPES.some((s) => s.id === v) ? (v as ScopeKind) : 'trip';
  } catch {
    return 'trip';
  }
}

/** The saved range; `null`, an array and other garbage in the storage: as if nothing had been saved. */
function loadRange(): Partial<StageRange> {
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

const GROUPS: { channels: Channel[]; title: string }[] = [
  { channels: ['ge', 'shop'], title: 'Buy' },
  { channels: ['bank'], title: 'Take from the bank' },
  { channels: ['equip'], title: 'Put on' },
  { channels: ['unknown'], title: 'Not confirmed' },
  { channels: ['along'], title: 'On the way' },
];

/** The "already have" field: −, a number, +. Garbage is not saved: the field returns to the previous value. */
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
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSet(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`${name}: one less`}>−</button>
      <input type="text" inputMode="numeric" value={draft} aria-label={`${name}: how many you already have`}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSet(Math.min(MAX_OWNED, value + 1))} aria-label={`${name}: one more`}>+</button>
      <span className="muted small">of {max}</span>
    </span>
  );
}

function whereText(r: ShopRow): string {
  const o = r.own;
  if (o.source === 'manual') return `Marked by hand: ${o.total ?? 0}`;
  if (o.withYou === null) return 'Not checked: the game has not sent your bag yet';
  const parts = [`with you ${o.withYou}${o.worn ? ` (${o.worn} worn)` : ''}`, o.bank === null ? 'bank not checked' : `in the bank ${o.bank}`];
  if (o.viaAlternatives > 0) parts.push(`${o.viaAlternatives} of it from items that do the same job`);
  return parts.join(' · ');
}

export function ShoppingPage() {
  const { steps, stages, progress, qp, notify, setOwnedManual } = useStore();
  const { state: link, owned, activeStepId, syncPlan } = useBridge();
  const { state: player } = usePlayerState();
  const prices = usePriceView(true);
  const [scope, setScopeState] = useState<ScopeKind>(loadScope);
  const setScope = (s: ScopeKind) => {
    setScopeState(s);
    try { localStorage.setItem(SCOPE_KEY, s); } catch { /* until a restart */ }
  };
  const stageIds = useMemo(() => stages.map((s) => s.id).filter((id) => steps.some((st) => st.stage === id)), [stages, steps]);
  const [range, setRange] = useState<StageRange>(() => {
    const saved = loadRange();
    const cur = currentStage(steps, progress);
    const ok = (n: unknown) => typeof n === 'number' && stageIds.includes(n);
    const from = ok(saved.from) ? saved.from! : cur;
    const to = ok(saved.to) && saved.to! >= from ? saved.to! : Math.min(from + 1, stageIds[stageIds.length - 1] ?? from);
    return { from, to, openOnly: saved.openOnly ?? true };
  });
  const update = (patch: Partial<StageRange>) => {
    setRange((r) => {
      const next = { ...r, ...patch };
      if (next.to < next.from) next.to = next.from;
      try { localStorage.setItem(RANGE_KEY, JSON.stringify(next)); } catch { /* until a restart */ }
      return next;
    });
  };

  // The step in progress: the one started in the game, else the next open one the route allows.
  const current = useMemo(() => {
    const started = activeStepId && steps.some((s) => s.id === activeStepId) ? activeStepId : null;
    return started ?? nextStep(steps, progress, qp)?.id ?? null;
  }, [activeStepId, steps, progress, qp]);

  // What the exchange sells: the price service's item list. Until it answers (offline), worn gear says it itself and anything else of the route is
  // taken as sold, as before; an item without an id is never an exchange item.
  const [mapping, setMapping] = useState<Set<number> | null>(null);
  useEffect(() => {
    let alive = true;
    getMapping().then((m) => { if (alive) setMapping(new Set(m.keys())); }).catch(() => { /* the item database decides */ });
    return () => { alive = false; };
  }, []);

  // A followed skill plan (Skills → Follow this plan) leads the game instead of the quest route: its current step's tools come first in the list.
  const tracked = useTracked();
  const trackedLevel = useSkillLevel(tracked?.skill ?? 'attack');
  const questDone = useQuestDone();
  const followed = useMemo(() => {
    if (!tracked) return null;
    const g = guideFor(tracked.skill);
    const path = buildPath(g, tracked.mode, questDone, g.start, freeOnlyOf(tracked));
    const st = path[currentIndex(path, trackedLevel)];
    return st ? followedShoppingStep(tracked.skill, st) : null;
  }, [tracked, trackedLevel, questDone]);

  const built = useMemo(() => {
    const onGe = (l: ShoppingLine) => (l.id === undefined ? false : mapping ? mapping.has(l.id) : gearById.get(l.id)?.tradeable ?? true);
    try {
      const selected = [...(followed && scope !== 'range' ? [followed] : []), ...scopeSteps(scope, steps, progress, current, range)];
      const { list, trip } = scopeList(selected);
      const rows = shopRows(list, {
        state: player, onGe, detail: (id) => itemById.get(id), trip,
        gePrice: (l) => prices.buy(l.nameEn, l.id)?.price ?? null,
      });
      return { selected, list, rows, error: false };
    } catch {
      return { selected: [], list: { required: [], recommended: [], coins: 0 }, rows: [] as ShopRow[], error: true };
    }
  }, [scope, steps, progress, current, range, player, mapping, prices, followed]);
  const { selected, list, rows, error } = built;

  const connected = link === 'online';
  const loaded = owned !== null;
  const empty: EmptyKind | null = emptyStateOf({ error, scope, current, rows, connected, hasSnapshot: Boolean(owned?.bankSavedAt), loaded });
  const sync = syncLine({ connected, loaded, bankSeen: owned?.bankSeen === true, ...(owned?.bankSavedAt ? { bankSavedAt: owned.bankSavedAt } : {}) });
  const coins = coinsOf(player);
  const budget = budgetOf(rows, list.coins, { bag: coins.bag, bank: coins.bank });
  const required = rows.filter((r) => !r.optional);
  const optional = rows.filter((r) => r.optional && r.channel !== 'have');
  const have = required.filter((r) => r.channel === 'have');

  // The exchange hint in RuneLite: the exchange rows (and the ones not confirmed). The plugin subtracts what it sees itself; a manual mark is
  // subtracted here.
  const planItems = required
    .filter((r) => (r.channel === 'ge' || (r.channel === 'unknown' && r.tradeable)) && r.qty > 0)
    .map((r) => ({ name: r.name, id: r.id, count: r.own.source === 'manual' ? r.qty + (r.own.withYou ?? 0) : r.required }));
  const planKey = planItems.map((i) => `${i.name}:${i.count}`).join('|');
  useEffect(() => {
    if (link !== 'online') return;
    const timer = setTimeout(() => { void syncPlan({ items: planItems }); }, 400);
    return () => clearTimeout(timer);
    // planItems is recomputed on every render: its content is watched through planKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, link, syncPlan]);

  const scopeName = scope === 'trip' ? 'the next trip' : scope === 'step' ? 'this step' : `stage${range.from === range.to ? ` ${range.from}` : `s ${range.from}–${range.to}`}`;
  const scopeLine = scope === 'range'
    ? `Stages ${range.from}–${range.to}${range.openOnly ? ', unfinished steps' : ''}: ${selected.length} ${plural(selected.length, 'step', 'steps')}.`
    : current
      ? `${scope === 'trip' ? selected.map((s) => s.id).join(', ') : current}.`
      : '';
  const exchange = geListText(`Grand Exchange: ${scopeName}`, rows, list.coins);
  const copyList = async () => {
    if (!exchange) return;
    notify(await copy(exchange) ? '📋 The exchange list is copied' : 'Could not copy: the clipboard is not available');
  };
  const backHref = current ? `#/step/${current}` : '#/';

  const rowView = (r: ShopRow) => {
    const live = r.own.source === 'game';
    const single = r.required === 1 || r.reusable;
    const setManual = (n: number | null) => setOwnedManual(r.key, n);
    return (
      <li key={r.key} className={`shop-item-row is-${r.channel}`}>
        <ItemIcon src={r.iconUrl} alt="" />
        <div className="shop-item-main">
          <p className="shop-item-line">
            <strong>{r.name}</strong>
            {r.channel !== 'have' && r.qty > 0 && <span className="shop-qty">×{formatGp(r.qty)}{r.exact ? '' : '+'}</span>}
            {r.cost !== null && r.channel !== 'have' && <span className="muted small shop-cost">{r.channel === 'unknown' ? 'up to ' : '≈ '}{formatGp(r.cost)} gp</span>}
          </p>
          <p className="small shop-action">{r.action}</p>
          <details className="shop-why">
            <summary className="small muted">Why and what you have</summary>
            <p className="small muted">For {r.why}{r.reusable && r.sources.length > 1 ? ' (one is enough for all of them)' : ''}.{r.required !== r.qty && r.channel !== 'have' ? ` The steps need ${formatGp(r.required)} in all.` : ''}</p>
            <p className="small muted">{whereText(r)}</p>
            {!live && (
              <p className="small shop-manual">
                {single ? (
                  r.own.source === 'manual'
                    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>Remove my mark</button>
                    : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(r.required)}>I already have it</button>
                ) : (
                  <>
                    <OwnedInput value={r.own.source === 'manual' ? r.own.total ?? 0 : 0} max={r.required} name={r.name} onSet={setManual} />
                    {r.own.source === 'manual' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>Remove my mark</button>}
                  </>
                )}
              </p>
            )}
          </details>
        </div>
      </li>
    );
  };

  const emptyView = (kind: EmptyKind) => {
    const text: Record<EmptyKind, { head: string; body: string }> = {
      'error': { head: 'The list could not be worked out', body: 'Your progress is safe. Switch the scope or reopen the page; if it stays, the route data needs a look.' },
      'no-plan': { head: 'No step in progress', body: 'Every step is closed or blocked. Pick a step on the Path, or plan ahead by stages.' },
      'no-requirements': { head: `Nothing to obtain for ${scopeName}`, body: 'The steps here ask for no items.' },
      'all-owned': { head: `Everything for ${scopeName} is with you`, body: 'No purchases and nothing to take from the bank.' },
      'offline': { head: 'Offline — ownership not confirmed', body: 'Connect RuneLite and log in: the app then checks your bag and bank. The list below is what the steps ask for.' },
      'not-loaded': { head: 'Waiting for your character', body: 'Log in to the game in RuneLite. The list below is what the steps ask for.' },
    };
    const t = text[kind];
    return (
      <div className={`card shop-empty is-${kind}`} role="status">
        <p><strong>{t.head}</strong></p>
        <p className="muted small">{t.body}</p>
        {(kind === 'no-requirements' || kind === 'all-owned') && current && <a className="btn btn-primary" href={backHref}>Back to the step</a>}
        {kind === 'no-plan' && <button type="button" className="btn" onClick={() => setScope('range')}>Plan by stages</button>}
      </div>
    );
  };

  const listShown = empty === null || empty === 'offline' || empty === 'not-loaded';
  const purchase = required.some((r) => r.channel === 'ge' || r.channel === 'shop') || budget.unknownRows > 0;

  return (
    <div className="page shop-page">
      <header className="page-head shop-head-v2">
        <h1>Shopping</h1>
        <div className="segmented shop-scope" role="group" aria-label="What to prepare for">
          {SCOPES.map((s) => (
            <button key={s.id} type="button" className={`seg ${scope === s.id ? 'is-active' : ''}`} aria-pressed={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</button>
          ))}
        </div>
      </header>
      {scope === 'range' && (
        <div className="shop-controls">
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
            <input type="checkbox" checked={range.openOnly} onChange={(e) => update({ openOnly: e.target.checked })} /> unfinished steps only
          </label>
        </div>
      )}
      {/* Offline and waiting are said once, by their own card. */}
      <p className="muted small shop-scope-line">{scopeLine ? `For ${scopeLine} ` : ''}{empty === 'offline' || empty === 'not-loaded' ? '' : sync}</p>

      {empty !== null && emptyView(empty)}

      {listShown && purchase && (
        <div className="shop-budget" aria-label="Budget">
          <p className="small">
            {budget.required > 0 ? <>Purchases <strong>≈ {formatGp(budget.required)} gp</strong></> : <>No confirmed purchases</>}
            {budget.coinsForSteps > 0 && <> · {formatGp(budget.coinsForSteps)} gp for the steps</>}
            {budget.funds !== null ? <> · you have {formatGp(budget.funds)} gp</> : <> · your coins are not known yet</>}
            {budget.shortfall !== null && budget.shortfall > 0 && <> · <strong className="warn-text">short {formatGp(budget.shortfall)} gp</strong></>}
            {budget.unpriced > 0 && <> · {budget.unpriced} without a price</>}
          </p>
          {budget.unknownRows > 0 && <p className="small muted">{budget.unknownRows} not confirmed{budget.unknownMax > 0 ? `: up to ${formatGp(budget.unknownMax)} gp more if none of them is owned` : ''}.</p>}
          {budget.optional > 0 && <p className="small muted">Optional extras ≈ {formatGp(budget.optional)} gp, not counted above.</p>}
          {budget.shortfall !== null && budget.shortfall > 0 && current && (
            <p className="small"><a href={backHref}>Raise the coins</a> <span className="muted">— the step's coin plan picks a way that suits your account.</span> <a href="#/money">Browse earning methods</a></p>
          )}
          <p className="small muted">Prices are estimates from the exchange's recent trades, not offers.</p>
        </div>
      )}

      {listShown && GROUPS.map((g) => {
        const items = required.filter((r) => g.channels.includes(r.channel));
        if (!items.length) return null;
        return (
          <section key={g.title} className={`shop-group-v2 is-${g.channels[0]}`}>
            <h2 className="subhead">{g.title} <span className="muted">· {items.length}</span></h2>
            {g.channels.includes('unknown') && <p className="small muted">{connected ? 'Open your bank in RuneLite to refresh: these may already be yours.' : 'Ownership not confirmed: these may already be yours.'}</p>}
            <ul className="shop-items">{items.map(rowView)}</ul>
          </section>
        );
      })}

      {listShown && have.length > 0 && (
        <details className="shop-group-v2 is-have">
          <summary className="subhead">Already have <span className="muted">· {have.length}</span></summary>
          <ul className="shop-items">{have.map(rowView)}</ul>
        </details>
      )}
      {listShown && optional.length > 0 && (
        <details className="shop-group-v2 is-optional">
          <summary className="subhead">Optional <span className="muted">· {optional.length}</span></summary>
          <ul className="shop-items">{optional.map(rowView)}</ul>
        </details>
      )}

      {listShown && exchange && (
        <p className="shop-buttons">
          <button type="button" className="btn btn-primary" onClick={() => void copyList()}>📋 Copy the exchange list</button>
          {connected && <span className="muted small"> The same list shows at the exchange in the game.</span>}
        </p>
      )}

      {empty !== 'error' && empty !== 'no-plan' && selected.length > 0 && (
        <RoadSupplies steps={selected} locate={scope !== 'range' || (range.openOnly && range.from <= currentStage(steps, progress))} heading="For the road" quietWhenEmpty />
      )}
      <CleanupFold />
      <p className="muted small">The app buys nothing by itself: you place the orders.</p>
    </div>
  );
}

/** Bag cleanup on request only: it is mounted when opened. */
function CleanupFold() {
  const [open, setOpen] = useState(false);
  return (
    <details className="shop-group-v2 shop-cleanup" onToggle={(e) => { if (e.target === e.currentTarget) setOpen(e.currentTarget.open); }}>
      <summary className="subhead">Bag cleanup</summary>
      {open && <InventoryCleanup />}
    </details>
  );
}
