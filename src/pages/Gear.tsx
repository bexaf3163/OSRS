// Gear: "what change, if any, is worth making for what I am doing now?" In order: the context (the fight ahead and the opponent's attack), what is
// worn (live, or the last known snapshot of this character with its time), one recommendation or "no worthwhile change", and the rest folded away:
// other options, the combat numbers and the future unlocks. Counted by the OSRS Wiki damage formulas (services/gearAdvisor.ts); defence is judged
// against the opponent's attack style, never as a sum of three styles; gear is bought only from what the next trip's supplies leave.

import { useMemo } from 'react';
import { useBridge, type LastGear } from '../bridge';
import { useStore } from '../store';
import { useReadinessEngine } from '../readinessContext';
import { usePlayerState } from '../playerStateContext';
import { useProfiles } from '../lib/profiles';
import { formatGp, type ShoppingLine } from '../lib/shopping';
import { useGearAdvice } from '../lib/gearAdvice';
import { nextStep } from '../lib/next-step';
import { scopeList, scopeSteps, shopRows, supplyReserve } from '../lib/shoppingView';
import { usePriceView } from '../lib/funding/usePriceView';
import { itemPrice } from '../lib/itemPrice';
import { itemById } from '../data';
import { questStepOf } from '../lib/questSteps';
import {
  actionNav, equippedBySlot, gainText, gearData, SLOT_LABEL, SLOTS, statsText, type Equipped, type GearAction, type GearAdvice,
} from '../services/gearAdvisor';
import { buildRoadmap, prayerChips, type RoadmapRow } from '../lib/gearRoadmap';
import type { GearSlot, Step } from '../types';
import { ItemIcon } from '../components/WikiDrawer';
import { NavigateButton } from '../components/NavigateButton';
import { PlaceMapView, usePlaceMap } from '../components/PlaceMap';
import { ActionNotes, ActionSource, ActionTitle, OwnershipNote } from '../components/GearPrompt';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function SlotGlyph({ slot }: { slot: GearSlot }) {
  const paths: Record<GearSlot, string> = {
    weapon: 'M30 3 15 20l-3-3-3 3 4 4-7 7 2 2 7-7 4 4 3-3-3-3L32 7Z',
    head: 'M8 29V14a10 10 0 0 1 20 0v15l-7-4v-9h-6v9Z',
    body: 'M11 6 5 10 2 18l7 3v11h18V21l7-3-3-8-6-4-7 3Z',
    neck: 'M8 7c0 16 5 20 10 20S28 23 28 7l-7-3h-6Zm7 24 3-4 3 4-3 3Z',
    legs: 'M10 4h16l3 29h-8l-3-19-3 19H7Z',
    shield: 'M18 3 5 7v10c0 8 6 13 13 17 7-4 13-9 13-17V7Z',
  };
  return <svg className="gear-slot-glyph" viewBox="0 0 36 36" aria-hidden="true"><path d={paths[slot]} fill="currentColor" /></svg>;
}
const SKILL_EN = { attack: 'Attack', strength: 'Strength', defence: 'Defence', ranged: 'Ranged', magic: 'Magic', prayer: 'Prayer' } as const;
/** Where to lead for what is missing: the skill page (the training plan). */
const SKILL_PAGE = { attack: 'ME', strength: 'ME', defence: 'ME', ranged: 'RA', magic: 'MA', prayer: 'PR' } as const;

function ActionRow({ a, stepId, live, onShow }: { a: GearAction; stepId?: string; live: boolean; onShow: ReturnType<typeof usePlaceMap>['show'] }) {
  const nav = actionNav(a, stepId);
  return (
    <li className="gear-row">
      <ItemIcon src={a.item.iconUrl} alt="" size={28} />
      <div className="gear-main">
        <p><ActionTitle a={a} /> <span className="muted small">({SLOT_LABEL[a.slot].toLowerCase()})</span></p>
        <p className="small">{capital(live ? gainText(a) : statsText(a))}{a.short !== undefined ? <> · <strong>{formatGp(a.short)} gp missing</strong></> : null}.<ActionNotes a={a} /><OwnershipNote a={a} /></p>
        {a.how === 'buy' && <p className="small upgrade-where"><ActionSource a={a} onShow={onShow} /></p>}
      </div>
      {nav && a.short === undefined && <NavigateButton target={nav} compact />}
    </li>
  );
}

/** The route step of a quest: the shared resolver (lib/questSteps.ts). */
export const questStep = questStepOf;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="gear-metric">
      <span className="gear-metric-label">{label}</span>
      <strong className="gear-metric-value">{value}</strong>
      {hint && <span className="gear-metric-hint muted small">{hint}</span>}
    </div>
  );
}

/** One roadmap row: the items a requirement opens, and a bar for every level still missing. */
function RoadmapRowView({ row, steps }: { row: RoadmapRow; steps: Step[] }) {
  const need = row.skills.map((s) => `${s.need} ${SKILL_EN[s.skill]}`).join(' and ');
  return (
    <li className="gear-row gear-locked roadmap-row">
      <ItemIcon src={row.items[0].iconUrl} alt="" size={28} />
      <div className="gear-main">
        <p className="roadmap-items">
          {row.items.map((it, i) => (
            <span key={it.id} className="roadmap-item">
              {i > 0 && ', '}<strong>{it.name}</strong> <span className="muted small">({SLOT_LABEL[it.slot].toLowerCase()})</span>
              {it.gain && <span className="gear-gain"> {it.gain}</span>}
            </span>
          ))}
        </p>
        <p className="roadmap-lock">
          <span className="lock-chip">🔒 {need ? `needs ${need}` : 'needs a quest'}</span>
          {row.owned && <span className="lock-chip is-owned">In the {row.owned === 'bank' ? 'bank' : 'bag'} — cannot be worn yet</span>}
        </p>
        {row.skills.map((s) => {
          const left = Math.max(0, s.need - s.have);
          const width = Math.max(0, Math.min(100, Math.round((s.have / s.need) * 100)));
          return (
            <div key={s.skill} className="req-bar" role="img" aria-label={`${SKILL_EN[s.skill]} ${s.have} of ${s.need}, ${left} missing`}>
              <span className="req-bar-label">{SKILL_EN[s.skill]} {s.have}/{s.need}</span>
              <span className="req-bar-track"><span className="req-bar-fill" style={{ width: `${width}%` }} /></span>
              <span className="req-bar-left muted small">{left} missing <a href={`#/skills/${SKILL_PAGE[s.skill]}`} title="How to make up">⚡</a></span>
            </div>
          );
        })}
        {row.quests.map((q) => {
          const step = questStep(steps, q);
          return (
            <p key={q} className="small">✗ quest {q}{step ? <> <a href={`#/step/${step.id}`}>🧭 to step {step.id}</a></> : <span className="muted"> — not on the route</span>}</p>
          );
        })}
      </div>
    </li>
  );
}

/** The worn items, one row per slot: live, or a snapshot that says it is one. */
function WornList({ equipped, stale }: { equipped: Partial<Record<GearSlot, Equipped>>; stale: boolean }) {
  return (
    <ul className={`gear-worn-list${stale ? ' is-stale' : ''}`}>
      {SLOTS.map((slot) => {
        const e = equipped[slot];
        return (
          <li key={slot} className={`gear-worn-item ${e ? 'is-filled' : 'is-empty'}`}>
            {e?.piece ? <ItemIcon src={e.piece.iconUrl} alt="" size={28} /> : <SlotGlyph slot={slot} />}
            <span className="gear-worn-text"><span className="muted small">{SLOT_LABEL[slot]}</span><span>{e ? e.name : '—'}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

/** The one thing to do, or the reason there is nothing worth doing. */
function Recommendation({ advice, stepId, onShow, priceUnknown, pricesFailed }: {
  advice: GearAdvice; stepId?: string; onShow: ReturnType<typeof usePlaceMap>['show']; priceUnknown: boolean; pricesFailed: boolean;
}) {
  const top = advice.actions.find((a) => a.how === 'wear') ?? advice.actions[0];
  if (top) {
    const nav = actionNav(top, stepId);
    const cur = top.current?.name ?? top.currentName;
    return (
      <section className="card gear-reco" aria-label="Recommendation">
        <p className="gear-reco-head"><ActionTitle a={top} /></p>
        <p className="small gear-reco-swap">
          <span className="muted">{SLOT_LABEL[top.slot]}:</span> {cur ?? 'nothing'} → <strong>{top.item.name}</strong>
        </p>
        <p className="small">{capital(gainText(top))}.<ActionNotes a={top} /><OwnershipNote a={top} /></p>
        {top.how === 'buy' && (
          <p className="small upgrade-where">
            <ActionSource a={top} onShow={onShow} />
            {advice.coins.total !== null && top.cost !== null && <span className="muted"> · leaves {formatGp(Math.max(0, advice.coins.total - advice.reserve - top.cost))} gp after the supplies</span>}
          </p>
        )}
        {nav && <p className="gear-reco-actions"><NavigateButton target={nav} /></p>}
      </section>
    );
  }
  const next = advice.goals[0];
  const lock = advice.locked[0];
  const why = advice.reserveUnknown ? 'Supply prices or ownership are not fully checked. Confirm Preparation before spending on upgrades.' : priceUnknown
    ? (pricesFailed ? 'The exchange prices did not load, so purchases cannot be judged against your money.' : 'The exchange prices are still loading.')
    : next
      ? (advice.reserve > 0 && advice.coins.total !== null && advice.coins.total < advice.reserve
        // Less than the supplies need: nothing is kept, the supplies come first.
        ? `The next real step up is ${next.item.name}${next.cost !== null ? ` (${formatGp(next.cost)} gp)` : ''}, after the ${formatGp(advice.reserve)} gp the next supplies need.`
        : `The next real step up is ${next.item.name}${next.short !== undefined ? `: ${formatGp(next.short)} gp short` : ''}${advice.reserve > 0 ? ` after keeping ${formatGp(advice.reserve)} gp for the next supplies` : ''}.`)
      : lock
        ? `The next step up is ${lock.item.name}, once you reach its requirements.`
        : 'What you wear is the best you can wear and afford at these levels.';
  return (
    <section className="card gear-reco is-none" aria-label="Recommendation" role="status">
      <p className="gear-reco-head"><strong>No worthwhile change for this fight</strong></p>
      <p className="small muted">{why}</p>
    </section>
  );
}

export function GearPage() {
  const { dependencies, ctx: { qp: effectiveQp } } = useReadinessEngine();
  const { state, stats, lastGears, lastGear } = useBridge();
  const { mode, steps, progress } = useStore();
  const { state: player } = usePlayerState();
  const profiles = useProfiles();
  const prices = usePriceView(true);

  // Coins kept for the next trip's supplies: the same list as Shopping.
  const reserve = useMemo(() => {
    const current = nextStep(steps, progress, effectiveQp, dependencies)?.id ?? null;
    const { list, trip } = scopeList(scopeSteps('trip', steps, progress, current, { from: 1, to: 1, openOnly: true }));
    const rows = shopRows(list, {
      state: player, trip, detail: (id) => itemById.get(id),
      onGe: (l: ShoppingLine) => l.id !== undefined, gePrice: (l) => itemPrice(prices, l.nameEn, l.id, 1).unit,
    });
    return supplyReserve(rows, list.coins);
  }, [steps, progress, effectiveQp, dependencies, player, prices]);

  const { advice, fightStep, pricesReady, pricesFailed } = useGearAdvice(null, { reserve: reserve.amount, reserveUnknown: !reserve.complete });
  const priceUnknown = !pricesReady && advice.goals.length > 0;
  const places = usePlaceMap();
  const lv = advice.levels;
  const foe = advice.foes[0];
  const now = advice.weaponNow;
  const roadmap = buildRoadmap(advice);
  const prayers = prayerChips(advice.prayers);

  // Offline: this character's snapshot only (the profile's bound name), else the newest one, named.
  const bound = profiles.list.find((p) => p.id === profiles.active)?.player;
  const snapshot: LastGear | null = advice.live ? null : bound ? lastGears[bound.toLowerCase()] ?? null : lastGear;
  const staleWorn = snapshot ? equippedBySlot(snapshot.gear, gearData) : null;
  const incoming = advice.incoming;
  const context = fightStep && foe
    ? <>For <a href={`#/step/${fightStep.id}`}>{fightStep.id}</a>: {foe.name}{incoming ? <>, attacks with {incoming.style}{incoming.maxHit ? `, hits up to ${incoming.maxHit}` : ''}</> : null}.</>
    : <>No supported opponent selected: comparison uses a cow.</>;
  const coins = advice.coins;
  // Levels from the game or entered on the Skills page; without either the advisor works from level 1, which is not shown as the player's.
  const levelsKnown = Boolean(stats?.attack || progress.levels.attack);

  return (
    <div className="page gear-page">
      <header className="page-head">
        <h1>Gear</h1>
        <p className="muted small gear-context">
          {context}{' '}
          {levelsKnown
            ? <>Attack {lv.attack} · Strength {lv.strength} · Defence {lv.defence}{!stats?.attack && <> (<a href="#/skills">from your profile</a>)</>}</>
            : <a href="#/skills">Your levels are not known yet</a>}
          {coins.total !== null && <> · {formatGp(coins.total)} gp{coins.bank === null ? ' (bank not checked)' : ''}{advice.reserve > 0 ? (coins.total < advice.reserve ? `, the next supplies need ${formatGp(advice.reserve)}` : `, ${formatGp(advice.reserve)} kept for the next supplies`) : ''}</>}
        </p>
      </header>

      {advice.live ? (
        <section className="gear-now" aria-label="Worn now">
          <h2 className="subhead">Worn now</h2>
          <WornList equipped={advice.equipped} stale={false} />
        </section>
      ) : snapshot && staleWorn ? (
        <section className="gear-now" aria-label="Last known">
          <h2 className="subhead">Last known <span className="muted">· {snapshot.player}</span></h2>
          <WornList equipped={staleWorn} stale />
          <p className="small muted">Not live: {state === 'online' ? 'log in to the game' : 'connect RuneLite'} to compare what you wear now.</p>
        </section>
      ) : (
        <div className="card gear-connect" role="status">
          <p><strong>{state === 'online' ? 'Waiting for your character' : 'RuneLite is not connected'}</strong></p>
          <p className="small muted">The app reads what you wear from the game, then says whether a change is worth making.</p>
        </div>
      )}

      {advice.live && <Recommendation advice={advice} stepId={fightStep?.id} onShow={places.show} priceUnknown={priceUnknown} pricesFailed={pricesFailed} />}

      {advice.live && (advice.actions.length > 1 || advice.armour.length > 0 || advice.goals.length > 0) && (
        <details className="gear-more">
          <summary className="subhead">Other options <span className="muted">· {Math.max(0, advice.actions.length - 1) + advice.armour.length + advice.goals.length}</span></summary>
          {advice.actions.length > 1 && <ul className="gear-list">{advice.actions.filter((a) => a !== (advice.actions.find((x) => x.how === 'wear') ?? advice.actions[0])).map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live onShow={places.show} />)}</ul>}
          {advice.armour.length > 0 && (
            <>
              <p className="small muted">Armour within means: it saves food, it does not speed up the fight.</p>
              <ul className="gear-list">{advice.armour.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live onShow={places.show} />)}</ul>
            </>
          )}
          {advice.goals.length > 0 && (
            <>
              <p className="small muted">{priceUnknown ? 'The price is not known yet:' : 'Better than what your money allows now:'}</p>
              <ul className="gear-list">{advice.goals.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live onShow={places.show} />)}</ul>
            </>
          )}
        </details>
      )}

      {advice.live && (
        <details className="gear-more gear-combat">
          <summary className="subhead">Combat numbers</summary>
          <div className="gear-metrics">
            <Metric label="Max hit" value={String(now.maxHit)} />
            <Metric label="Hit chance" value={`${Math.round(now.hitChance * 100)}%`} hint={foe ? `vs ${foe.name}` : undefined} />
            <Metric label="Damage per second" value={now.dps.toFixed(2)} />
            <Metric label="Attack interval" value={`${now.speed.toFixed(1)} s`} />
          </div>
          {advice.weaponUnknown && <p className="small muted">The weapon in hand ({advice.weaponUnknown}) is not in the app's data: counted without it.</p>}
          {mode === 'members' && <p className="small muted">The item data holds free-world weapons and armour so far.</p>}
        </details>
      )}

      {levelsKnown && <details className="gear-more" id="gear-roadmap">
        <summary className="subhead">Future unlocks <span className="muted">· {roadmap.length}</span></summary>
        {roadmap.length > 0 ? <ul className="gear-roadmap">{roadmap.map((r) => <RoadmapRowView key={r.key} row={r} steps={steps} />)}</ul> : <p className="small muted">Nothing better within reach of your levels.</p>}
        <p className="gear-chips gear-prayers" aria-label="Prayers">
          {prayers.map((p) => (
            <span key={p.name} className={`chip ${p.ready ? 'is-ready' : ''}`} title={p.title}>🙏 {p.name}{p.ready ? '' : ' · 4 Prayer'}</span>
          ))}
        </p>
      </details>}
      <PlaceMapView view={places.view} onClose={places.close} />
    </div>
  );
}
