// "⚔️ Gear": a loadout dashboard — what is worn, the combat numbers, and the upgrade roadmap (wear the best from the bag and bank, buy, save up,
// what opens next). Counted by the OSRS Wiki damage formulas against the opponent of the nearest combat step. The gear data is from RuneLite;
// without it — by the levels from the profile.

import { useBridge, type LastGear } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { useGearAdvice } from '../lib/gearAdvice';
import { actionNav, gainText, SLOT_LABEL, SLOTS, statsText, type GearAction } from '../services/gearAdvisor';
import { buildRoadmap, prayerChips, type RoadmapRow } from '../lib/gearRoadmap';
import type { GearSlot, Step } from '../types';
import { ItemIcon } from '../components/WikiDrawer';
import { NavigateButton } from '../components/NavigateButton';
import { PlaceMapView, usePlaceMap } from '../components/PlaceMap';
import { ActionNotes, ActionSource, ActionTitle } from '../components/GearPrompt';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SLOT_ICON: Record<GearSlot, string> = { weapon: '⚔️', neck: '📿', head: '⛑️', body: '👕', legs: '👖', shield: '🛡️' };
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
        <p className="small">{capital(live ? gainText(a) : statsText(a))}{a.short !== undefined ? <> · <strong>{formatGp(a.short)} gp missing</strong></> : null}.<ActionNotes a={a} /></p>
        {a.how === 'buy' && <p className="small upgrade-where"><ActionSource a={a} onShow={onShow} /></p>}
      </div>
      {nav && a.short === undefined && <NavigateButton target={nav} compact />}
    </li>
  );
}

export function questStep(steps: Step[], quest: string): Step | undefined {
  return steps.find((s) => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === quest);
}

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

export function GearPage() {
  const { state, stats, gear, lastGear } = useBridge();
  const { mode, steps } = useStore();
  const { advice, fightStep, pricesReady, pricesFailed } = useGearAdvice();
  const places = usePlaceMap();
  const lv = advice.levels;
  const fromGame = Boolean(stats?.attack);
  const coins = advice.coins;
  const wealth = wealthOf(gear);
  const foe = advice.foes[0];
  const now = advice.weaponNow;
  const roadmap = buildRoadmap(advice);
  const prayers = prayerChips(advice.prayers);
  const link = advice.live ? null : state === 'off' ? 'RuneLite link off — levels from the profile' : 'RuneLite not connected — levels from the profile';

  return (
    <div className="page gear-page">
      <header className="page-head">
        <h1>⚔️ Gear</h1>
      </header>

      <div className="gear-top">
        <section className="card section-card gear-worn" aria-labelledby="gear-slots">
          <h2 id="gear-slots" className="card-title">Worn</h2>
          <ul className="gear-paper">
            {SLOTS.map((slot) => {
              const e = advice.live ? advice.equipped[slot] : undefined;
              const tier = e?.piece?.metal ? capital(e.piece.metal) : null;
              return (
                <li key={slot} className={`gear-slot ${e ? 'is-filled' : 'is-empty'}`}>
                  <span className="gear-slot-label"><span aria-hidden="true">{SLOT_ICON[slot]}</span> {SLOT_LABEL[slot]}</span>
                  {e ? (
                    <span className="gear-slot-item">
                      {e.piece && <ItemIcon src={e.piece.iconUrl} alt="" size={28} />}
                      <span className="gear-slot-name">{e.name}</span>
                      {tier && <span className="badge badge-tier">{tier}</span>}
                      {!e.piece && <span className="muted small">not in the database</span>}
                    </span>
                  ) : <span className="gear-slot-item muted">{advice.live ? 'empty' : '—'}</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card section-card gear-combat" aria-labelledby="gear-metrics">
          <h2 id="gear-metrics" className="card-title">Combat</h2>
          {advice.live ? (
            <>
              <div className="gear-metrics">
                <Metric label="Max Hit" value={String(now.maxHit)} />
                <Metric label="DPS" value={now.dps.toFixed(2)} />
                <Metric label="Speed" value={`${now.speed.toFixed(1)}s`} />
                <Metric label="Target TTK" value={now.dps > 0 && foe ? `~${Math.round(foe.hitpoints / now.dps)}s` : '—'} hint={foe ? `vs ${foe.name}` : undefined} />
              </div>
              <p className="gear-chips">
                {foe && fightStep && <a className="chip" href={`#/step/${fightStep.id}`}>{fightStep.id} · {foe.name}, {foe.hitpoints} HP</a>}
                <span className="chip">{Math.round(now.hitChance * 100)}% hit chance</span>
                {advice.weaponUnknown && <span className="chip is-warn" title="Its bonuses are not in the app database: counted without it">in hand: {advice.weaponUnknown}</span>}
              </p>
            </>
          ) : (
            <div className="gear-metrics is-empty">
              <Metric label="Max Hit" value="—" />
              <Metric label="DPS" value="—" />
              <Metric label="Speed" value="—" />
              <Metric label="Target TTK" value="—" />
            </div>
          )}
        </section>
      </div>

      <p className="gear-chips gear-status" aria-label="Levels and coins">
        <span className="chip">Atk {lv.attack}</span><span className="chip">Str {lv.strength}</span><span className="chip">Def {lv.defence}</span>
        {lv.ranged ? <span className="chip">Rng {lv.ranged}</span> : null}
        {lv.magic ? <span className="chip">Mag {lv.magic}</span> : null}
        {lv.prayer ? <span className="chip">Pray {lv.prayer}</span> : null}
        {!fromGame && <a className="chip" href="#/skills" title="Levels are entered on the Skills page">levels: profile</a>}
        {coins.total !== null && <span className="chip">{formatGp(coins.total)} gp{coins.bank === null ? ' · bank unknown' : ''}</span>}
        {wealth?.items.total != null && wealth.items.total > 0 && <span className="chip" title="Items at exchange prices (an estimate, not money)">items ~{formatGp(wealth.items.total)} gp</span>}
        {link && <span className="chip is-warn">{link}</span>}
        {pricesFailed ? <span className="chip is-warn">exchange prices unavailable</span> : !pricesReady ? <span className="chip">loading prices…</span> : null}
        {mode === 'members' && <span className="chip" title="The database holds only free-world weapons and armor so far">free-world items only</span>}
      </p>

      {!advice.live && lastGear && <LastKnown last={lastGear} />}

      <section className="card section-card" aria-labelledby="gear-now">
        <h2 id="gear-now" className="card-title">Do now — hit faster</h2>
        {advice.actions.length ? (
          <ul className="gear-list">{advice.actions.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        ) : (
          <p className="small">{advice.live ? '✓ The weapon and amulet are the best possible at your levels and money.' : 'Needs RuneLite data — see the best by level below.'}</p>
        )}
      </section>

      {advice.goals.length > 0 && (
        <section className="card section-card" aria-labelledby="gear-goals">
          <h2 id="gear-goals" className="card-title">{advice.live ? 'Save up — better than what you can afford now' : 'The best by level'}</h2>
          <ul className="gear-list">{advice.goals.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        </section>
      )}

      {advice.armour.length > 0 && (
        <section className="card section-card" aria-labelledby="gear-armour">
          <h2 id="gear-armour" className="card-title">Armor within means — optional</h2>
          <ul className="gear-list">{advice.armour.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        </section>
      )}

      <section className="card section-card" aria-labelledby="gear-roadmap">
        <h2 id="gear-roadmap" className="card-title">Upgrade roadmap</h2>
        {roadmap.length > 0 && <ul className="gear-roadmap">{roadmap.map((r) => <RoadmapRowView key={r.key} row={r} steps={steps} />)}</ul>}
        <p className="gear-chips gear-prayers" aria-label="Prayers">
          {prayers.map((p) => (
            <span key={p.name} className={`chip ${p.ready ? 'is-ready' : ''}`} title={p.title}>🙏 {p.name}{p.ready ? '' : ' · 4 Prayer'}</span>
          ))}
        </p>
      </section>
      <PlaceMapView view={places.view} onClose={places.close} />
    </div>
  );
}

/** What the character had when the game was closed: not "now" but a record — so with a date and a name. */
function LastKnown({ last }: { last: LastGear }) {
  const g = last.gear;
  const worn = (g.equipment ?? []).map((i) => i.name);
  const bag = (g.inventory ?? []).map((i) => (i.count && i.count > 1 ? `${i.name} ×${i.count}` : i.name));
  return (
    <section className="card section-card" aria-labelledby="gear-last">
      <h2 id="gear-last" className="card-title">Last known — {last.player}, {new Date(last.at).toLocaleString('en-US')}</h2>
      {worn.length > 0 && <p className="small"><strong>Worn:</strong> {worn.join(', ')}</p>}
      {bag.length > 0 && <p className="small"><strong>In the bag:</strong> {bag.join(', ')}</p>}
      {g.coins !== null && (
        <p className="small">
          <strong>Coins:</strong> {formatGp(g.coins)} gp{g.bankCoins != null ? `, in the bank ${formatGp(g.bankCoins)}` : ''}
        </p>
      )}
    </section>
  );
}
