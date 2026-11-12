// The Ledger line icon of each readiness state (2.94: no coloured emoji circles), shared by the step status and the readiness panel.
import type { Icon } from '../../../ledger';
import type { ReadinessStatus } from '../../../domain/readiness/readiness';

export type IconName = Parameters<typeof Icon>[0]['name'];

export const STATUS_ICON: Record<ReadinessStatus, IconName> = {
  READY: 'check', MINOR_PREP: 'wrench', MISSING_ITEM: 'bag', MISSING_MONEY: 'coin', MISSING_STATS: 'bolt',
  MISSING_QUEST: 'scroll', BLOCKED: 'lock', UNKNOWN: 'eye',
};
