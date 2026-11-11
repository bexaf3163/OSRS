// The auto-update state for the window: a subscription to the main process (electron/updater.cjs). Without the desktop app — null.

import { useCallback, useEffect, useState } from 'react';
import { desktop, type UpdateState } from '../../services/desktop';

export interface UpdatesApi {
  state: UpdateState;
  check: () => void;
  download: () => void;
  /** null: this shell cannot cancel a download. */
  cancel: (() => void) | null;
  install: () => void;
}

/** The update state and actions; null — there are no updates in the browser or in an old build. */
export function useUpdates(): UpdatesApi | null {
  const api = desktop()?.updates;
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!api) return undefined;
    let alive = true;
    void api.get().then((s) => { if (alive) setState(s); }).catch(() => undefined);
    const off = api.onState(setState);
    return () => { alive = false; off(); };
  }, [api]);
  const check = useCallback(() => { void api?.check().then(setState).catch(() => undefined); }, [api]);
  const download = useCallback(() => { void api?.download().then(setState).catch(() => undefined); }, [api]);
  const cancelDownload = useCallback(() => { void api?.cancel?.().then(setState).catch(() => undefined); }, [api]);
  const cancel = api?.cancel ? cancelDownload : null;
  const install = useCallback(() => { void api?.install(); }, [api]);
  return api && state ? { state, check, download, cancel, install } : null;
}

/** How many percent are downloaded — as a whole number. */
export function percent(p: number): number {
  return Math.max(0, Math.min(100, Math.round((Number.isFinite(p) ? p : 0) * 100)));
}
