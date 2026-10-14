// The preparation plan — into the game (protocol 6). The app computes it for the "What you need" card (prepPlan.ts); the same plan
// goes to the plugin in the shared snapshot, and it draws the readiness percent, "do not take now", the recovery mode, advice about weight
// and the bag next to its live item list. It draws nothing; with a protocol below 6 it does nothing.

import { useEffect, useRef, useState } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { isClosed, openAfter } from '../lib/next-step';
import { useReadinessEngine } from '../readinessContext';
import { usePlayerState } from '../playerStateContext';
import { planPayload } from '../lib/prepEnvelope';
import { checkStatus, supportsSnapshot } from '../services/runeliteBridge';
import { useUpgradeRecommendation } from './UpgradePrompt';
import type { Step } from '../types';
import { procurementDetour, type Detour } from '../lib/detours';
import { fairyRingsUnlocked, transportKey, travelInputOf } from '../lib/travelInput';
import { decideTransport, publishTransport, transportSources, transportTarget } from '../lib/liveTransport';
import type { RecommendedTransport } from '../lib/transport';

/** How often the position is read for the purchase detour: the text is rounded, so the snapshot does not change on every step. */
const DETOUR_POLL_MS = 15_000;
/** How long the landing tile of a teleport stands in for the position: long enough for the status to catch up, short enough that walking on is not ignored. */
const FRESH_MOVE_MS = 4_000;

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
  const { setPrepPart, stats, gear, owned, moves, questInstruction } = useBridge();
  const { progress, mode, steps } = useStore();
  const { prices } = usePlayerState();
  const profile = styleOf(useFeatures());
  const upgrade = useUpgradeRecommendation(step);
  const engine = useReadinessEngine();
  const plan = engine.plan(step, { ahead: profile.lookAhead, upgrade });
  // A purchase or pick-up worth a stop on the way: judged by where the player is now, read every few seconds, not on every tick.
  const [detour, setDetour] = useState<Detour | null>(null);
  const [transport, setTransport] = useState<RecommendedTransport | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const nextStep = openAfter(steps, progress, step.id) ?? null;
  const bagRef = useRef({ levels: progress.levels, stats, gear, owned, mode, fairyRings: fairyRingsUnlocked(progress), state: engine.ctx.state, priceOf: prices.priceOf, questInstruction, nextStep });
  bagRef.current = { levels: progress.levels, stats, gear, owned, mode, fairyRings: fairyRingsUnlocked(progress), state: engine.ctx.state, priceOf: prices.priceOf, questInstruction, nextStep };
  // The objective: the quest line the game confirms (never a temporary arrow), otherwise the step's own place.
  const to = transportTarget(step, questInstruction)?.point;
  // A teleport or a boat ride is a jump: the way is judged again at once from where the player landed, not at the next poll.
  const lastMove = moves[moves.length - 1];
  const lastMoveAt = lastMove?.at ?? 0;
  const lastMoveRef = useRef(lastMove);
  lastMoveRef.current = lastMove;
  const coins = engine.ctx.state.coins.bag.known ? engine.ctx.state.coins.bag.value : null;
  // What the ways need changed in the bag or the bank (runes bought, a tablet withdrawn): judged again at once, not at the next poll.
  const things = transportKey(gear, owned);
  useEffect(() => {
    let dead = false;
    const run = async () => {
      // The landing tile of a jump seen a moment ago is the position (the status call may not have caught up yet); otherwise ask the game.
      const m = lastMoveRef.current;
      const landed = m && m.to && Date.now() - m.at < FRESH_MOVE_MS ? m.to : null;
      const st = await checkStatus();
      if (dead) return;
      const live = st.online && st.inGame;
      const pos = landed ?? (live ? st.pos : null);
      const b = bagRef.current;
      const decision = decideTransport({
        step, pos, instruction: b.questInstruction, nextStep: b.nextStep,
        levels: b.levels, stats: b.stats, gear: b.gear, owned: b.owned, mode: b.mode, fairyRings: b.fairyRings, priceOf: b.priceOf,
        homeCooldownSec: live ? st.homeTeleportSeconds : null,
        // An older plugin does not say whether the Home Teleport is ready: then it is as before (ready unless it reports a cooldown).
        ...(live && st.homeTeleportKnown !== null ? { homeCooldownKnown: st.homeTeleportKnown } : {}),
        ...(live ? { spellbook: st.spellbook } : {}),
        sourceOf: transportSources(b.state, b.priceOf),
      });
      publishTransport(decision);
      setTransport(decision.recommended);
      const at = decision.to;
      if (!pos || !at || decision.skipped) { setDetour(null); return; }
      // The bag and the levels: a teleport that is ready shortens the way to the stop.
      const t = travelInputOf({ from: pos, to: at, levels: b.levels, stats: b.stats, gear: b.gear, owned: b.owned, mode: b.mode, fairyRings: b.fairyRings });
      setDetour(procurementDetour({ plan: planRef.current, stepId: step.id, from: pos, to: at, coins, travel: t }));
    };
    void run();
    const t = window.setInterval(() => void run(), DETOUR_POLL_MS);
    return () => { dead = true; window.clearInterval(t); };
    // The plan is read from a ref when the timer fires: a new plan object on every render must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, to?.x, to?.y, to?.plane, plan.now.length, plan.soon.length, coins, lastMoveAt, things, mode, nextStep?.id]);
  // The step left the game: its decision is not the current one any more.
  useEffect(() => () => publishTransport(null), [step.id]);
  const payload = planPayload(plan, { detour, transport });
  const key = JSON.stringify(payload);
  useEffect(() => {
    setPrepPart('plan', payload);
    // payload is recomputed on every render — we watch the content through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPrepPart]);
  return null;
}
