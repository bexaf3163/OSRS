// What useBridge gives the app, which is the link, the step shown in the game and what the game reports.

import type { PlayerStats, Step } from '../types';
import type { SessionBase } from '../domain/player/session';
import type { ProfileGate } from '../domain/persistence/profiles';
import type { RuneliteLaunch } from '../services/desktop';
import type { GearState, NavResult, NavTargetPayload, PacingState, PluginCompat, CombatLogState, ShoppingPlanPayload, QuestInstruction } from '../services/runeliteBridge';
import type { OwnedState } from '../domain/items/checklist';
import type { MoveEvent } from '../domain/travel/recovery';
import type { SnapshotParts } from '../domain/prep/prepEnvelope';
import type { LastGear } from './lastGear';
import type { QuestObservation } from '../domain/player/questObservation';

/** off — the link is turned off in settings; connecting — the first attempt; offline — no plugin; online — there. */
export type BridgeState = 'off' | 'connecting' | 'offline' | 'online';
export type PointResult = 'ok' | 'offline' | 'empty';

export interface AutoAdvance {
  from: string;
  nonce: number;
}

export interface BridgeValue {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  state: BridgeState;
  inGame: boolean;
  /** The step currently shown in the game. */
  activeStepId: string | null;
  pointInGame: (step: Step) => Promise<PointResult>;
  clear: () => Promise<void>;
  /** The last auto-mark from the game — the "Path" pages open the next step. */
  advance: AutoAdvance | null;
  /** The desktop app can start RuneLite with the plugin by itself. */
  canLaunch: boolean;
  launchRuneLite: () => Promise<RuneliteLaunch | null>;
  /** Start RuneLite together with the app. */
  autoLaunch: boolean;
  setAutoLaunch: (on: boolean) => void;
  /** Levels from the game; null — no link or the sending is turned off in the plugin. */
  stats: PlayerStats | null;
  /** How many of the step's and the shopping list's items there are (bag, banknotes, bank). */
  owned: OwnedState | null;
  /** Shortest Path is installed in the game — it draws the path over land. */
  shortestPath: boolean;
  /** The chosen quick variant of the step (id) — the step goes to the game with it. */
  branchChoice: Record<string, string>;
  chooseBranch: (step: Step, branchId: string | null) => void;
  /** The bulk list — into the exchange hint (and remember until the next RuneLite launch). */
  syncPlan: (plan: ShoppingPlanPayload) => Promise<boolean>;
  /** Gear, bag and coins from the game; null — unknown. */
  gear: GearState | null;
  /** The last known gear, bag and coins — recorded while the game was running; shown when RuneLite is closed. Not "now". */
  lastGear: LastGear | null;
  /** The last known gear of every character seen, by the character's name (lower case): characters never share a snapshot. */
  lastGears: Record<string, LastGear>;
  /** The training pace of the step shown in the game. */
  pacing: PacingState | null;
  /** The temporary target in the game (a place or a shop); null — the arrow leads to the step. */
  navTarget: NavTargetPayload | null;
  questInstruction: QuestInstruction | null;
  /** The Chronicle's charges and the spellbook as the game last told them (plugin 2.53+ / 2.52+); null — unknown. */
  chronicleCharges: number | null;
  spellbook: number | null;
  /** The quest points and the total level as the game holds them (plugin 2.54+); null — unknown, never zero. */
  questPoints: number | null;
  totalLevel: number | null;
  /** The account kind from the game (plugin 2.59+); null — unknown. */
  accountType: 'normal' | 'ironman' | null;
  /** The fights recorded on the combat training step (plugin 2.57+); null — none or unknown. */
  combatLog: CombatLogState | null;
  /** Set a temporary target. Without a link or on a refusal by the plugin — an answer with the reason. */
  navigate: (target: NavTargetPayload) => Promise<NavResult | { ok: false; reason: 'off' }>;
  clearNav: () => Promise<void>;
  /** Take down a temporary target the app itself set and no longer wants (a preparation whose task changed). Unlike clearNav it is not the player's word: auto preparation goes on. */
  releaseNav: () => Promise<void>;
  /** When the player cleared the arrow target themselves (ms); 0 — never. Auto preparation does not take over the arrow after that. */
  userClearedAt: number;
  /** The plugin version and compatibility with the app; null — no link. */
  plugin: { protocol: number | null; version: string | null; compat: PluginCompat } | null;
  /** XP by skill from the game (protocol 5); null — no link, an old plugin or the sending is turned off. */
  xp: PlayerStats | null;
  /** Names of completed quests (protocol 5); null — unknown. */
  questsDone: string[] | null;
  questStates?: QuestObservation | null;
  /** The character name from the game (protocol 5). */
  player: string | null;
  /** Last current-session position from status or a move event; funding also polls while its plan is active. */
  position: { x: number; y: number; plane: number } | null;
  /**
   * A part of the snapshot for the game (protocol 6): gear advice, items for the bank, the preparation plan. It goes to the plugin together
   * with everything else in one request; for a plugin older than protocol 6 the call does nothing — it has its own separate requests.
   */
  setPrepPart: <K extends 'gearHint' | 'bankTags' | 'plan' | 'cleanup' | 'funding' | 'decision'>(key: K, value: SnapshotParts[K]) => void;
  setTrainingStep: (value: Step | null) => void;
  /** Which profile and character are current: whether levels and marks from the game may be written into the profile. */
  gate: ProfileGate;
  /** XP per hour by skill from this session's measurements; null — too few measurements. */
  xpRate: (skill: string) => number | null;
  /** The session: when it began and with what (the first levels and XP, closed steps) — for the summary. */
  session: SessionBase;
  /** Recent character jumps (death, teleport) — they turn on the recovery mode. */
  moves: MoveEvent[];
  /** Where the character is now: a fresh request to the plugin (protocol 5); null — no link, not in the game or the plugin does not report. */
  locate: () => Promise<{ x: number; y: number; plane: number } | null>;
}
