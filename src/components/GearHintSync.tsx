// Gear advice — into the game (POST /gear-hint). The HUD line ("⚡ Stronger: Steel scimitar from Zeke…") and the highlight
// in the bag and bank — only while an unfinished combat step is shown in the game and its advice is not skipped. Which items to
// ask the bank about — always while there is a link: the "Gear" page learns from them what lies in the bank.
// Sent on change and after reconnecting; if the feature is turned off — it is cleared. It draws nothing.
// Protocol 6: the advice is part of the shared snapshot (bridge.setPrepPart), there is no separate request.

import { useEffect, useRef } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { useFeatures } from '../lib/features';
import { isClosed } from '../lib/next-step';
import { useGearAdvice } from '../lib/gearAdvice';
import { hudHint, watchNames } from '../services/gearAdvisor';
import { setGearHint, supportsSnapshot, type GearHintPayload } from '../services/runeliteBridge';

export function GearHintSync() {
  const { state, activeStepId, plugin, setPrepPart } = useBridge();
  const snapshot = supportsSnapshot(plugin?.protocol ?? null);
  const { steps, progress } = useStore();
  const { upgradeRouter } = useFeatures();
  const step = activeStepId ? steps.find((s) => s.id === activeStepId) ?? null : null;
  const { advice, input } = useGearAdvice(step);
  /** What is already in the plugin on this connection; null — nothing. */
  const sent = useRef<string | null>(null);
  /** An old plugin does not know /gear-hint — we do not ask until it reconnects. */
  const old = useRef(false);

  const fighting = Boolean(step?.foes?.length) && !isClosed(progress, step!.id) && !(progress.upgradeDismissedForSteps ?? []).includes(step!.id);
  const top = advice.actions[0];
  const payload: GearHintPayload | null = upgradeRouter
    ? {
      ...(fighting && top ? { text: hudHint(top) } : {}),
      watchItems: watchNames(input),
      highlightItems: fighting ? advice.actions.filter((a) => a.how === 'wear').map((a) => a.item.name) : [],
    }
    : null;
  const key = `${snapshot ? 'v6' : 'v5'}|${JSON.stringify(payload)}`;

  useEffect(() => {
    if (state !== 'online') {
      // RuneLite was closed or restarted — the advice is gone there, we will send it again after connecting.
      sent.current = null;
      old.current = false;
      return;
    }
    if (snapshot) {
      // A single snapshot: an empty value is part of the snapshot too — "no advice". Dedup and delay are kept by the bridge itself.
      if (key !== sent.current) {
        sent.current = key;
        setPrepPart('gearHint', payload);
      }
      return;
    }
    if (old.current || key === sent.current || (payload === null && sent.current === null)) return;
    // Levels and the bag change through an event queue — we send when everything has settled.
    const timer = setTimeout(() => {
      sent.current = key;
      void setGearHint(payload).then((r) => {
        if (r === 'old') old.current = true;
        else if (r === 'offline') sent.current = null;
      });
    }, 300);
    return () => clearTimeout(timer);
    // payload is recomputed on every render — we watch its content through key.
  }, [state, key, snapshot, setPrepPart]);

  return null;
}
