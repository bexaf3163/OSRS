// Shopping: "what do I still have to obtain before I go on?" For the next trip by default (the current step and the next open ones, the same window
// as the step's preparation), for this step alone, or for stages the player picks. Rows are grouped by what to do: buy (at the exchange or in a
// shop), take from the bank, put on, check first, get on the way; what is already owned and what is optional are folded away. The model is
// lib/shoppingView.ts; the app buys nothing: the player places the orders.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useReadinessEngine, useTrackedTraining, useActiveActivity } from '../readinessContext';
import { useBridge } from '../bridge';
import { usePlayerState } from '../playerStateContext';
import { currentStage } from '../lib/next-step';
import { coinsOf } from '../lib/playerState';
import { formatGp, plural } from '../lib/shopping';
import {
  budgetOf, budgetSum, emptyStateOf, exchangePlan, geListText, scopeList, scopeSteps, shopRows, syncLine, timingOf, type Channel, type EmptyKind, type ScopeKind, type ShopRow, type StageRange,
} from '../lib/shoppingView';
import { MAX_OWNED } from '../lib/progress';
import { usePriceView } from '../lib/funding/usePriceView';
import { ItemIcon } from '../components/WikiDrawer';
import { copyText as copy } from '../lib/clipboard';
import { Eyebrow, Page } from '../ledger';
import { RoadSupplies } from '../components/RoadSupplies';
import { InventoryCleanup } from '../components/InventoryCleanup';
import { useQuestDone, useSkillLevel } from '../components/SkillRoadmap';
import { guideFor } from '../data/skillGuideRegistry';
import { buildPath, currentIndex, followedShoppingStep } from '../lib/skillGuide';
import { freeOnlyOf, useTracked } from '../lib/skillTrack';
import { stockShoppingContext, stockUpShopping } from '../lib/trainingStock';

const RANGE_KEY = 'osrs-put:shopping-range';
const SCOPE_KEY = 'osrs-put:shopping-scope';

const SCOPES: { id: ScopeKind; label: string }[] = [
  { id: 'trip', label: 'Stock up' },
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

/** A buy row's action when it says nothing beyond the place: the exchange group names the place once, in its heading. */
const PLAIN_GE = 'Buy at the Grand Exchange';
/** The group's heading and whether its rows can leave out the plain exchange action. */
const groupHead = (title: string): { title: string; plain: boolean } => ({ title, plain: title === PLAIN_GE });

const GROUPS: { channels: Channel[]; title: string }[] = [
  { channels: ['ge'], title: PLAIN_GE },
  { channels: ['shop'], title: 'Buy in shops' },
  { channels: ['bank'], title: 'Take from the bank' },
  { channels: ['equip'], title: 'Put on' },
  { channels: ['unknown'], title: 'Not confirmed' },
  { channels: ['along'], title: 'On the way' },
];

/** The "already have" field: −, a number, +. Garbage is not saved: the field returns to the previous value. */
function OwnedInput({ value, max, name, onSet, unit }: { value: number; max: number; name: string; onSet: (n: number) => void; unit?: string }) {
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
      <input type="text" inputMode="numeric" value={draft} aria-label={`${name}: how many ${unit ? `${unit} ` : ''}you already have`}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSet(Math.min(MAX_OWNED, value + 1))} aria-label={`${name}: one more`}>+</button>
      <span className="muted small">of {max}{unit ? ` ${unit}` : ''}</span>
    </span>
  );
}

function whereText(r: ShopRow): string {
  const o = r.own;
  const u = r.unit === 'dose' ? ' doses' : '';
  if (o.source === 'manual') return `Marked by hand: ${o.total ?? 0}${u}`;
  if (o.withYou === null) return 'Not checked: the game has not sent your bag yet';
  const parts = [`with you ${o.withYou}${u}${o.worn ? ` (${o.worn} worn)` : ''}`, o.bank === null ? 'bank not checked' : `in the bank ${o.bank}${u}`];
  if (o.viaAlternatives > 0) parts.push(`${o.viaAlternatives} of it from items that do the same job`);
  // A potion: which sizes hold the doses, so "4 doses" in a (3) and a (1) is not read as one potion.
  const sizes = (o.sizes ?? []).filter((x) => x.bag + x.noted + (x.bank ?? 0) > 0).map((x) => `${x.bag + x.noted + (x.bank ?? 0)} × (${x.size})`);
  if (sizes.length) parts.push(sizes.join(', '));
  return parts.join(' · ');
}

export function ShoppingPage() {
  const { stages, progress, notify, setOwnedManual } = useStore();
  const engine = useReadinessEngine();
  const steps = engine.ctx.steps;
  const { state: link, owned, syncPlan, questPoints } = useBridge();
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

  const training = useTrackedTraining();
  const activity = useActiveActivity();
  const current = activity.step?.id ?? null;

  // A followed skill plan (Skills → Follow this plan) leads the game instead of the quest route: its current step's tools come first in the list.
  const tracked = useTracked();
  const trackedLevel = useSkillLevel(tracked?.skill ?? 'attack');
  const questDone = useQuestDone();
  const followed = useMemo(() => {
    if (training) return training.complete ? null : training.step;
    if (!tracked) return null;
    const g = guideFor(tracked.skill);
    const path = buildPath(g, tracked.mode, questDone, g.start, freeOnlyOf(tracked));
    const st = path[currentIndex(path, trackedLevel)];
    return st ? followedShoppingStep(tracked.skill, st) : null;
  }, [tracked, trackedLevel, questDone, training]);

  const built = useMemo(() => {
    try {
      const selected = [...new Map([...(followed && scope !== 'range' ? [followed] : []), ...scopeSteps(scope, steps, progress, current, range)].map(s => [s.id, s])).values()];
      const shared = stockShoppingContext(player, prices, questPoints);
      const stocked = scope === 'trip' && selected.some(s => s.stockItems?.length) ? stockUpShopping(selected, shared, prices) : null;
      const { list, trip } = stocked ?? scopeList(selected);
      const rows = stocked?.rows ?? shopRows(list, { ...shared, trip });
      return { selected, list, rows, refillReserve: stocked?.refillReserve ?? null, error: false };
    } catch {
      return { selected: [], list: { required: [], recommended: [], coins: 0 }, rows: [] as ShopRow[], refillReserve: null, error: true };
    }
  }, [scope, steps, progress, current, range, player, prices, followed, questPoints]);
  const { selected, list, rows, error, refillReserve } = built;

  const connected = link === 'online';
  const loaded = owned !== null;
  const empty: EmptyKind | null = emptyStateOf({ error, scope, current, rows, connected, hasSnapshot: Boolean(owned?.bankSavedAt), loaded });
  const sync = syncLine({ connected, loaded, bankSeen: owned?.bankSeen === true, ...(owned?.bankSavedAt ? { bankSavedAt: owned.bankSavedAt } : {}) });
  const coins = coinsOf(player);
  // The next trip: what the step in progress needs, apart from advance purchases for the next steps of the window (S4-04 and S4-05 are purchase
  // steps of their own; their list is not what S4-03 needs before going on).
  const split = scope === 'trip' && current !== null;
  // A followed skill plan leads the game: its tools are needed now too.
  const nowIds = new Set([current, followed && scope !== 'range' ? followed.id : null].filter((x): x is string => x !== null));
  const isAhead = (r: ShopRow) => split && timingOf(r, nowIds) === 'ahead';
  const coinLines = list.coinLines ?? [];
  const nowCoins = split ? coinLines.filter((c) => nowIds.has(c.stepId)) : coinLines;
  const aheadCoins = split ? coinLines.filter((c) => !nowIds.has(c.stepId)) : [];
  const sumOf = (ls: readonly { amount: number }[]) => ls.reduce((a, c) => a + c.amount, 0);
  const funds = { bag: coins.bag, bank: coins.bank };
  const budget = budgetOf(rows.filter((r) => !isAhead(r)), split ? sumOf(nowCoins) : list.coins, funds);
  const aheadBudget = split ? budgetOf(rows.filter(isAhead), sumOf(aheadCoins), funds) : null;
  const total = split ? budgetOf(rows, list.coins, funds) : budget;
  const required = rows.filter((r) => !r.optional && !isAhead(r));
  const ahead = rows.filter((r) => !r.optional && isAhead(r) && r.channel !== 'have');
  const optional = rows.filter((r) => r.optional && !r.bankStock && r.channel !== 'have');
  const bankStock = rows.filter(r => r.bankStock);
  const have = rows.filter((r) => !r.optional && r.channel === 'have');
  const aheadIds = [...new Set(ahead.flatMap((r) => r.sources.filter((s) => !s.carryOver && !nowIds.has(s.stepId)).map((s) => s.stepId)))];

  // The exchange hint in RuneLite: the exchange rows (and the ones not confirmed). The plugin subtracts what it sees itself; a manual mark is
  // subtracted here.
  // What the game counts (every row of the scope) is sent apart from what it lists to buy, so finding an item in the bank never stops it being counted.
  const plan = exchangePlan(rows);
  const planKey = JSON.stringify(plan);
  useEffect(() => {
    if (link !== 'online') return;
    const timer = setTimeout(() => { void syncPlan(plan); }, 400);
    return () => clearTimeout(timer);
    // plan is recomputed on every render: its content is watched through planKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, link, syncPlan]);

  const scopeName = scope === 'trip' ? 'the upcoming steps' : scope === 'step' ? 'this step' : `stage${range.from === range.to ? ` ${range.from}` : `s ${range.from}–${range.to}`}`;
  const scopeLine = scope === 'range'
    ? `Stages ${range.from}–${range.to}${range.openOnly ? ', unfinished steps' : ''}: ${selected.length} ${plural(selected.length, 'step', 'steps')}.`
    : current
      ? `${scope === 'trip' ? selected.map((s) => s.id).join(', ') : current}.`
      : '';
  const exchange = geListText(`Grand Exchange: ${scopeName}`, rows, list.coins, split ? isAhead : undefined);
  const copyList = async () => {
    if (!exchange) return;
    notify(await copy(exchange) ? '📋 The exchange list is copied' : 'Could not copy: the clipboard is not available');
  };
  const backHref = activity.href;

  const rowView = (r: ShopRow, plain = false) => {
    const live = r.own.source === 'game';
    const single = r.required === 1 || r.reusable;
    const setManual = (n: number | null) => setOwnedManual(r.key, n);
    return (
      <li key={r.key} className={`shop-item-row is-${r.channel}`}>
        <ItemIcon src={r.iconUrl} alt="" />
        <div className="shop-item-main">
          <p className="shop-item-line">
            <strong>{r.name}</strong>
            {r.channel !== 'have' && r.qty > 0 && (r.unit === 'dose'
              ? <span className="shop-qty">{r.qty} {r.qty === 1 ? 'dose' : 'doses'}{r.channel === 'bank' ? '' : ' short'}</span>
              : <span className="shop-qty">×{formatGp(r.qty)}{r.exact ? '' : '+'}</span>)}
            {r.cost !== null && r.channel !== 'have' && <span className="muted small shop-cost">{r.channel === 'unknown' ? 'up to ' : '≈ '}{formatGp(r.cost)} gp{r.priceLabel ? ` (${r.priceLabel})` : r.channel === 'shop' ? ' (NPC price)' : ''}</span>}
            {r.priceLabel === 'Price unavailable' && <span className="muted small shop-cost">Price unavailable</span>}
          </p>
          {!(plain && r.action === PLAIN_GE) && <p className="small shop-action">{r.action}</p>}
          <details className="shop-why">
            <summary className="small muted">Why and what you have</summary>
            <p className="small muted">For {r.why}{r.reusable && r.sources.length > 1 ? ' (one is enough for all of them)' : ''}.{r.unit === 'dose' ? ` The steps need ${r.required} doses in all.` : r.required !== r.qty && r.channel !== 'have' ? ` The steps need ${formatGp(r.required)} in all.` : ''}</p>
            <p className="small muted">{whereText(r)}</p>
            {r.package?.alternative && <p className="small muted">{r.package.alternative}.</p>}
            {r.package && r.package.spare > 0 && <p className="small muted">The package holds {r.package.spare} spare {r.package.spare === 1 ? 'dose' : 'doses'}.</p>}
            {r.carry?.combine && <p className="small">{r.carry.combine}.</p>}
            {!live && (
              <p className="small shop-manual">
                {single ? (
                  r.own.source === 'manual'
                    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(null)}>Remove my mark</button>
                    : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(r.required)}>I already have it</button>
                ) : (
                  <>
                    <OwnedInput value={r.own.source === 'manual' ? r.own.total ?? 0 : 0} max={r.required} name={r.name} onSet={setManual} {...(r.unit === 'dose' ? { unit: 'doses' } : {})} />
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
        {kind === 'no-plan' && <button type="button" className="btn" onClick={() => setScope('range')}>Plan by stages</button>}
      </div>
    );
  };

  const listShown = empty === null || empty === 'offline' || empty === 'not-loaded';
  const purchase = rows.some((r) => !r.optional && (r.channel === 'ge' || r.channel === 'shop')) || total.unknownRows > 0 || total.coinsForSteps > 0;
  const nowNothing = budget.required === 0 && budget.coinsForSteps === 0 && budget.unknownRows === 0;
  const sum = budgetSum(total, coinLines);

  return (
    <div className="page shop-page la-spread">
    <Page side="l" basis={700} className="shop" label="Shopping list">
    <div className="page la-scroll">
      <Eyebrow>SHOPPING LIST</Eyebrow>
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

      {listShown && GROUPS.map((g) => {
        const items = required.filter((r) => g.channels.includes(r.channel));
        if (!items.length) return null;
        const head = groupHead(g.title);
        return (
          <section key={g.title} className={`shop-group-v2 is-${g.channels[0]}`}>
            <h2 className="subhead">{head.title} <span className="muted">· {items.length}</span></h2>
            {g.channels.includes('unknown') && <p className="small muted">{connected ? 'Open your bank in RuneLite to refresh: these may already be yours.' : 'Ownership not confirmed: these may already be yours.'}</p>}
            <ul className="shop-items">{items.map((r) => rowView(r, head.plain))}</ul>
          </section>
        );
      })}

      {listShown && ahead.length > 0 && (
        <details className="shop-group-v2 is-ahead">
          <summary className="subhead">For the next steps <span className="muted">· {ahead.length} · {aheadIds.join(', ')}</span></summary>
          <p className="small muted">Not needed for {current}. Buy them now only if you are at the exchange anyway.</p>
          {GROUPS.map((g) => {
            const items = ahead.filter((r) => g.channels.includes(r.channel));
            const head = groupHead(g.title);
            return items.length ? (
              <section key={g.title} className={`is-${g.channels[0]}`}>
                <h3 className="small muted">{head.title} · {items.length}</h3>
                <ul className="shop-items">{items.map((r) => rowView(r, head.plain))}</ul>
              </section>
            ) : null;
          })}
        </details>
      )}
      {listShown && bankStock.length > 0 && (
        <section className="shop-group-v2 is-ahead" aria-label="Optional bank stock">
          <h2 className="subhead">Bank stock · optional</h2>
          <p className="small muted">Buy together · ≈ {formatGp(bankStock.reduce((sum, r) => sum + (r.cost ?? 0), 0))} gp. Bank these; follow Path for what to carry.</p>
          <ul className="shop-items small">{bankStock.map(r => <li key={r.key}><strong>{r.name} ×{formatGp(r.qty)}</strong><span className="muted"> · ≈ {formatGp(r.cost ?? 0)} gp</span></li>)}</ul>
        </section>
      )}
      {listShown && have.length > 0 && (
        <details className="shop-group-v2 is-have">
          <summary className="subhead">Already have <span className="muted">· {have.length}</span></summary>
          <ul className="shop-items">{have.map((r) => rowView(r))}</ul>
        </details>
      )}
      {listShown && optional.length > 0 && (
        <details className="shop-group-v2 is-optional">
          <summary className="subhead">Optional <span className="muted">· {optional.length}</span></summary>
          <ul className="shop-items">{optional.map((r) => rowView(r))}</ul>
        </details>
      )}


    </div>
    </Page>
    <Page side="r" className="shop-purse" label="Trip preparation">
    <div className="page la-scroll">
      <Eyebrow>TRIP PREPARATION</Eyebrow>
      <h2 className="la-t">Ready for the next step</h2>
      <p className="small muted">{scope === 'range' ? `Selected stages ${range.from}–${range.to}` : activity.step?.title ?? 'Choose a route or training plan'}</p>
      {empty !== 'error' && <section className="card" aria-label="Checkout">
        <dl className="checkout-totals">
          <div><dt>Available coins</dt><dd>{coins.total === null ? 'Not fully checked' : `${formatGp(coins.total)} gp`}</dd></div>
          <div><dt>Required now</dt><dd>{budget.unpriced || budget.unknownRows ? 'Not fully checked' : `≈ ${formatGp(budget.required + budget.coinsForSteps)} gp`}</dd></div>
          {bankStock.length > 0 && <div><dt>Optional bank stock</dt><dd>≈ {formatGp(bankStock.reduce((sum, row) => sum + (row.cost ?? 0), 0))} gp</dd></div>}
          {refillReserve !== null && <div><dt>Keep for a refill / fares</dt><dd>≈ {formatGp(refillReserve)} gp</dd></div>}
          {budget.shortfall !== null && budget.shortfall > 0 && <div className="warn-text"><dt>Shortfall</dt><dd>{formatGp(budget.shortfall)} gp</dd></div>}
        </dl>
        <p className="small muted">{budget.unknownRows ? 'Check your bank before buying: unread items may already be yours.' : budget.unpriced ? `${budget.unpriced} without a price; the required total is not confirmed.` : empty === 'all-owned' ? 'Current requirements are covered. Follow Preparation for what to carry.' : 'Required items come first. Future bank stock stays optional.'}</p>
        <div className="shop-buttons">
          {budget.shortfall !== null && budget.shortfall > 0 ? <a className="btn btn-primary" href={backHref}>Prepare funding</a> : exchange ? <button type="button" className="btn btn-primary" onClick={() => void copyList()}>📋 Copy the exchange list</button> : current ? <a className="btn btn-primary" href={backHref}>Review preparation</a> : <a className="btn btn-primary" href="#/">Open Journey</a>}
          {exchange && budget.shortfall !== null && budget.shortfall > 0 && <button type="button" className="link-btn" onClick={() => void copyList()}>Copy the exchange list</button>}
        </div>
      </section>}
      {listShown && purchase && (
        <details className="shop-budget" aria-label="Budget"><summary className="small">Budget details</summary>
          {split ? (
            <>
              <p className="small">
                <strong>{current}</strong>:{' '}
                {nowNothing ? <>nothing to buy before you go on</> : <>
                  {budget.required > 0 ? <>buy <strong>≈ {formatGp(budget.required)} gp</strong></> : <>no confirmed purchases</>}
                  {budget.coinsForSteps > 0 && <> · {formatGp(budget.coinsForSteps)} gp the step pays out</>}
                  {budget.shortfall !== null && budget.shortfall > 0 && <> · <strong className="warn-text">short {formatGp(budget.shortfall)} gp</strong></>}
                </>}
              </p>
              {aheadBudget && (aheadBudget.required > 0 || aheadBudget.coinsForSteps > 0 || aheadBudget.unknownRows > 0) && (
                <p className="small">
                  Next steps ({aheadIds.join(', ')}), optional now:{' '}
                  {aheadBudget.required > 0 ? <>buy ≈ {formatGp(aheadBudget.required)} gp</> : <>no confirmed purchases</>}
                  {aheadBudget.coinsForSteps > 0 && <> · {formatGp(aheadBudget.coinsForSteps)} gp kept for {aheadCoins.map((c) => c.stepId).join(', ')}</>}
                </p>
              )}
            </>
          ) : (
            <p className="small">
              {budget.required > 0 ? <>Purchases <strong>≈ {formatGp(budget.required)} gp</strong></> : <>No confirmed purchases</>}
              {budget.coinsForSteps > 0 && <> · {formatGp(budget.coinsForSteps)} gp the steps pay out</>}
              {budget.shortfall !== null && budget.shortfall > 0 && <> · <strong className="warn-text">short {formatGp(budget.shortfall)} gp</strong></>}
            </p>
          )}
          {!sum && <p className="small muted">Your coins are not known yet: open your bank in RuneLite.</p>}
          {total.unpriced > 0 && <p className="small muted">{total.unpriced} without a price, not counted.</p>}
          {total.shortfall !== null && total.shortfall > 0 && current && (
            <p className="small"><a href={backHref}>Raise the coins</a> <span className="muted">— the step's coin plan picks a way that suits your account.</span> <a href="#/money">Browse earning methods</a></p>
          )}
          {/* The figures added up, so the shortfall can be checked against them: one click away, not a wall of numbers above the list. */}
          <details className="zen-more shop-budget-how">
            <summary className="small">How this is counted</summary>
            {sum && <p className="small muted">{split ? 'All of it: ' : ''}{sum}</p>}
            {total.unknownRows > 0 && <p className="small muted">{total.unknownRows} not confirmed{total.unknownMax > 0 ? `: up to ${formatGp(total.unknownMax)} gp more if none of them is owned` : ''}.</p>}
            {total.optional > 0 && <p className="small muted">Optional extras ≈ {formatGp(total.optional)} gp, not counted above.</p>}
            <p className="small muted">Purchase quantities cover the selected steps, not one inventory; see Path for what to carry now. GE estimates are not offers. Cached prices are labelled; unpriced costs are excluded. NPC prices are separate.</p>
          </details>
        </details>
      )}
      {empty !== 'error' && empty !== 'no-plan' && selected.length > 0 && (
        <RoadSupplies steps={selected} locate={scope !== 'range' || (range.openOnly && range.from <= currentStage(steps, progress))} heading="For the road" quietWhenEmpty />
      )}
      <CleanupFold />
      <p className="muted small">The app buys nothing by itself: you place the orders.</p>
    </div>
    </Page>
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
