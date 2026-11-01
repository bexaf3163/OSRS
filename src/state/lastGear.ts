// The last known gear of every character seen, shown while RuneLite is closed.

import { useEffect, useMemo, useState } from 'react';
import type { GearState } from '../services/runeliteBridge';
import { parseGear } from '../services/bridgeEvents';
import { STORAGE_KEYS } from '../domain/persistence/storageKeys';
import { loadJson, saveJson } from './bridgeCore';

const GEAR_KEY = STORAGE_KEYS.lastGear;

/** A gear snapshot for showing without a link: whose, when recorded and what there was then. */
export interface LastGear {
  at: number;
  player: string;
  gear: GearState;
}

/** Read with distrust: the storage is edited by hand and by other versions. Garbage — as if nothing had been written. */
export function parseLastGear(raw: unknown): LastGear | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const gear = parseGear(o.gear);
  if (!gear || typeof o.at !== 'number' || !Number.isFinite(o.at) || o.at <= 0 || typeof o.player !== 'string' || !o.player || o.player.length > 40) return null;
  return { at: o.at, player: o.player, gear };
}

/** The stored snapshots: the map by character (2.68), or the single one an older version wrote. */
export function parseLastGears(raw: unknown): Record<string, LastGear> {
  const out: Record<string, LastGear> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const by = (raw as { byPlayer?: unknown }).byPlayer;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    for (const v of Object.values(by as Record<string, unknown>).slice(0, 20)) {
      const g = parseLastGear(v);
      if (g) out[g.player.toLowerCase()] = g;
    }
    return out;
  }
  const one = parseLastGear(raw);
  if (one) out[one.player.toLowerCase()] = one;
  return out;
}

function loadLastGears(): Record<string, LastGear> {
  return parseLastGears(loadJson<Record<string, unknown>>(GEAR_KEY, null));
}

/** The most recent snapshot of all. */
export function newestGear(all: Record<string, LastGear>): LastGear | null {
  return Object.values(all).reduce<LastGear | null>((a, g) => (!a || g.at > a.at ? g : a), null);
}

/** The gear snapshots by character, saved as the game reports gear, and the newest of them. */
export function useLastGears(gear: GearState | null, player: string | null) {
  const [lastGears, setLastGears] = useState<Record<string, LastGear>>(loadLastGears);
  const lastGear = useMemo(() => newestGear(lastGears), [lastGears]);

  // The bag, the worn items and the coins are remembered while the game is running: if RuneLite or the app is closed, the last known stays.
  useEffect(() => {
    if (!gear || !player) return undefined;
    const t = setTimeout(() => {
      const saved: LastGear = { at: Date.now(), player, gear };
      setLastGears((all) => {
        const next = { ...all, [player.toLowerCase()]: saved };
        saveJson(GEAR_KEY, { byPlayer: next });
        return next;
      });
    }, 2000);
    return () => clearTimeout(t);
  }, [gear, player]);
  return { lastGear, lastGears };
}
