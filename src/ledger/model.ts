// View-models of the Ledger. Components are presentational: adapters (./adapters.ts) map store / readiness / bridge data onto these.
import type { IconName } from './icons';
import { hrefTo } from '../domain/pages/pages';

export interface Player {
  name: string;
  /** null while the levels are not known: no level is shown as 3 or 32. */
  combat: number | null;
  total: number | null;
  qp: number;
  maxQp: number;
  /** 0-100, route progress shown on the ring. */
  progress: number;
}

export type HotbarAction = 'prev' | 'fix' | 'start' | 'game' | 'done' | 'map' | 'skip' | 'remove' | 'next';
export type HotbarHandlers = Partial<Record<HotbarAction, () => void>>;

export const LEDGER_NAV: { section: string; href: string; label: string; icon: IconName }[] = [
  { section: 'path', href: hrefTo.path(), label: 'Journey', icon: 'compass' },
  { section: 'skills', href: hrefTo.skills(), label: 'Skills', icon: 'star' },
  { section: 'journal', href: hrefTo.journal(), label: 'Journal', icon: 'book' },
  { section: 'gear', href: hrefTo.gear(), label: 'Gear', icon: 'shield' },
  { section: 'shopping', href: hrefTo.shopping(), label: 'Shopping', icon: 'cart' },
  { section: 'money', href: hrefTo.money(), label: 'Money', icon: 'coin' },
];
