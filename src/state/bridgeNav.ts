// The temporary target, a place or a shop that the arrow in the game leads to instead of the step.

import { useCallback, useState } from 'react';
import { gateAllows } from '../domain/persistence/profiles';
import { guardedProfileGate as profileGate, readProfiles } from './profiles';
import { clearNavTarget, setNavTarget, type BridgeEvent, type NavTargetPayload } from '../services/runeliteBridge';
import { chosenBranch, type BridgeCore } from './bridgeCore';
import type { useStepSending } from './bridgeSteps';

/** The temporary target as the plugin reports it, set from the app and cleared in the game. */
export function useNavTarget({ enabled, liveIdentity, sessionEpoch, setNavTargetState, navSeq, pluginProtocol, latest }: BridgeCore, { sendStep }: ReturnType<typeof useStepSending>) {
  const setNavFromPlugin = useCallback((t: NavTargetPayload | null) => {
    navSeq.current++;
    setNavTargetState(t);
  }, []);

  /** The temporary target was cleared in the game: the player reached the place, got the item or it was cleared. The step leads the arrow again. */
  const onNavDone = useCallback((e: BridgeEvent) => {
    const { reason, label, itemName } = e as { reason?: unknown; label?: unknown; itemName?: unknown };
    setNavFromPlugin(null);
    const say = latest.current.notify;
    if (reason === 'obtained') say(`✓ ${typeof itemName === 'string' ? itemName : 'The item'} obtained — the arrow leads to the step again`);
    else if (reason === 'arrived') say(`📍 You are there${typeof label === 'string' ? `: ${label}` : ''} — the arrow leads to the step again`);
    // The step anew — the HUD and the target in the game are exactly the same as before the detour.
    const { activeStepId: active, steps: list, branchChoice: choice } = latest.current;
    const step = active ? list.find((s) => s.id === active) : undefined;
    if (step && reason !== 'cleared') void sendStep(step, chosenBranch(step, choice));
  }, [sendStep, setNavFromPlugin]);

  const navigate = useCallback(async (target: NavTargetPayload) => {
    if (!enabled) return { ok: false as const, reason: 'off' as const };
    if (!gateAllows(profileGate(readProfiles(), liveIdentity.current.player))) return { ok: false as const, reason: 'refused' as const, message: 'Switch to this character’s profile before setting a game target.' };
    const epoch = sessionEpoch.current;
    const seq = ++navSeq.current;
    const r = await setNavTarget(target);
    if (epoch !== sessionEpoch.current) return { ok: false as const, reason: 'offline' as const };
    // Plugin 2.11+ reports the target itself (NAV_SET) — and clears it if the item is already in the bag (NAV_DONE): setting it here
    // means risking bringing back an already cleared one. An old plugin does not report — then we remember ourselves.
    if (r.ok && seq === navSeq.current && (pluginProtocol.current ?? 0) < 4) setNavTargetState(target);
    return r;
  }, [enabled]);

  const [userClearedAt, setUserClearedAt] = useState(0);
  const clearNav = useCallback(async () => {
    setUserClearedAt(Date.now());
    const epoch = sessionEpoch.current;
    const seq = ++navSeq.current;
    await clearNavTarget();
    if (epoch === sessionEpoch.current && seq === navSeq.current) setNavFromPlugin(null);
  }, [setNavFromPlugin]);

  const releaseNav = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const seq = ++navSeq.current;
    await clearNavTarget();
    if (epoch === sessionEpoch.current && seq === navSeq.current) setNavFromPlugin(null);
  }, [setNavFromPlugin]);
  return { setNavFromPlugin, onNavDone, navigate, clearNav, releaseNav, userClearedAt };
}
