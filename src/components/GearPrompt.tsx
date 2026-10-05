// "⚔️ Stronger in combat": on a combat step — what to wear or buy to hit the step's opponent faster.
// The analysis is gearAdvisor (OSRS Wiki damage formulas, the opponent's defence from the wiki). The button leads the in-game arrow to the seller;
// when the item is in the bag, the target is cleared by itself. It buys and wears nothing — only advises.
// "✕ Skip" hides the advice on this step (and the HUD line in the game).

import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useFeatures } from '../lib/features';
import { isClosed } from '../lib/next-step';
import { formatGp } from '../lib/shopping';
import { useGearAdvice } from '../lib/gearAdvice';
import { actionNav, gainText, missingText, sourceText, type GearAction, type GearAdvice, type Source } from '../services/gearAdvisor';
import type { Foe } from '../types';
import { NavigateButton } from './NavigateButton';
import { PlaceButton, PlaceMapView, usePlaceMap } from './PlaceMap';

/** "against Cow (level 2)", "against Al Kharid warrior (level 9) and Flesh Crawler (level 28)". */
export const foesText = (foes: Foe[]) => `against ${foes.map((f) => `${f.name} (level ${f.combat})`).join(' and ')}`;

/** What to do: "Wear Iron scimitar — it is in the bank", "Buy Steel scimitar instead of Bronze sword". */
export function ActionTitle({ a }: { a: GearAction }) {
  const cur = a.current?.name ?? a.currentName;
  if (a.how === 'wear') {
    return <>Wear <strong>{a.item.name}</strong> — {a.source.kind === 'bank' ? 'it is in the bank' : 'it is in the bag'}</>;
  }
  return <>Buy <strong>{a.item.name}</strong>{cur ? <> instead of {cur}</> : null}</>;
}

/** Where to get it: a shop — with a map button, the exchange — with a price; the second option — "or …". */
export function ActionSource({ a, onShow }: { a: GearAction; onShow: ReturnType<typeof usePlaceMap>['show'] }) {
  if (a.how === 'wear') return null;
  const s = a.source;
  const alt = a.alternatives.find((x) => x.kind !== s.kind || (x.kind === 'shop' && s.kind === 'shop' && x.shop !== s.shop));
  return (
    <>
      {s.kind === 'shop' ? (
        <>
          <PlaceButton query={{ kind: 'shop', location: s.location, shop: s.shop, npc: s.npc }} onShow={onShow}>{s.shop} • {s.location}</PlaceButton>
          {s.npc && <span className="muted"> · seller {s.npc}</span>}
          <> · {formatGp(s.price)} gp</>
          {s.toll ? <span className="muted"> (+{s.toll} gp toll into Al Kharid)</span> : null}
        </>
      ) : (
        <>Grand Exchange{s.kind === 'ge' && s.price !== undefined ? <> · ~{formatGp(s.price)} gp</> : <span className="muted"> · the price did not load</span>}</>
      )}
      {alt && <span className="muted"> · or {altText(alt)}</span>}
    </>
  );
}

const altText = (s: Source) => (s.kind === 'ge' ? (s.price !== undefined ? `on the exchange ~${formatGp(s.price)} gp` : 'on the exchange') : sourceText(s));

/** Marks: the item is bought on the route anyway, a two-handed weapon. */
export function ActionNotes({ a }: { a: GearAction }) {
  return (
    <>
      {a.routeStep && (
        <> The route buys it at step <a href={`#/step/${a.routeStep}`}>{a.routeStep}</a> — taking it earlier means hitting faster sooner.</>
      )}
      {a.twoHanded && <> Two-handed: the shield will have to come off.</>}
    </>
  );
}

/** "⚠️ Coif is in the bank but cannot be worn yet: 20 Ranged (now 17)" — so that it is not taken for ready. */
export function LockedOwnedNote({ advice }: { advice: GearAdvice }) {
  const owned = advice.locked.filter((l) => l.owned);
  if (!owned.length) return null;
  return (
    <>
      {owned.map((l) => (
        <p key={l.item.id} className="small lock-note">
          ⚠️ <strong>{l.item.name}</strong> {l.owned === 'bank' ? 'is in the bank' : 'is in the bag'}, but cannot be worn yet: needs {missingText(l.missing)}.
        </p>
      ))}
    </>
  );
}

export function GearPrompt({ step }: { step: Step }) {
  const { upgradeRouter } = useFeatures();
  const { progress } = useStore();
  // Cheap checks — before the analysis: it is needed only for an expanded unfinished combat step.
  if (!upgradeRouter || !step.foes?.length || isClosed(progress, step.id) || progress.upgradeDismissedForSteps?.includes(step.id)) return null;
  return <GearPromptBody step={step} />;
}

function GearPromptBody({ step }: { step: Step }) {
  const { dismissUpgrade } = useStore();
  const { state } = useBridge();
  const { advice } = useGearAdvice(step);
  const places = usePlaceMap();
  const top = advice.actions[0];
  const more = advice.actions.slice(1, 3);
  const goal = advice.goals.find((g) => g.slot === 'weapon') ?? advice.goals.find((g) => g.slot === 'neck');
  const vs = foesText(advice.foes);
  const skip = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissUpgrade(step.id)}>✕ Skip</button>
  );

  // Without RuneLite we cannot see what is worn and how many coins there are: we advise by the levels from the profile.
  if (!advice.live) {
    const best = advice.goals.find((g) => g.slot === 'weapon');
    if (!best) return null;
    return (
      <section className="upgrade" aria-label="Stronger in combat">
        <p className="upgrade-kicker">⚔️ Stronger in combat</p>
        <p className="small">
          The best weapon for your Attack level ({advice.levels.attack}) — <strong>{best.item.name}</strong>
          {best.source.kind !== 'bag' && best.source.kind !== 'bank' ? <> ({sourceText(best.source)})</> : null}.
          {' '}{state === 'online'
            ? 'Log in to the game in RuneLite — the app will see what is worn and how many coins you have, and say whether a change is worth it.'
            : 'Turn on the RuneLite link — the app will see what is worn and how many coins you have, and say whether a change is worth it.'}
        </p>
        <div className="upgrade-actions">
          <a className="btn btn-sm" href="#/gear">The full gear analysis</a>
          {skip}
        </div>
      </section>
    );
  }

  if (!top) {
    return (
      <>
        <p className="small gear-ok">
          ✓ The weapon is the best possible at your levels {vs}
          {goal ? <>; next — {goal.item.name}{goal.short !== undefined ? <>, {formatGp(goal.short)} gp missing</> : null}</> : null}.
          {' '}<a href="#/gear">Gear analysis</a>
        </p>
        <LockedOwnedNote advice={advice} />
      </>
    );
  }

  const nav = actionNav(top, step.id);
  const seller = top.source.kind === 'shop' ? top.source.npc ?? top.source.shop : 'Grand Exchange';
  return (
    <section className="upgrade" aria-label="Stronger in combat">
      <p className="upgrade-kicker">⚔️ Stronger in combat</p>
      <p className="upgrade-title"><ActionTitle a={top} /></p>
      <p className="small">{capital(gainText(top))} {vs}.<ActionNotes a={top} /></p>
      {top.how === 'buy' && <p className="small upgrade-where"><span className="muted">Where to get it: </span><ActionSource a={top} onShow={places.show} /></p>}
      {more.length > 0 && (
        <ul className="small gear-more">
          {more.map((a) => (
            <li key={`${a.slot}-${a.item.id}`}>
              <ActionTitle a={a} /> — {gainText(a)}{a.how === 'buy' ? <>, {sourceText(a.source)}</> : null}
            </li>
          ))}
        </ul>
      )}
      {goal && (
        <p className="small muted">
          💰 Goal: {goal.item.name} — {gainText(goal)}
          {goal.short !== undefined ? <>, {formatGp(goal.short)} gp missing</> : <>, the price is unknown</>}.
        </p>
      )}
      <LockedOwnedNote advice={advice} />
      <div className="upgrade-actions">
        {nav && <NavigateButton target={nav} label={`🧭 Point ${seller === 'Grand Exchange' ? 'to the Grand Exchange' : `to ${seller}`}`} />}
        <a className="btn btn-ghost btn-sm" href="#/gear">The full analysis</a>
        {skip}
      </div>
      <PlaceMapView view={places.view} onClose={places.close} />
    </section>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A banner on "Path": the gear is visible from the game and there is something to do — the main advice and a link to the analysis.
 * It hides together with the advice of the nearest combat step ("✕ Skip").
 */
export function GearBanner() {
  const { upgradeRouter } = useFeatures();
  const { gear } = useBridge();
  if (!upgradeRouter || !gear) return null;
  return <GearBannerBody />;
}

function GearBannerBody() {
  const { progress, dismissUpgrade } = useStore();
  const { advice, fightStep } = useGearAdvice();
  const top = advice.actions[0];
  if (!advice.live || !top || (fightStep && progress.upgradeDismissedForSteps?.includes(fightStep.id))) return null;
  return (
    <section className="upgrade gear-banner" aria-label="Stronger in combat">
      <p className="upgrade-kicker">⚔️ You can hit faster</p>
      <p className="small"><ActionTitle a={top} /> — {gainText(top)} {foesText(advice.foes)}.</p>
      <div className="upgrade-actions">
        <a className="btn btn-sm" href="#/gear">Gear analysis</a>
        {fightStep && <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissUpgrade(fightStep.id)}>✕ Hide</button>}
      </div>
    </section>
  );
}
