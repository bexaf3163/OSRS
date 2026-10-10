// A one-line "fastest way" tip under the step status: asks the plugin where you are once per step (a local request), and only if a way is clearly
// shorter than walking says so. The full list with the needs and buttons is in the "How to get there" card (Route and game).

import { useEffect, useMemo, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { checkStatus } from '../services/runeliteBridge';
import { stepPlaces } from '../lib/stepPlaces';
import { travelOptions, type Point } from '../lib/travel';
import { fairyRingsUnlocked, travelInputOf } from '../lib/travelInput';
import { travelTip } from '../lib/tips';

export function TravelTip({ step }: { step: Step }) {
  const { progress, mode } = useStore();
  const { enabled, state, inGame, stats, gear, owned } = useBridge();
  const { prices } = usePlayerState();
  const places = useMemo(() => stepPlaces(step), [step]);
  const [seen, setSeen] = useState<{ stepId: string; pos: Point | null; homeCooldown: number | null } | null>(null);
  const live = enabled && state === 'online' && inGame;

  // One local request per step view: the tip is for where you stood when the step opened.
  useEffect(() => {
    if (!live || !places.length) return;
    let dead = false;
    void checkStatus().then((st) => {
      if (!dead) setSeen({ stepId: step.id, pos: st.online && st.inGame ? st.pos : null, homeCooldown: st.homeTeleportSeconds });
    });
    return () => { dead = true; };
  }, [live, step.id, places.length]);

  if (!live || !places.length || !seen || seen.stepId !== step.id || !seen.pos || seen.pos.plane !== 0 || places[0].plane !== 0) return null;
  const options = travelOptions(travelInputOf({
    from: seen.pos, to: places[0], levels: progress.levels, stats, gear, owned, priceOf: prices.priceOf, mode, homeCooldownSec: seen.homeCooldown, fairyRings: fairyRingsUnlocked(progress),
  }));
  const tip = travelTip(options);
  return tip ? <p className="small status-tip" role="note">💡 {tip}</p> : null;
}
