import { useEffect, useState } from 'react';
import { MAP_METADATA_URL, parseMapSources, type MapTileSource } from './map';

let pending: Promise<MapTileSource[]> | undefined;
function loadSources(): Promise<MapTileSource[]> {
  // One shared request per session. A bad/unreachable manifest never prevents navigation.
  return pending ??= fetch(MAP_METADATA_URL, { signal: AbortSignal.timeout(15000) })
    .then((r) => r.ok ? r.json() : null).then(parseMapSources).catch(() => []);
}

export function useMapSources(retry = 0): readonly MapTileSource[] {
  const [sources, setSources] = useState<MapTileSource[]>([]);
  useEffect(() => {
    let active = true;
    if (retry) pending = undefined;
    void loadSources().then((result) => { if (active) setSources(result); });
    return () => { active = false; };
  }, [retry]);
  return sources;
}
