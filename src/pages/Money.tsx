// The Money section (2.71): every earning method of the funding catalogue, at any time, not only when a step is short of coins. One recommendation for the
// player, a compact list of the others, a search, a sort and a few filters; the details of a method fold out under its row. It is a view over the funding
// system the coin card uses (lib/funding: the same evaluator, ranking and plan), not a second engine.
//
// Browsing reads: it never starts, changes or closes anything. "Start" makes the same guided plan as the coin card (the arrow, the step's preparation
// panel and the in-game line follow it); the route step stays where it was and the plan goes back to it.

import { useMemo, useState } from 'react';
import { stepById } from '../data';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useFunding, useMoneyScreen, type MoneyScreen } from '../fundingContext';
import { firstOpen, isClosed, nextStep } from '../lib/next-step';
import { formatGp } from '../lib/shopping';
import { minutesText } from '../lib/funding/assess';
import {
  browse, CATEGORY_LABEL, DEFAULT_FILTERS, goalText, INTENSITY_LABEL, type BrowseFilters, type BrowseRow, type BrowseSort, type Category, type MoneyGoal,
} from '../lib/funding/browse';
import { goalBlocker } from '../lib/funding/plan';
import type { MethodEvaluation, RequirementCheck } from '../lib/funding/evaluate';
import type { Ranking } from '../lib/funding/rank';
import type { Step } from '../types';
import { Economics, FundingCard, PriceNote } from '../components/FundingCard';

const gp = (n: number) => `${formatGp(Math.round(n))} gp`;

/** Rows shown before "Show more". */
const PAGE = 6;
/** The amount the goal field starts with. */
const DEFAULT_AMOUNT = 10_000;

const FILTERS_KEY = 'osrs-put:money-filters';

function loadFilters(): BrowseFilters {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null') as Partial<BrowseFilters> | null;
    if (!saved || typeof saved !== 'object') return DEFAULT_FILTERS;
    const cats: (Category | 'all')[] = ['all', 'combat', 'gathering', 'processing', 'other'];
    return {
      query: '',
      availableOnly: saved.availableOnly !== false,
      noCapital: saved.noCapital === true,
      relaxedOnly: saved.relaxedOnly === true,
      category: cats.includes(saved.category as Category) ? (saved.category as Category) : 'all',
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: BrowseFilters) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...f, query: '' })); } catch { /* until a restart */ }
}

const SORT_LABEL: Record<BrowseSort, string> = { recommended: 'Best for you', profit: 'Profit an hour', capital: 'Coins to start', intensity: 'Least effort' };
const CHECK_MARK: Record<RequirementCheck['status'], string> = { ok: '✓', missing: '✗', buy: '🛒', unknown: '?', info: 'ℹ' };

/** Why this method is where it is in the list: the recommendation, slower than it, held back, or what is missing. */
/** "cover the 392 gp S4-03 is short", "make 10,000 more coins": what the order is for. */
const goalWords = (r: MoneyScreen['rankedFor']) => (r.stepId ? `cover the ${formatGp(r.coins)} gp ${r.stepId} is short` : `make ${formatGp(r.coins)} more coins`);

function whyOf(e: MethodEvaluation, ranking: Ranking, rankedFor: MoneyScreen['rankedFor']): string {
  const goal = goalWords(rankedFor);
  if (!e.eligible) return `Not available now: ${e.blockers.map((b) => b.text).join('; ')}.`;
  if (ranking.best?.method.id === e.method.id) {
    return `${ranking.kept ? 'Kept, as it is the method you are running' : 'The quickest way for you'} to ${goal}${e.minutes ? `: ${minutesText(e.minutes)}` : ''}.`;
  }
  if (ranking.needsAttention.some((x) => x.method.id === e.method.id)) return 'It needs full attention (tick-perfect or very repetitive), so it is not recommended unless you pick it.';
  const cannot = ranking.cannotReach.find((c) => c.evaluation.method.id === e.method.id);
  if (cannot) return `${cannot.reason}.`;
  if (e.minutes && ranking.best?.minutes) return `${minutesText(e.minutes)} to ${goal}; ${ranking.best.method.title} is quicker for you (${minutesText(ranking.best.minutes)}).`;
  return e.minutes ? `${minutesText(e.minutes)} to ${goal}.` : '';
}

function Badge({ row }: { row: Pick<BrowseRow, 'badge'> }) {
  return <span className={`money-badge is-${row.badge.tone}`}>{row.badge.text}</span>;
}

/** The goal of a start and the button: more coins, the step's shortfall, or an open session. */
function GoalChooser({ e, m, step, onClose }: { e: MethodEvaluation; m: MoneyScreen; step: Step; onClose: () => void }) {
  const f = useFunding();
  const [kind, setKind] = useState<MoneyGoal['kind']>(m.shortfall ? 'shortfall' : 'amount');
  const [amount, setAmount] = useState(DEFAULT_AMOUNT.toLocaleString('en-US'));
  const coins = Math.max(0, Math.floor(Number(amount.replace(/[^\d]/g, '')) || 0));
  const goal: MoneyGoal = kind === 'open' ? { kind: 'open' }
    : kind === 'shortfall' && m.shortfall ? { kind: 'shortfall', stepId: m.shortfall.stepId, coins: m.shortfall.coins }
      : { kind: 'amount', coins };
  const blocker = m.snap ? goalBlocker(goal, m.snap) : 'Connect RuneLite and log in to start.';
  const running = f.plan && (f.plan.status === 'ACTIVE' || f.plan.status === 'PAUSED') ? f.plan : null;
  const name = `goal-${e.method.id}`;
  return (
    <fieldset className="money-goal">
      <legend className="small">What should it earn?</legend>
      <label className="money-goal-option">
        <input type="radio" name={name} checked={kind === 'amount'} onChange={() => setKind('amount')} />
        <span>Earn <input type="text" inputMode="numeric" className="money-amount" aria-label="Coins to earn" value={amount}
          onFocus={() => setKind('amount')} onChange={(ev) => setAmount(ev.target.value)} /> more coins</span>
      </label>
      {m.shortfall && (
        <label className="money-goal-option">
          <input type="radio" name={name} checked={kind === 'shortfall'} onChange={() => setKind('shortfall')} />
          <span>{goalText({ kind: 'shortfall', stepId: m.shortfall.stepId, coins: m.shortfall.coins })}</span>
        </label>
      )}
      <label className="money-goal-option">
        <input type="radio" name={name} checked={kind === 'open'} onChange={() => setKind('open')} />
        <span>An open session: stop when you like</span>
      </label>
      <p className="small muted">Coins are counted as you have them: what you hold now less what you held at the start. Loot counts once it is sold.</p>
      {running && <p className="small">This stops “{running.title}”. Your route step stays as it is.</p>}
      {blocker && <p className="small money-blocker" role="status">{blocker}</p>}
      <p className="money-actions">
        <button type="button" className="btn btn-primary" disabled={Boolean(blocker)}
          onClick={() => { if (m.snap && f.startMethod(e, goal, step.id, m.snap)) onClose(); }}>
          {running ? 'Switch to this method' : 'Start'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </p>
    </fieldset>
  );
}

/** Everything about one method, the long parts folded: why, what it needs and what the player has, where and how, the money, the risks, the sources. */
function Details({ e, m }: { e: MethodEvaluation; m: MoneyScreen }) {
  const method = e.method;
  const pu = e.perUnit;
  const guide = method.guide.filter((g) => g.kind !== 'restock');
  const why = whyOf(e, m.ranking, m.rankedFor);
  return (
    <div className="money-details">
      <p className="small">{method.summary}</p>
      {why && <p className="small"><strong>Why:</strong> {why}</p>}
      <p className="small subhead">What it needs</p>
      <ul className="money-checks small">
        {e.checks.map((c) => <li key={c.text} className={`is-${c.status}`}><span className="money-check-mark" aria-hidden="true">{CHECK_MARK[c.status]}</span>{c.text}</li>)}
      </ul>
      <p className="small subhead">Where and how</p>
      <p className="small">{method.spot.label}; bank: {method.bank.label}.</p>
      <ol className="small money-guide">{guide.map((g) => <li key={g.kind + g.text}>{g.text}</li>)}</ol>
      <p className="small subhead">Money</p>
      <Economics e={e} earn />
      <p className="small">Risk: {method.risk} · Effort: {INTENSITY_LABEL[method.intensity].toLowerCase()} · Confidence: {e.confidence.toLowerCase()}</p>
      <PriceNote prices={m.prices} />
      <details className="money-calc">
        <summary className="small">Sources and calculations</summary>
        <ul className="small funding-facts">
          <li>Per {method.rate.unit}: sold for {gp(pu.sale)}{pu.coins > 0 ? ` and ${gp(pu.coins)} in coins` : ''}, tax {gp(pu.tax)}, supplies {gp(pu.inputs)}: {gp(pu.net)} net.</li>
          <li>{Math.round(e.unitsPerHour.typical)} {method.rate.unit}s an hour with banking and selling (between {Math.round(e.unitsPerHour.slow)} and {Math.round(e.unitsPerHour.fast)}); {e.unitsPerTrip >= 1000 ? 'no bag limit' : `${e.unitsPerTrip} a trip`}.</li>
          <li>To start: {e.upfront.setup > 0 ? `${gp(e.upfront.setup)} for the tool, ` : ''}{gp(e.upfront.firstTrip)} for a full first trip.</li>
          {pu.upside > 0 && <li>Rare drops worth about {gp(pu.upside)} per {method.rate.unit} on average are not counted.</li>}
          {e.notes.map((n) => <li key={n}>{n}.</li>)}
          {method.assumptions.map((a) => <li key={a} className="muted">{a}</li>)}
          <li className="muted">Checked {method.verifiedAt}. {method.sources.map((src, i) => (
            <span key={src.url}>{i > 0 && ', '}<a href={src.url} target="_blank" rel="noreferrer">{src.title}</a></span>
          ))}</li>
        </ul>
      </details>
    </div>
  );
}

function Row({ row, m, step, open, starting, onOpen, onStart, onClose }: {
  row: BrowseRow; m: MoneyScreen; step: Step; open: boolean; starting: boolean; onOpen: () => void; onStart: () => void; onClose: () => void;
}) {
  const e = row.evaluation;
  return (
    <li className={`money-row${open ? ' is-open' : ''}`}>
      <button type="button" className="money-row-head" aria-expanded={open} onClick={onOpen}>
        <span className="money-row-title">{e.method.title}</span>
        <Badge row={row} />
        <span className="money-row-facts small muted">{row.net} · {row.capital} · {INTENSITY_LABEL[e.method.intensity]}</span>
      </button>
      {open && (
        <>
          <Details e={e} m={m} />
          {e.eligible && !starting && <p className="money-actions"><button type="button" className="btn" onClick={onStart}>Start…</button></p>}
        </>
      )}
      {starting && <GoalChooser e={e} m={m} step={step} onClose={onClose} />}
    </li>
  );
}

function MoneyBody({ step }: { step: Step }) {
  const m = useMoneyScreen(step);
  const f = useFunding();
  const { state: link, inGame } = useBridge();
  const [filters, setFiltersState] = useState<BrowseFilters>(loadFilters);
  const setFilters = (patch: Partial<BrowseFilters>) => setFiltersState((cur) => {
    const next = { ...cur, ...patch };
    saveFilters(next);
    return next;
  });
  const [sort, setSort] = useState<BrowseSort>('recommended');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const result = useMemo(() => browse(m.evals, m.ranking, filters, sort), [m.evals, m.ranking, filters, sort]);
  const best = result.recommended;
  const bestRow = best ? { badge: result.rows.find((r) => r.evaluation === best)?.badge ?? { text: 'Can do now', tone: 'ok' as const } } : null;
  const rows = result.rows.filter((r) => r.evaluation !== best);
  const running = f.plan && (f.plan.status === 'ACTIVE' || f.plan.status === 'PAUSED') ? f.plan : null;
  const source = running ? stepById.get(running.sourceStepId) : undefined;
  const coins = m.snap?.liquid;
  const live = link === 'online' && inGame;
  const advanced = Number(!filters.availableOnly) + Number(filters.noCapital) + Number(filters.relaxedOnly) + Number(filters.category !== 'all');
  const toggle = (id: string) => { setOpen((o) => (o === id ? null : id)); setStarting(null); };

  return (
    <div className="page money-page">
      <header className="page-head">
        <h1>Money</h1>
        <p className="muted small money-context">
          {!live
            ? <>{link === 'online' ? 'Log in to the game' : 'Connect RuneLite'} to check what your account can do; until then nothing is confirmed.</>
            : coins?.amount === null || coins === undefined
              ? <>Your coins are not known yet.</>
              : <>Your coins: {gp(coins.amount)}{coins.complete ? '' : ' (bag only: open your bank to count the rest)'}.</>}
          {live && m.ranking.best ? ` Ranked by the time to ${goalWords(m.rankedFor)}.` : ''}
        </p>
      </header>

      {running && source && (
        <section className="money-running" aria-label="Your money plan">
          <FundingCard step={source} />
          <p className="small muted">Started from <a href={`#/step/${source.id}`}>{source.id}</a>: the route step is not changed and waits for you.{running.goal ? ` Goal: ${goalText(running.goal).toLowerCase()}.` : ''}</p>
        </section>
      )}

      {best && bestRow ? (
        <section className="card money-reco" aria-label="Recommended for you">
          <p className="money-reco-head"><span className="money-kicker">Recommended for you</span> <strong>{best.method.title}</strong> <Badge row={bestRow} /></p>
          <p className="small">{result.rows.find((r) => r.evaluation === best)?.net ?? ''} · {result.rows.find((r) => r.evaluation === best)?.capital ?? ''} · {INTENSITY_LABEL[best.method.intensity]}</p>
          <p className="small muted">{whyOf(best, m.ranking, m.rankedFor)}</p>
          {starting !== best.method.id && (
            <p className="money-actions">
              {running?.methodId === best.method.id
                ? <span className="small">You are running this method.</span>
                : <button type="button" className="btn btn-primary" onClick={() => { setStarting(best.method.id); setOpen(null); }}>Start…</button>}
              <button type="button" className="btn btn-ghost" aria-expanded={open === best.method.id} onClick={() => toggle(best.method.id)}>
                {open === best.method.id ? 'Hide details' : 'Details'}
              </button>
            </p>
          )}
          {open === best.method.id && <Details e={best} m={m} />}
          {starting === best.method.id && <GoalChooser e={best} m={m} step={step} onClose={() => setStarting(null)} />}
        </section>
      ) : (
        <div className="card money-empty" role="status">
          <p><strong>{m.evals.length === 0 ? 'Loading the methods…' : 'No method can be recommended yet'}</strong></p>
          <p className="small muted">
            {m.evals.length === 0 ? ''
              : !live ? 'Your levels, tools and coins are needed to tell what suits you. The list below shows the published figures.'
                : coins?.amount === null ? 'Your coins are not known, so the time to a goal cannot be worked out. Open your bank once.'
                  : 'Nothing you can do now was found. Turn on "Show locked methods" to see what is missing.'}
          </p>
        </div>
      )}

      <div className="money-controls">
        <input type="search" className="money-search" placeholder="Search methods" aria-label="Search methods" value={filters.query}
          onChange={(ev) => { setFilters({ query: ev.target.value }); setLimit(PAGE); }} />
        <label className="small money-sort">Sort
          <select value={sort} onChange={(ev) => setSort(ev.target.value as BrowseSort)}>
            {(Object.keys(SORT_LABEL) as BrowseSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-ghost money-filters-toggle" aria-expanded={showFilters} aria-controls="money-filters"
          onClick={() => setShowFilters((v) => !v)}>Filters{advanced ? ` · ${advanced}` : ''}</button>
        {showFilters && (
          <div className="money-filter-list small" id="money-filters">
            <label><input type="checkbox" checked={!filters.availableOnly} onChange={(ev) => setFilters({ availableOnly: !ev.target.checked })} /> Show locked methods</label>
            <label><input type="checkbox" checked={filters.noCapital} onChange={(ev) => setFilters({ noCapital: ev.target.checked })} /> No coins needed to start</label>
            <label><input type="checkbox" checked={filters.relaxedOnly} onChange={(ev) => setFilters({ relaxedOnly: ev.target.checked })} /> Relaxed only</label>
            <label>Kind{' '}
              <select value={filters.category} onChange={(ev) => setFilters({ category: ev.target.value as Category | 'all' })}>
                <option value="all">All</option>
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      {rows.length > 0 ? (
        <ul className="money-list" aria-label="Other methods">
          {rows.slice(0, limit).map((row) => (
            <Row key={row.evaluation.method.id} row={row} m={m} step={step}
              open={open === row.evaluation.method.id} starting={starting === row.evaluation.method.id}
              onOpen={() => toggle(row.evaluation.method.id)}
              onStart={() => setStarting(row.evaluation.method.id)} onClose={() => setStarting(null)} />
          ))}
        </ul>
      ) : (
        m.evals.length > 0 && <p className="small muted">No other method matches{filters.query ? ` “${filters.query}”` : ''}.</p>
      )}
      {rows.length > limit && <p><button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button></p>}
      {result.hidden > 0 && (
        <p className="small muted">
          {result.hidden} hidden by the filters.{' '}
          <button type="button" className="btn btn-link" onClick={() => { setFiltersState(() => { const all = { ...DEFAULT_FILTERS, availableOnly: false }; saveFilters(all); return all; }); }}>Show all</button>
        </p>
      )}
    </div>
  );
}

export function MoneyPage() {
  const { steps, progress, qp } = useStore();
  const { activeStepId } = useBridge();
  // The step in progress: the one started in the game, else the next open one the route allows (as on the Shopping page).
  const step = useMemo(() => {
    const started = activeStepId ? steps.find((s) => s.id === activeStepId && !isClosed(progress, s.id)) : undefined;
    return started ?? nextStep(steps, progress, qp) ?? firstOpen(steps, progress) ?? steps[steps.length - 1];
  }, [activeStepId, steps, progress, qp]);
  if (!step) return null;
  return <MoneyBody step={step} />;
}
