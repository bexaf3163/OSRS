// "⚔️ Gear": what is worn, how hard it hits and what to do to hit faster — wear the best from the bag
// and bank, buy from a trader or at the exchange, save up. It is counted by the OSRS Wiki damage formulas against the opponent
// of the nearest combat step. The gear data is from RuneLite; without it — by the levels from the profile.

import { useBridge, type LastGear } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { useGearAdvice } from '../lib/gearAdvice';
import {
  actionNav, gainText, SLOT_LABEL, SLOTS, statsText, WINDOW, type GearAction, type LockedItem, type MeleeResult,
  type MissingRequirement,
} from '../services/gearAdvisor';
import type { Step } from '../types';
import { ItemIcon } from '../components/WikiDrawer';
import { NavigateButton } from '../components/NavigateButton';
import { PlaceMapView, usePlaceMap } from '../components/PlaceMap';
import { ActionNotes, ActionSource, ActionTitle, foesText } from '../components/GearPrompt';

const HIT_TYPE = { stab: 'stab', slash: 'slash', crush: 'crush' } as const;
const STYLE_LABEL = { accurate: 'Accurate', aggressive: 'Aggressive' } as const;
const sec = (n: number) => n.toFixed(1);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;

function DamageLine({ r }: { r: MeleeResult }) {
  return (
    <>
      max hit <strong>{r.maxHit}</strong>, once every {sec(r.speed)} s, {pct(r.hitChance)} hit chance
      {' '}— damage per second {r.dps.toFixed(2)} (style {STYLE_LABEL[r.style]}{r.type ? `, ${HIT_TYPE[r.type]} hits` : ''})
    </>
  );
}

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

/** Where to lead for what is missing: the skill page (the training plan) or a step with a quest. */
const SKILL_PAGE = { attack: 'ME', strength: 'ME', defence: 'ME', ranged: 'RA', magic: 'MA', prayer: 'PR' } as const;
const SKILL_EN = { attack: 'Attack', strength: 'Strength', defence: 'Defence', ranged: 'Ranged', magic: 'Magic', prayer: 'Prayer' } as const;

export function questStep(steps: Step[], quest: string): Step | undefined {
  return steps.find((s) => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === quest);
}

function MissingLine({ m, steps }: { m: MissingRequirement; steps: Step[] }) {
  if (m.kind === 'skill') {
    const left = m.need - m.have;
    return (
      <li>
        ✗ {m.need} {SKILL_EN[m.skill]} <span className="muted">— now {m.have}, {left} missing</span>
        {' '}<a href={`#/skills/${SKILL_PAGE[m.skill]}`}>⚡ how to make up</a>
      </li>
    );
  }
  const step = questStep(steps, m.quest);
  return (
    <li>
      ✗ quest {m.quest}
      {step ? <> {' '}<a href={`#/step/${step.id}`}>🧭 to step {step.id}</a></> : <span className="muted"> — it is not on the route</span>}
    </li>
  );
}

/**
 * A lock: one requirement — one row. Three steel items "need 5 Defence" — one row with three
 * names, not three identical cards. An item that already lies in the bank is always separate.
 */
function LockedRow({ group, live, steps }: { group: LockedItem[]; live: boolean; steps: Step[] }) {
  const l = group[0];
  const skills = l.missing.filter((m) => m.kind === 'skill');
  const title = skills.length
    ? `needs ${skills.map((m) => `${m.need} ${SKILL_EN[m.skill]}`).join(' and ')}`
    : 'needs a quest';
  return (
    <li className="gear-row gear-locked">
      <ItemIcon src={l.item.iconUrl} alt="" size={28} />
      <div className="gear-main">
        <p>
          <span className="lock-chip">🔒 {title}</span>{' '}
          {group.map((g, i) => (
            <span key={g.item.id}>
              {i > 0 && ', '}<strong>{g.item.name}</strong>{' '}
              <span className="muted small">({SLOT_LABEL[g.slot].toLowerCase()})</span>
            </span>
          ))}
        </p>
        {l.owned && (
          <p className="small"><strong>Already {l.owned === 'bank' ? 'in the bank' : 'in the bag'}, but cannot be worn yet.</strong> Do not sell it — it will come in handy.</p>
        )}
        {group.length === 1 && <p className="small">{capital(live ? gainText(l) : statsText(l))} — when it unlocks.</p>}
        <ul className="small gear-plain lock-missing">
          {l.missing.map((m) => <MissingLine key={m.kind === 'skill' ? m.skill : m.quest} m={m} steps={steps} />)}
        </ul>
      </div>
    </li>
  );
}

function lockGroups(locked: LockedItem[]): LockedItem[][] {
  const out: LockedItem[][] = [];
  const byKey = new Map<string, LockedItem[]>();
  for (const l of locked) {
    if (l.owned) { out.push([l]); continue; }
    const key = JSON.stringify(l.missing);
    const g = byKey.get(key);
    if (g) g.push(l);
    else { const n = [l]; byKey.set(key, n); out.push(n); }
  }
  // First what is already owned — it cannot be skipped.
  return out.sort((a, b) => Number(Boolean(b[0].owned)) - Number(Boolean(a[0].owned)));
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

  const bridgeNote = !advice.live
    ? state === 'off'
      ? 'The RuneLite link is turned off — advice by the levels from the profile, without what is worn and how many coins there are.'
      : 'RuneLite is not connected or you are not in the game — advice by the levels from the profile.'
    : coins.bank === null
      ? 'The gear and bag are from the game. Open the bank in the game: the app will take the coins and items from there.'
      : 'The gear, bag and bank are from the game.';

  return (
    <div className="page gear-page">
      <header className="page-head">
        <h1>⚔️ Gear</h1>
        <p className="muted">
          What is worn, how hard it hits and what to do to hit faster: first the free (wear the best from the bag
          and bank), then purchases within means. The app buys and wears nothing — it only counts and leads the arrow.
        </p>
      </header>

      <section className="card gear-summary" aria-label="Now">
        <p>
          <strong>Levels {fromGame ? 'from the game' : 'from the profile'}:</strong> Attack {lv.attack} · Strength {lv.strength} · Defence {lv.defence}
          {lv.ranged ? <> · Ranged {lv.ranged}</> : null}
          {lv.magic ? <> · Magic {lv.magic}</> : null}
          {lv.prayer ? <> · Prayer {lv.prayer}</> : null}
          {!fromGame && <span className="muted"> — entered on the <a href="#/skills">Skills</a> page</span>}
        </p>
        <p>
          <strong>Comparison {foesText(advice.foes)}</strong>
          {fightStep
            ? <span className="muted"> — the opponent of step <a href={`#/step/${fightStep.id}`}>{fightStep.id}</a> "{fightStep.title}"</span>
            : <span className="muted"> — there are no combat steps ahead</span>}
        </p>
        {advice.live ? (
          <p>
            <strong>Now:</strong> {advice.weaponUnknown ? <>in hand: {advice.weaponUnknown} — its bonuses are not in the app database, counted without it: </> : null}
            <DamageLine r={advice.weaponNow} />
            {advice.weaponNow.dps > 0 && (
              <> · ≈ {Math.round(advice.foes[0].hitpoints / advice.weaponNow.dps)} s per opponent: {advice.foes[0].name}, {advice.foes[0].hitpoints} HP</>
            )}
          </p>
        ) : (
          <p><strong>Now:</strong> the app does not see what is in hand — the RuneLite link is needed.</p>
        )}
        {coins.total !== null && (
          <p>
            <strong>Coins:</strong> {formatGp(coins.total)} gp <span className="muted">(in the bag {formatGp(coins.bag ?? 0)}{coins.bank !== null ? `, in the bank ${formatGp(coins.bank)}` : ', the bank has not been opened yet'})</span>
            {wealth?.items.total != null && wealth.items.total > 0 && (
              <span className="muted"> · items ~{formatGp(wealth.items.total)} gp at exchange prices (an estimate, not money)</span>
            )}
          </p>
        )}
        <p className="muted small">
          {bridgeNote}
          {pricesFailed ? ' The exchange prices are unavailable (no internet?) — exchange purchases have no price.' : !pricesReady ? ' Loading the exchange prices…' : ''}
        </p>
      </section>

      {!advice.live && lastGear && <LastKnown last={lastGear} />}

      <section className="card section-card" aria-labelledby="gear-now">
        <h2 id="gear-now" className="card-title">Do now — hit faster</h2>
        {advice.actions.length ? (
          <ul className="gear-list">{advice.actions.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        ) : (
          <p className="small">
            {advice.live
              ? 'The weapon and amulet are the best possible now at your levels and money.'
              : 'Without data from the game the app does not know what is worn and how many coins there are — see the goals below: this is the best by level.'}
          </p>
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
          <p className="small muted">
            It does not speed up combat — it protects health and food. It is not in the route's shopping: the money for the steps (S2-01, S2-04) matters more.
          </p>
          <ul className="gear-list">{advice.armour.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        </section>
      )}

      {advice.locked.length > 0 && (
        <section className="card section-card" aria-labelledby="gear-locked">
          <h2 id="gear-locked" className="card-title">🔒 Better, but cannot be worn yet</h2>
          <p className="small muted">
            The requirements — levels and quests — are from the OSRS Wiki. The app does not advise buying such items until the requirements are met.
          </p>
          <ul className="gear-list">{lockGroups(advice.locked).map((g) => <LockedRow key={g.map((l) => l.item.id).join('-')} group={g} live={advice.live} steps={steps} />)}</ul>
        </section>
      )}

      <section className="card section-card" aria-labelledby="gear-next">
        <h2 id="gear-next" className="card-title">What opens next</h2>
        <ul className="small gear-plain">
          {advice.unlocks.map((u) => (
            <li key={u.item.id}>
              <strong>{u.item.name}</strong> — from {u.level} {u.skill === 'attack' ? 'Attack' : u.skill === 'defence' ? 'Defence' : 'Strength'}
              <span className="muted"> · you have {u.have}</span>
            </li>
          ))}
          {advice.prayers.map((p) => (
            <li key={p.name}>
              The <strong>{p.name}</strong> prayer ({p.effect}) is already unlocked — turn it on in combat{p.maxHit ? <>: max hit {p.maxHit}</> : null}.
            </li>
          ))}
          {!advice.prayers.length && (
            <li>At 4 Prayer you unlock <strong>Burst of Strength</strong> (+5% Strength) — bury bones (Bury), cows drop them.</li>
          )}
        </ul>
      </section>

      <section className="card section-card" aria-labelledby="gear-slots">
        <h2 id="gear-slots" className="card-title">Worn</h2>
        {advice.live ? (
          <ul className="gear-slots">
            {SLOTS.map((slot) => {
              const e = advice.equipped[slot];
              return (
                <li key={slot}>
                  <span className="muted">{SLOT_LABEL[slot]}</span>
                  <span>
                    {e ? (
                      <>
                        {e.piece && <ItemIcon src={e.piece.iconUrl} alt="" />} {e.name}
                        {!e.piece && <span className="muted small"> (not in the database)</span>}
                      </>
                    ) : <span className="muted">empty</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small muted">It will appear when the app is connected to RuneLite and you are in the game.</p>
        )}
      </section>

      <p className="muted small">
        The damage is by the OSRS Wiki formulas (Damage per second/Melee), the opponent's defence is from its wiki card. The percents are averaged
        over the nearest {WINDOW} Strength levels: a sword is bought for the whole training, and the max hit grows in steps.
        We advise if the damage grows by at least 3% or the defence by at least 3. Items, requirements and shop prices — OSRS Wiki,
        the exchange prices — prices.runescape.wiki.
        {mode === 'members' && ' The database holds only free-world weapons and armor so far.'}
      </p>
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
      <p className="muted small">A record while the game was running. What changed after — the app will learn when RuneLite connects.</p>
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
