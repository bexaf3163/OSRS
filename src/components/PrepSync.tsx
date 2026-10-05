// The preparation plan — into the game (protocol 6). The app computes it for the "What you need" card (prepPlan.ts); the same plan
// goes to the plugin in the shared snapshot, and it draws the readiness percent, "do not take now", the recovery mode, advice about weight
// and the bag next to its live item list. It draws nothing; with a protocol below 6 it does nothing.

import { useEffect, useRef, useState } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { isClosed } from '../lib/next-step';
import { useReadinessEngine } from '../readinessContext';
import { planPayload } from '../lib/prepEnvelope';
import { supportsSnapshot } from '../services/runeliteBridge';
import { useUpgradeRecommendation } from './UpgradePrompt';
import type { Step } from '../types';
import { procurementDetour, type Detour } from '../lib/detours';
import { stepPlaces } from '../lib/stepPlaces';
import { travelInputOf } from '../lib/travelInput';
import { travelOptions } from '../lib/travel';
import { recommendedTransport, type RecommendedTransport } from '../lib/transport';

/** How often the position is read for the purchase detour: the text is rounded, so the snapshot does not change on every step. */
const DETOUR_POLL_MS = 15_000;

export function PrepSync() {
  const { state, activeStepId, plugin, setPrepPart } = useBridge();
  const { steps, progress } = useStore();
  const step = activeStepId ? steps.find((s) => s.id === activeStepId) ?? null : null;
  const live = state === 'online' && supportsSnapshot(plugin?.protocol ?? null);
  const open = Boolean(step) && !isClosed(progress, step!.id);

  // There is no step in the game, the step is closed or the plugin is old — there is no plan in the snapshot.
  useEffect(() => {
    if (live && !open) setPrepPart('plan', null);
  }, [live, open, setPrepPart]);

  return live && step && open ? <StepPlan step={step} /> : null;
}

function StepPlan({ step }: { step: Step }) {
  const { setPrepPart, locate, stats, gear, owned } = useBridge();
  const { progress, mode } = useStore();
  const profile = styleOf(useFeatures());
  const upgrade = useUpgradeRecommendation(step);
  const engine = useReadinessEngine();
  const plan = engine.plan(step, { ahead: profile.lookAhead, upgrade });
  // A purchase or pick-up worth a stop on the way: judged by where the player is now, read every few seconds, not on every tick.
  const [detour, setDetour] = useState<Detour | null>(null);
  const [transport, setTransport] = useState<RecommendedTransport | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const bagRef = useRef({ levels: progress.levels, stats, gear, owned, mode });
  bagRef.current = { levels: progress.levels, stats, gear, owned, mode };
  const to = stepPlaces(step)[0];
  const coins = engine.ctx.state.coins.bag.known ? engine.ctx.state.coins.bag.value : null;
  useEffect(() => {
    let dead = false;
    const run = async () => {
      const pos = await locate();
      if (dead) return;
      if (!pos || !to || pos.plane !== 0 || to.plane !== 0) { setDetour(null); setTransport(null); return; }
      // The bag and the levels: a teleport that is ready shortens the way to the stop.
      const t = travelInputOf({ from: pos, to, ...bagRef.current });
      setDetour(procurementDetour({ plan: planRef.current, stepId: step.id, from: pos, to, coins, travel: t }));
      setTransport(recommendedTransport(travelOptions(t)));
    };
    void run();
    const t = window.setInterval(() => void run(), DETOUR_POLL_MS);
    return () => { dead = true; window.clearInterval(t); };
    // The plan is read from a ref when the timer fires: a new plan object on every render must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, locate, to?.x, to?.y, plan.now.length, plan.soon.length, coins]);
  const payload = planPayload(plan, { detour, transport });
  const key = JSON.stringify(payload);
  useEffect(() => {
    setPrepPart('plan', payload);
    // payload is recomputed on every render — we watch the content through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPrepPart]);
  return null;
}
