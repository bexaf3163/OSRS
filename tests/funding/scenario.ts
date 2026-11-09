// A whole funding scenario built the way the app builds it: the player state, the one-trip plan, the preparation plan, the money need, the snapshot and the
// assessment, for a real step of the route. Tests state only what the player has and what the market says; everything else is the production code.

import legacyCollect from '../fixtures/legacyCollectStep.json';
import { stepsFor } from '../../src/data';
import { gearById } from '../../src/domain/combat/gearAdvisor';
import type { OwnedItem, OwnedState } from '../../src/domain/items/checklist';
import { nameKey } from '../../src/domain/items/itemKey';
import { combatPersonaliser } from '../../src/domain/economy/funding/combatAdapter';
import { assess, type AssessInput, type FundingAssessment } from '../../src/domain/economy/funding/assess';
import { buildNeed, type FundingNeed } from '../../src/domain/economy/funding/need';
import { buildSnapshot, type FundingSnapshot } from '../../src/domain/economy/funding/snapshot';
import type { SurplusRec } from '../../src/domain/economy/funding/budget';
import type { PriceView } from '../../src/domain/market/quotes';
import type { ObservedRate } from '../../src/domain/economy/funding/evaluate';
import { emptyProgress } from '../../src/domain/persistence/progress';
import { buildPlayerState, type PlayerState } from '../../src/domain/player/playerState';
import { buildPrepPlan, type PrepPlan } from '../../src/domain/prep/prepPlan';
import { planOneTrip, tripWindow } from '../../src/domain/prep/oneTrip';
import { readinessOf } from '../../src/domain/readiness/readiness';
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
  /** Pin a local-method fixture without asserting that this method is the global recommendation. */
  methods?: AssessInput['methods'];
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
  // The collection step of the retired route stands where it was, after The Ides of Milk's part of the road (S4-02).
  const route = stepsFor('f2p'), at = route.findIndex(s => s.id === 'S4-02') + 1;
  const steps = [...route.slice(0, at), legacyCollect as Step, ...route.slice(at)];
  const step = steps.find(s => s.id === (o.stepId ?? 'S4-03'))!;
  // The plugin reports every item the route asks about, zero included: a tracked item with nothing is a fact, an untracked one is unknown.
  const tracked = new Set(tripWindow(steps, emptyProgress(), step.id).flatMap((w) => (w.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])));
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
  const need = buildNeed({ step, prep, prices, owned: state.owned, manual: {}, hitpoints: (o.stats ?? HISTORICAL.stats).hitpoints });
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
    methods: o.methods,
  });
  return { step, state, prep, need, snap, assessment, base };
}
