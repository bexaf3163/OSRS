// Inventory cleanup — into the game (snapshot part "cleanup", plugin 2.61.0 and later): the same advice the Shopping page shows, in a few words, for
// the bank, merchant and exchange card and the guide's Advice tab. Only the lines to act on (sell, drop, destroy, review) and only for the
// character logged in now. It draws nothing; the plugin sells, drops and destroys nothing either.

import { useEffect, useRef } from 'react';
import { useBridge } from '../bridge';
import { cleanupHintPayload } from '../lib/cleanupHint';
import { useCleanupAdvice } from '../lib/useCleanupAdvice';
import { supportsSnapshot } from '../services/runeliteBridge';

export function CleanupSync() {
  const { state, plugin, setPrepPart } = useBridge();
  const { result, live, player } = useCleanupAdvice();
  const snapshot = supportsSnapshot(plugin?.protocol ?? null);
  const payload = live ? cleanupHintPayload(result, player) : null;
  const key = JSON.stringify(payload);
  /** What the snapshot holds now; null — nothing was put there on this connection. */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (state !== 'online' || !snapshot) {
      sent.current = null;
      return;
    }
    if (key === sent.current) return;
    sent.current = key;
    setPrepPart('cleanup', payload);
    // payload is described by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, snapshot, key, setPrepPart]);

  return null;
}
