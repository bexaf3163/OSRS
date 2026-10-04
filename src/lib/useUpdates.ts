// Состояние автообновления для окна: подписка на главный процесс (electron/updater.cjs). Без программы для ПК — null.

import { useCallback, useEffect, useState } from 'react';
import { desktop, type UpdateState } from './desktop';

export interface UpdatesApi {
  state: UpdateState;
  check: () => void;
  download: () => void;
  install: () => void;
  setAuto: (on: boolean) => void;
}

/** Состояние обновления и действия; null — в браузере и в старой сборке обновлений нет. */
export function useUpdates(): UpdatesApi | null {
  const api = desktop()?.updates;
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!api) return undefined;
    let alive = true;
    void api.get().then((s) => { if (alive) setState(s); }).catch(() => undefined);
    const off = api.onState((s) => setState((prev) => ({ ...s, auto: prev?.auto })));
    return () => { alive = false; off(); };
  }, [api]);
  const check = useCallback(() => { void api?.check().then(setState).catch(() => undefined); }, [api]);
  const download = useCallback(() => { void api?.download().then(setState).catch(() => undefined); }, [api]);
  const install = useCallback(() => { void api?.install(); }, [api]);
  const setAuto = useCallback((on: boolean) => {
    api?.setAuto(on);
    setState((s) => (s ? { ...s, auto: on } : s));
  }, [api]);
  return api && state ? { state, check, download, install, setAuto } : null;
}

/** Сколько процентов скачано — целым числом. */
export function percent(p: number): number {
  return Math.max(0, Math.min(100, Math.round((Number.isFinite(p) ? p : 0) * 100)));
}
