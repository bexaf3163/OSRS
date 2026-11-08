// The state snapshot for the game (protocol 6), which carries the step, the bulk list, the bank highlight, the advice and the plan in one message.

import { useCallback, useEffect, useRef } from 'react';
import type { Step } from '../types';
import { gateAllows } from '../domain/persistence/profiles';
import { guardedProfileGate as profileGate, readProfiles } from './profiles';
import { postPrepPlan, snapshotAccepted, supportsSnapshot, syncBankTags, syncShoppingPlan, type ShoppingPlanPayload } from '../services/runeliteBridge';
import { toInGameTarget } from '../domain/guide/inGameTarget';
import { stageBankItemIds } from '../domain/prep/bankTags';
import { buildEnvelope, envelopeKey, nextSeq, type SnapshotParts } from '../domain/prep/prepEnvelope';
import type { SkillPathPayload } from '../domain/training/skillGuide';
import { PLAN_KEY, saveJson, type BridgeCore } from './bridgeCore';
import { clipText } from '../domain/text/format';

/** Sending the snapshot, and setting its parts. */
export function useSnapshot({ liveIdentity, sessionEpoch, pluginProtocol, snapshot, latest }: BridgeCore) {
  const rejectedSnapshotKey = useRef<string | null>(null);

  /** Send the snapshot now. true — the plugin received it (or already had the same). */
  const flushSnapshot = useCallback(async (requiredParts?: readonly string[]): Promise<boolean> => {
    if (!gateAllows(profileGate(readProfiles(), liveIdentity.current.player))) return false;
    const epoch = sessionEpoch.current;
    const sn = snapshot.current;
    if (sn.timer) { clearTimeout(sn.timer); sn.timer = null; }
    const key = envelopeKey(sn.parts);
    if (key === sn.sentKey) return true;
    const seq = nextSeq(sn.seq);
    sn.seq = seq;
    const r = await postPrepPlan(buildEnvelope(sn.parts, seq));
    if (epoch !== sessionEpoch.current) return false;
    if (!snapshotAccepted(r)) {
      if (sn.seq === seq) {
        sn.sentKey = null;
        const reason = r.status === 413 ? 'The game guide could not sync: its data exceeds the bridge size limit. Your game connection is still being checked normally.'
          : r.stale ? 'RuneLite ignored an outdated guide update. The new guide is not confirmed; retry after reconnecting.'
            : Object.keys(r.rejected).length ? `RuneLite did not fully accept the guide: ${clipText(Object.values(r.rejected)[0], 120)}. Check OSRS Path Bridge settings.` : null;
        const failureKey = reason;
        if (reason && rejectedSnapshotKey.current !== failureKey) {
          rejectedSnapshotKey.current = failureKey;
          latest.current.notify(reason);
        }
      }
      return snapshotAccepted(r, requiredParts);
    }
    rejectedSnapshotKey.current = null;
    // The answer of a late snapshot must not overwrite what was sent after it.
    if (sn.seq === seq) sn.sentKey = key;
    return true;
  }, []);

  const setPrepPart = useCallback(<K extends 'gearHint' | 'bankTags' | 'plan' | 'cleanup' | 'funding' | 'decision'>(key: K, value: SnapshotParts[K]) => {
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, [key]: value };
    if (!supportsSnapshot(pluginProtocol.current) || !sn.synced) return;
    // The bag and levels change through an event queue — we send when everything has settled.
    if (sn.timer) clearTimeout(sn.timer);
    sn.timer = setTimeout(() => { sn.timer = null; void flushSnapshot(); }, 350);
  }, [flushSnapshot]);

  const setSkillPath = useCallback((value: SkillPathPayload | null) => {
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, skillPath: value };
    if (!supportsSnapshot(pluginProtocol.current)) return;
    // With a path in the snapshot the plugin ignores the quest step, so the snapshot may go before the app knows its step; clearing waits for a synced one.
    if (value) sn.synced = true;
    else if (!sn.synced) return;
    if (sn.timer) clearTimeout(sn.timer);
    sn.timer = setTimeout(() => { sn.timer = null; void flushSnapshot(); }, 350);
  }, [flushSnapshot]);

  const setTrainingStep = useCallback((value: Step | null) => {
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, trainingStep: value ? toInGameTarget(value) : undefined };
    if (!supportsSnapshot(pluginProtocol.current)) return;
    if (value) sn.synced = true;
    else if (!sn.synced) return;
    if (sn.timer) clearTimeout(sn.timer);
    sn.timer = setTimeout(() => { sn.timer = null; void flushSnapshot(); }, 350);
  }, [flushSnapshot]);

  const syncPlan = useCallback(async (plan: ShoppingPlanPayload) => {
    saveJson(PLAN_KEY, plan);
    if (!supportsSnapshot(pluginProtocol.current)) return syncShoppingPlan(plan);
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, shopping: plan };
    // The step in the snapshot is not known yet (the app has just started) — the snapshot goes when it is; the list is saved.
    return sn.synced ? flushSnapshot(['shopping']) : true;
  }, [flushSnapshot]);
  return { flushSnapshot, setPrepPart, setSkillPath, setTrainingStep, syncPlan };
}

/** The bank highlight of the shown step's stage. */
export function useBankTags({ steps, mode, state, activeStepId, plugin, features, bankSent }: BridgeCore, { setPrepPart }: ReturnType<typeof useSnapshot>) {
  // The items of the stage of the step shown in the game — to the plugin, for a soft highlight in the bank.
  // They go on a step (and stage) change, after a reconnect and when the feature is turned on; turned off — the highlight is removed.
  useEffect(() => {
    if (state !== 'online') return;
    const step = activeStepId ? steps.find((s) => s.id === activeStepId) : undefined;
    const ids = features.bankTags && step ? stageBankItemIds(step.stage, mode) : [];
    const snap = supportsSnapshot(plugin?.protocol ?? null);
    const key = `${snap ? 'v6' : 'v5'}|${step?.stage ?? '-'}|${mode}|${ids.join(',')}`;
    if (key === bankSent.current || (!ids.length && !bankSent.current)) return;
    bankSent.current = key;
    if (snap) setPrepPart('bankTags', ids.length ? { stageId: step ? `stage-${step.stage}` : 'none', itemIds: ids } : null);
    else void syncBankTags(step ? `stage-${step.stage}` : 'none', ids);
  }, [state, activeStepId, steps, mode, features.bankTags, plugin?.protocol, setPrepPart]);
}
