// Sending the step shown in the game, the auto-mark from the game, and what follows a mark.

import { useCallback, useEffect, useRef } from 'react';
import type { Step, StepBranch } from '../types';
import { gateAllows } from '../domain/persistence/profiles';
import { guardedProfileGate as profileGate, readProfiles } from './profiles';
import { clearActiveStep, supportsSnapshot, syncActiveStep } from '../services/runeliteBridge';
import { autoCompletes, toInGameTarget } from '../domain/guide/inGameTarget';
import { preflightItems } from '../domain/prep/stepItems';
import { doseKind } from '../domain/items/doseKind';
import { roadFrom, tripWindow } from '../domain/prep/oneTrip';
import { usePlanWindow } from './decision';
import { isClosed } from '../domain/quests/next-step';
import { stepResendKey } from '../domain/combat/foodPlan';
import { withKillEstimate } from '../domain/combat/gearAdvisor';
import { transportWatch } from '../domain/travel/travelInput';
import { ACTIVE_KEY, BRANCH_KEY, chosenBranch, saveJson, type BridgeCore } from './bridgeCore';
import type { useSnapshot } from './bridgeSnapshot';
import type { PointResult } from './bridgeValue';

/** Sending the step into the game and taking it out, and the auto-mark from the game. */
export function useStepSending({ activeStepId, setAdvance, liveIdentity, sessionEpoch, pluginProtocol, snapshot, latest, handled }: BridgeCore, { flushSnapshot }: ReturnType<typeof useSnapshot>) {
  const nonce = useRef(0);
  // The items of the planner's next steps, never the guide's next ones (2.82.2); read at send time.
  const planWindow = usePlanWindow();
  const plan = useRef(planWindow);
  plan.current = planWindow;

  /** A step into the game. For a combat step — with a first time estimate per opponent by the current weapon and levels. */
  const sendStep = useCallback(async (step: Step, branch?: StepBranch): Promise<boolean> => {
    if (!gateAllows(profileGate(readProfiles(), liveIdentity.current.player))) return false;
    const epoch = sessionEpoch.current;
    const { progress: p, stats: live, gear: g } = latest.current;
    // The items of the current and the nearest steps — the plugin counts them in advance: "one trip" knows what is already there.
    // Potions the window recommends are counted too (every size, in doses): Shopping's optional rows and the trip read them.
    const ahead = tripWindow(roadFrom(plan.current, step), p, step).slice(1).flatMap((s) => [
      ...preflightItems(s).map((i) => i.nameEn), ...(s.itemsRecommended ?? []).filter((i) => doseKind(i.nameEn)).map((i) => i.nameEn),
    ]);
    const target = withKillEstimate(step, { ...p.levels, ...(live ?? {}) }, g);
    if (!supportsSnapshot(pluginProtocol.current)) {
      const ok = await syncActiveStep(target, undefined, branch, ahead);
      return epoch === sessionEpoch.current && ok;
    }
    // What the ways to the step need is counted too: the planner says "withdraw it" only for what the bank is known to hold.
    const payload = toInGameTarget(target, branch, ahead, transportWatch(latest.current.mode));
    if (!payload) return false;
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, step: payload };
    sn.synced = true;
    return flushSnapshot(['step', 'skillPath']);
  }, [flushSnapshot]);

  /** Remove the step in the game: with a snapshot — as part of it, otherwise — by a separate request. */
  const clearStep = useCallback(async (): Promise<void> => {
    if (!supportsSnapshot(pluginProtocol.current)) { await clearActiveStep(); return; }
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, step: null, plan: null };
    sn.synced = true;
    await flushSnapshot();
  }, [flushSnapshot]);

  const onCompleted = useCallback((id: string) => {
    const { progress: p, steps: list, setStep: mark } = latest.current;
    // The game has a different character than this profile — its quests and levels are not written here.
    if (liveIdentity.current.inGame === false || !gateAllows(profileGate(readProfiles(), liveIdentity.current.player))) return;
    const marks = autoCompletes(list, p, id, handled.current);
    handled.current.add(id);
    if (!marks) return;
    mark(id, 'done', `RuneLite: ${id} done in the game`);
    setAdvance({ from: id, nonce: ++nonce.current });
  }, []);

  useEffect(() => {
    try {
      if (activeStepId) localStorage.setItem(ACTIVE_KEY, activeStepId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Storage is unavailable — the step simply will not return after a restart.
    }
  }, [activeStepId]);
  return { sendStep, clearStep, onCompleted };
}

/** The next step after a mark, a step sent again when its method or plan changes, and the choices from the pages. */
export function useStepFollow({ steps, activeStepId, setActiveStepId, setBranchChoice, sessionEpoch, stepIntent, latest, handled }: BridgeCore, { sendStep, clearStep }: ReturnType<typeof useStepSending>) {
  // A step that follows a training method asks for different tools, and leads to another place, when the level (or what is carried) moves the player to
  // another method: the game gets the new list and place without a press. The first sight of a step is not a change: whoever activated it sent it.
  const shown = activeStepId ? steps.find((s) => s.id === activeStepId) : undefined;
  const followKey = shown?.followsMethod
    ? JSON.stringify([shown.itemsRequired?.map((i) => [i.nameEn, i.amount]), shown.mapLocation && [shown.mapLocation.x, shown.mapLocation.y, shown.mapLocation.plane]])
    : null;
  const sentFollow = useRef<string | null>(null);
  useEffect(() => {
    if (!shown || followKey === null) { sentFollow.current = null; return; }
    const key = `${shown.id}:${followKey}`;
    const before = sentFollow.current;
    sentFollow.current = key;
    if (before === null || before === key || !before.startsWith(`${shown.id}:`)) return;
    if (isClosed(latest.current.progress, shown.id)) return;
    void sendStep(shown, chosenBranch(shown, latest.current.branchChoice));
  }, [shown, followKey, sendStep]);

  // An adopted combat plan moves the step to another opponent and place (and back): the game gets the new target and pace line without a press. The key is
  // the plan and its phase and whether the food plan has settled, not the food figures (lib/foodPlan.ts stepResendKey).
  const planKeyNow = shown ? stepResendKey(shown) : null;
  const sentPlan = useRef<string | null>(null);
  useEffect(() => {
    if (!shown || planKeyNow === null) { sentPlan.current = null; return; }
    const before = sentPlan.current;
    const key = `${shown.id}:${planKeyNow}`;
    sentPlan.current = key;
    // The first sight of a step is not a change: whoever activated it sent it.
    if (before === null || before === key || !before.startsWith(`${shown.id}:`)) return;
    if (isClosed(latest.current.progress, shown.id)) return;
    void sendStep(shown, chosenBranch(shown, latest.current.branchChoice));
  }, [shown, planKeyNow, sendStep]);

  const pointInGame = useCallback(async (step: Step): Promise<PointResult> => {
    const branch = chosenBranch(step, latest.current.branchChoice);
    if (!toInGameTarget(step, branch)) return 'empty';
    const intent = ++stepIntent.current;
    const ok = await sendStep(step, branch);
    if (!ok || intent !== stepIntent.current) return 'offline';
    // The step is in the game again — its new auto-mark must work even if there already was one earlier.
    handled.current.delete(step.id);
    setActiveStepId(step.id);
    return 'ok';
  }, [sendStep]);

  const clear = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const intent = ++stepIntent.current;
    await clearStep();
    if (epoch === sessionEpoch.current && intent === stepIntent.current) setActiveStepId(null);
  }, [clearStep]);

  const chooseBranch = useCallback((step: Step, branchId: string | null) => {
    setBranchChoice((prev) => {
      const next = { ...prev };
      if (branchId) next[step.id] = branchId;
      else delete next[step.id];
      saveJson(BRANCH_KEY, next);
      latest.current.branchChoice = next;
      return next;
    });
    // The step is already shown in the game — we update the target at once, without a repeated press.
    if (latest.current.activeStepId === step.id) {
      const branch = branchId ? step.branches?.find((b) => b.id === branchId) : undefined;
      void sendStep(step, branch);
    }
  }, [sendStep]);
  return { pointInGame, clear, chooseBranch };
}
