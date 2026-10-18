// The running funding plan - into the game (snapshot part "funding", plugin 2.64.1 and later): one line on the HUD with what to do now and how far it has gone.
// It reads the same FundingView the Preparation panel draws and draws nothing itself; the plugin only shows the line.

import { useEffect, useRef } from 'react';
import { useBridge } from '../bridge';
import { useFunding, useFundingView } from '../fundingContext';
import { fundingHintPayload } from '../lib/fundingHint';
import { supportsSnapshot } from '../services/runeliteBridge';

export function FundingSync() {
  const { state, plugin, player, setPrepPart } = useBridge();
  const { plan } = useFunding();
  const { view } = useFundingView(plan?.sourceStepId ?? '');
  const snapshot = supportsSnapshot(plugin?.protocol ?? null);
  const payload = fundingHintPayload(plan, view, player);
  const key = JSON.stringify(payload);
  /** What the snapshot holds now; null - nothing was put there on this connection. */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (state !== 'online' || !snapshot) {
      sent.current = null;
      return;
    }
    if (key === sent.current) return;
    sent.current = key;
    setPrepPart('funding', payload);
    // payload is described by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, snapshot, key, setPrepPart]);

  return null;
}
