import type { GameMode, PlayerStats } from '../../types';
import type { GearState } from '../../services/runeliteBridge';
import type { QuestInstruction } from '../quests/questCursor';
import type { Known, PlayerState, WorldPoint } from '../player/playerState';

export type ActionKind = 'QUEST' | 'TRAIN' | 'WITHDRAW' | 'BUY' | 'EARN' | 'GATHER' | 'EQUIP' | 'TRAVEL' | 'VERIFY' | 'MANUAL_WAIT';
export type Feasibility = 'READY' | 'PREP_REQUIRED' | 'BLOCKED' | 'UNKNOWN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

/** Identity belongs to the observation transaction, not the page displaying it. */
export interface DecisionScope {
  characterId: string;
  mode: GameMode;
  gameSessionId: string;
  snapshotRevision: number;
}
export interface Evidence {
  source: string;
  snapshotRevision: number;
  /** A predicate still to observe; never an assertion that the action succeeded. */
  predicate: string;
}
export interface ActionRequirement {
  id: string;
  hard: boolean;
  state: 'met' | 'missing' | 'unknown';
  evidence: readonly Evidence[];
}
export interface Minutes {
  typical: number;
  fast: number;
  slow: number;
  source: string;
}
/** Unmeasured terms may cancel only when their identity and multiplicity are identical in both complete plans. */
export interface CostExpression { known: Minutes; unresolved: readonly string[] }
/** Each component occurs once. Benefits and penalties must also be minutes, never arbitrary points. */
export interface ActionCost {
  prepare: Minutes | null;
  travel: Minutes | null;
  work: Minutes | null;
  banking: Minutes | null;
  exchange: Minutes | null;
  switching: Minutes | null;
}
export interface ResourceQuantity { floor: number; complete: boolean }
export interface ConditionalResources {
  items: Readonly<Record<string, ResourceQuantity>>;
  gp: ResourceQuantity;
  /** Observed starting position or a conditional post-action destination; never arrival evidence. */
  position: WorldPoint | null;
  /** Surviving lower bounds of the originally observed worn kit. Purchases/rewards never add to it. */
  worn?: Readonly<Record<string, number>> | null;
}
/** Physical names/quantities resolved by the existing allocators; never equivalent healing or generic tool tiers. */
export interface ResourceChange {
  /** Unmodelled consumption/exchanges retire only these named lower bounds; unrelated stock and GP remain usable. */
  unknownItems?: readonly string[];
  items: readonly {
    name: string; delta: number;
    /** Preserve the lower bound but retire an exact total. Never strengthens certainty. */
    uncertain?: true;
  }[];
  gp: number;
  /** null explicitly retires an unmodelled end position; omission preserves the previous position. */
  destination?: WorldPoint | null;
  source: string;
}
export type ExpectedEffect =
  | { kind: 'xp'; skill: string; amount: number; afterSuccessOnly: true }
  | { kind: 'skill-floor'; skill: string; level: number; afterSuccessOnly: true }
  | { kind: 'quest'; questId: string; afterSuccessOnly: true }
  | { kind: 'unlock'; id: string; afterSuccessOnly: true }
  /** A macro's unmodelled consumption cannot leave its starting balances available to later objectives. */
  | { kind: 'resources-unknown'; source: string; afterSuccessOnly: true }
  | { kind: 'resources'; change: ResourceChange; afterSuccessOnly: true };
export interface CandidateAction {
  id: string;
  kind: ActionKind;
  goalId: string;
  title: string;
  feasibility: Feasibility;
  prerequisites: readonly ActionRequirement[];
  completionEvidence: readonly Evidence[];
  expectedEffects: readonly ExpectedEffect[];
  time: Minutes | null;
  gpCost: { amount: number; confidence: Confidence; source: string } | null;
  /** Authored execution content to display; it does not determine objective order. */
  stepId?: string;
  destination?: WorldPoint;
  sourceIds: readonly string[];
  reasons: readonly string[];
}
export interface QuestEvidence {
  state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN';
  source: string;
  /** A validated local walkthrough cursor; absent for an unknown in-progress stage. */
  stepId?: string;
}
export interface PlanningSnapshot {
  scope: DecisionScope;
  player: PlayerState;
  xp: Readonly<Record<string, Known<number>>>;
  quests: Readonly<Record<string, QuestEvidence>>;
  questPoints: Known<number>;
  manual: Readonly<Record<string, boolean | undefined>>;
  bankRead?: { kind: 'current' | 'remembered' | 'unread'; at?: number };
  /** Raw worn item IDs and real levels from the same admitted transaction; absent is unassessed, never default gear. */
  combat?: { gear: GearState | null; stats: PlayerStats | null };
  instruction?: QuestInstruction | null;
}
/** Search-only state. It cannot replace observed PlayerState, bank stock, equipment or spendable GP. */
export interface Projection {
  scope?: DecisionScope;
  completed: ReadonlySet<string>;
  xp: Readonly<Record<string, number>>;
  /** Proven starting levels / conditional prerequisite floors; not fabricated exact XP. */
  levels?: Readonly<Record<string, number>>;
  /** A known level implies a range of XP, never an exact made-up starting value. */
  xpBounds?: Readonly<Record<string, { min: number; max: number }>>;
  unlocks: ReadonlySet<string>;
  /** Search-only balances. These never become PlayerState, observed GP or executable ownership evidence. */
  resources?: ConditionalResources;
  /** A model spent resources without modelling acquisition/earning first. Such a branch is not executable. */
  invalidResources?: boolean;
}
export interface ObjectiveEvaluation {
  objectiveId: string;
  activeAction: CandidateAction;
  /** Full time until this objective succeeds, including its prerequisites and travel. */
  cost: ActionCost;
  effects: readonly ExpectedEffect[];
  confidence: Confidence;
  /** Actual game/partner/safety blocker; it is never subject to preference hysteresis. */
  hardBlocked: boolean;
  comparisonCost?: CostExpression;
}
export interface PlannerModel {
  objectiveIds: readonly string[];
  /** Required frontier of an explicit final goal (including endogenous quest-point prerequisites). */
  prerequisitesFor?: (id: string, projection: Projection) => readonly string[];
  evaluate: (id: string, projection: Projection) => ObjectiveEvaluation | null;
  /** Joint remaining cost: shared training/resources counted once, not once per quest. */
  remaining: (projection: Projection) => Minutes | null;
  /** Optional accounting of common unmeasured work; it never fabricates an absolute duration. */
  remainingExpression?: (projection: Projection) => CostExpression | null;
}
export interface CommittedDecision extends DecisionScope {
  revision: number;
  objectiveId: string;
  requestedObjectiveId?: string;
  activeAction: CandidateAction;
  /** The second macro actually selected by bounded lookahead; absent when the next objective is unresolved. */
  followingObjectiveId?: string;
  alternatives: readonly { id: string; minutes: number | null; comparisonReason: string }[];
  expectedNext: { effects: readonly ExpectedEffect[]; evidenceRequired: readonly Evidence[] };
  confidence: Confidence;
  why: readonly string[];
  estimatedRemaining: Minutes | null;
}
