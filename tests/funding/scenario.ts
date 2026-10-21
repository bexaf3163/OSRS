// A whole funding scenario built the way the app builds it: the player state, the one-trip plan, the preparation plan, the money need, the snapshot and the
// assessment, for a real step of the route. Tests state only what the player has and what the market says; everything else is the production code.

import legacyCollect from '../combatRoute/legacyCollectStep.json';
import { stepsFor } from '../../src/data';
import { gearById } from '../../src/services/gearAdvisor';
import { nameKey, type OwnedItem, type OwnedState } from '../../src/lib/checklist';
import { combatPersonaliser } from '../../src/lib/funding/combatAdapter';
import { assess, type AssessInput, type FundingAssessment } from '../../src/lib/funding/assess';
import { buildNeed, type FundingNeed } from '../../src/lib/funding/need';
import { buildSnapshot, type FundingSnapshot } from '../../src/lib/funding/snapshot';
import type { SurplusRec } from '../../src/lib/funding/budget';
import type { PriceView } from '../../src/lib/funding/quotes';
import type { MethodEvaluation, ObservedRate } from '../../src/lib/funding/evaluate';
import { emptyProgress } from '../../src/lib/progress';
import { buildPlayerState, type PlayerState } from '../../src/lib/playerState';
import { buildPrepPlan, type PrepPlan } from '../../src/lib/prepPlan';
import { planOneTrip, tripWindow } from '../../src/lib/oneTrip';
import { readinessOf } from '../../src/lib/readiness';
import type { Step, WikiItemDetail } from '../../src/types';
import { GE, walk } from './helpers';

const gearId = (n: string) => [...gearById.values()].find((p) => p.name === n)!.id;
const SLOT: Record<string, string> = { Adamant: 'weapon', 'Iron full helm': 'head', 'Iron platebody': 'body', 'Iron plateskirt': 'legs', 'Iron kiteshield': 'shield' };

export interface ScenarioOpts {
  stepId?: string;
  stats?: Record<string, number>;
  xp?: Record<string, number>;
  worn?: string[];
  bagCoins?: number | null;
  bankCoins?: number | null;
  /** name -> [carried, bank]; bank only matters when the bank was seen. */
  items?: Record<string, [number, number]>;
  bankSeen?: boolean;
  quests?: string[];
  questPoints?: number | null;
  totalLevel?: number | null;
  ironman?: boolean | null;
  pos?: { x: number; y: number; plane: number } | null;
  recs?: SurplusRec[];
  activeId?: string | null;
  allowHighEffort?: boolean;
  observed?: ReadonlyMap<string, ObservedRate>;
  train?: 'attack' | 'strength' | 'defence' | null;
  sellOverride?: 'lifted' | 'active';
  /** The item database as the preparation plan sees it (what an item is sold for, what drops it). Absent - nothing is known. */
  detail?: (id: number) => WikiItemDetail | undefined;
}

export const HISTORICAL = {
  stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 },
  xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 },
  worn: ['Adamant scimitar', 'Iron full helm', 'Iron platebody', 'Iron plateskirt', 'Iron kiteshield'],
};

export interface Scenario {
  step: Step;
  state: PlayerState;
  prep: PrepPlan;
  need: FundingNeed;
  snap: FundingSnapshot;
  assessment: FundingAssessment;
  /** The evaluator's context the assessment used, for the Money section's list (moneyList). */
  base: AssessInput['base'];
}

export function scenario(prices: PriceView, o: ScenarioOpts = {}): Scenario {
  const steps = stepsFor('f2p').map(s => s.id === 'S4-03' ? legacyCollect as Step : s);
  const step = steps.find(s => s.id === (o.stepId ?? 'S4-03'))!;
  // The plugin reports every item the route asks about, zero included: a tracked item with nothing is a fact, an untracked one is unknown.
  const tracked = new Set(tripWindow(steps, emptyProgress(), step.id).flatMap((w) => (w.itemsRequired ?? []).map((i) => i.nameEn)));
  const bankSeen = o.bankSeen ?? true;
  const worn = o.worn ?? HISTORICAL.worn;
  // What is worn is reported as carried by the plugin.
  const entries: Record<string, [number, number]> = {
    ...Object.fromEntries([...tracked].map((n) => [n, [worn.includes(n) ? 1 : 0, 0] as [number, number]])),
    ...(o.items ?? {}),
  };
  const owned: OwnedState = {
    bankSeen,
    items: new Map(Object.entries(entries).map(([n, [carried, bank]]): [string, OwnedItem] => [nameKey(n), { name: n, carried, noted: 0, bank: bankSeen ? bank : undefined }])),
  };
  const state = buildPlayerState({
    mode: 'f2p', stats: (o.stats ?? HISTORICAL.stats) as never, progress: { levels: {} }, owned,
    gear: {
      equipment: worn.map((n) => ({ id: gearId(n), name: n, slot: n.includes('scimitar') ? 'weapon' : SLOT[n] ?? 'body' })),
      inventory: [], coins: o.bagCoins === undefined ? 400 : o.bagCoins, bankCoins: o.bankCoins === undefined ? 0 : o.bankCoins,
    },
    questsDone: o.quests ?? [], connected: true, player: 'Tester',
    position: o.pos === undefined ? { x: 3093, y: 3495, plane: 0 } : o.pos,
  });
  const progress = emptyProgress();
  const trip = planOneTrip(steps, progress, step.id, state);
  const prep = buildPrepPlan({ step, steps, progress, state, trip, readiness: readinessOf(step, { steps, progress, qp: 0, mode: 'f2p', state }), detail: o.detail ?? (() => undefined) });
  const need = buildNeed({ step, prep, prices, owned: state.owned, manual: {} });
  const snap = buildSnapshot({
    state, window: trip.stepIds.map((id) => steps.find(s => s.id === id)!), questPoints: o.questPoints === undefined ? 30 : o.questPoints,
    totalLevel: o.totalLevel === undefined ? 150 : o.totalLevel, ironman: o.ironman === undefined ? false : o.ironman, sellOverride: o.sellOverride,
  });
  const live = { stats: o.stats ?? HISTORICAL.stats, xp: o.xp ?? HISTORICAL.xp, gear: state.owned ? ({ equipment: worn.map((n) => ({ id: gearId(n), name: n })), inventory: [], coins: 0, bankCoins: 0 } as never) : null, train: o.train === undefined ? 'attack' as const : o.train };
  const base: AssessInput['base'] = {
    now: 1_792_000_000_000, prices, snap, reach: walk, exchange: GE, personalise: combatPersonaliser(live, prices), observed: o.observed, active: { foes: step.foes },
  };
  const assessment = assess({
    step, need, snap, prices, recs: o.recs ?? [], bankValue: null, base,
    activeId: o.activeId, allowHighEffort: o.allowHighEffort,
  });
  return { step, state, prep, need, snap, assessment, base };
}

export function summary(a: FundingAssessment): string[] {
  const f = (e: MethodEvaluation) => `${e.method.id} elig=${e.eligible} conf=${e.confidence} min=${e.minutes ? `${e.minutes.fast.toFixed(0)}-${e.minutes.slow.toFixed(0)}` : '-'}`;
  return [
    `state=${a.state} required=${a.required} gap=${a.gap} headline=${a.headline}`,
    `min tier ${JSON.stringify(a.need.minimum.lines.map((l) => `${l.name}x${l.qty}@${l.unit}`))} cost=${a.need.minimum.cost} rec=${a.need.recommended.cost} obj=${a.need.objective.cost} opt=${a.need.optional.cost} unknown=${a.need.unknown}`,
    `recommendation=${a.recommendation ? `${a.recommendation.kind} ${a.recommendation.title} | ${a.recommendation.detail}` : 'none'}`,
    ...a.alternatives.map((o) => `alt=${o.kind} ${o.title} | ${o.detail}`),
    ...a.notOffered.map((n) => `not offered: ${n.method}: ${n.why}`),
    ...(a.recommendation?.evaluation ? [f(a.recommendation.evaluation)] : []),
  ];
}
