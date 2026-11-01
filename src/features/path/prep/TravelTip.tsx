// A one-line "fastest way" tip under the step status. For the step shown in the game it is the very recommendation the game card shows (one decision,
// liveTransport.ts); for another step the plugin is asked where you are once per step view (a local request), and only a way clearly shorter than
// walking is told. The full list with the needs and buttons is in the "How to get there" card (Route and game).

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Step } from '../../../types';
import { useBridge } from '../../../state/bridge';
import { useStore } from '../../../state/store';
import { usePlayerState } from '../../../state/playerStateContext';
import { checkStatus } from '../../../services/runeliteBridge';
import { stepPlaces } from '../../../domain/travel/stepPlaces';
import { travelOptions, type Point } from '../../../domain/travel/travel';
import { fairyRingsUnlocked, oneTimeUsedOf, travelInputOf } from '../../../domain/travel/travelInput';
import { travelTip } from '../../../domain/readiness/tips';
import { isOverworld } from '../../../domain/travel/instances';
import { lastTransport, subscribeTransport, transportSources } from '../../../domain/travel/liveTransport';

export function TravelTip({ step }: { step: Step }) {
  const { progress, mode } = useStore();
  const { enabled, state, inGame, stats, gear, owned, activeStepId, questsDone } = useBridge();
  const { prices, state: player } = usePlayerState();
  const places = useMemo(() => stepPlaces(step), [step]);
  const decision = useSyncExternalStore(subscribeTransport, lastTransport, lastTransport);
  const [seen, setSeen] = useState<{ stepId: string; pos: Point | null; homeCooldown: number | null; homeKnown: boolean | null; spellbook: number | null; charges: number | null } | null>(null);
  const live = enabled && state === 'online' && inGame;
  const shown = live && activeStepId === step.id && decision?.stepId === step.id;

  // One local request per step view: the tip is for where you stood when the step opened.
  useEffect(() => {
    if (!live || !places.length || shown) return;
    let dead = false;
    void checkStatus().then((st) => {
      if (!dead) setSeen({ stepId: step.id, pos: st.online && st.inGame ? st.pos : null, homeCooldown: st.homeTeleportSeconds, homeKnown: st.homeTeleportKnown, spellbook: st.spellbook, charges: st.chronicleCharges });
    });
    return () => { dead = true; };
  }, [live, step.id, places.length, shown]);

  // The step is in the game: the same words as on the game card, so the two never disagree.
  if (shown) {
    const r = decision.recommended;
    return r ? <p className="small status-tip" role="note">💡 {r.text}{r.check ? ` — ${r.check}` : ''}</p> : null;
  }
  if (!live || !places.length || !seen || seen.stepId !== step.id || !seen.pos || !isOverworld(seen.pos) || !isOverworld(places[0])) return null;
  const options = travelOptions(travelInputOf({
    from: seen.pos, to: places[0], levels: progress.levels, stats, gear, owned, priceOf: prices.priceOf, mode, homeCooldownSec: seen.homeCooldown, fairyRings: fairyRingsUnlocked(progress), oneTimeUsed: oneTimeUsedOf(progress), questsDone,
    ...(seen.homeKnown !== null ? { homeCooldownKnown: seen.homeKnown } : {}), spellbook: seen.spellbook, chronicleCharges: seen.charges, sourceOf: transportSources(player, prices.priceOf),
  }));
  const tip = travelTip(options);
  return tip ? <p className="small status-tip" role="note">💡 {tip}</p> : null;
}
