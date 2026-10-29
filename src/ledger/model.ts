// View-models of the Ledger. Components are presentational: adapters (./adapters.ts) map store / readiness / bridge data onto these.
import type { IconName } from './icons';

export type StepState = 'done' | 'current' | 'todo' | 'locked';
export type StepKind = 'quest' | 'skill' | 'task';

export interface RouteStep {
  id: string;
  name: string;
  kind: StepKind;
  qp: number;
  state: StepState;
  /** The step the player has open on the right page. */
  selected?: boolean;
  /** Shown on locked rows, e.g. "Herblore 10 · Thieving 25". */
  lock?: string;
}

export interface RouteStage {
  /** The label in the diamond (a Roman numeral). */
  id: string;
  /** The stage number: what unrolling and folding are keyed by. */
  key: string;
  name: string;
  members?: boolean;
  steps: RouteStep[];
}

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
  { section: 'path', href: '#/', label: 'Journey', icon: 'compass' },
  { section: 'skills', href: '#/skills', label: 'Skills', icon: 'star' },
  { section: 'journal', href: '#/journal', label: 'Journal', icon: 'book' },
  { section: 'gear', href: '#/gear', label: 'Gear', icon: 'shield' },
  { section: 'shopping', href: '#/shopping', label: 'Shopping', icon: 'cart' },
  { section: 'money', href: '#/money', label: 'Money', icon: 'coin' },
];
