// The runtime composition of the one planner: real adapters over the existing engines (tactical preparation, quest resource
// forecasts, the shared training cost) feed planIntent. Nothing here estimates on its own; what no engine models stays null,
// which the planner keeps UNKNOWN rather than zero.
import type { Step, WikiItemDetail } from '../../types';
import { combatAuditJson } from '../../data';
import type { PriceView } from '../market/quotes';
import type { MethodPriority, PlayStyle } from '../persistence/playStyle';
import type { TradeRestriction } from '../market/tradeRestriction';
import type { Progress } from '../../types';
import type { CommittedDecision, PlanningSnapshot } from './contracts';
import type { PlanningIntent } from './intent';
import { planIntent } from './planner';
import { questCatalogue, remainingQuestSteps, setAsideQuests, type QuestFact } from './catalogue';
import { createTacticalResolver, type TacticalInput } from './tactical';
import { createTrainingCost } from './training';
import { observedProjection } from './decision';
import { forecastQuestResources } from './questResources';
import { planningWindow } from './window';
import { noTime, sumMinutes } from './cost';
import { preparationTime } from './preparationTime';
import { withTeleports, type TeleportInput } from './teleportWalk';
import type { Minutes } from './contracts';
import type { WorldPoint } from '../player/playerState';
import { modelsRegeneration, stepFightNames } from '../combat/fightEstimate';
import { encounterSetups } from './encounter/setups';

export interface RuntimePlanInput {
  snapshot: PlanningSnapshot;
  intent: PlanningIntent | null;
  previous?: CommittedDecision;
  progress: Progress;
  prices: PriceView;
  /** Authored execution steps of the account's mode; they say HOW, never which objective comes next. */
  steps: readonly Step[];
  detail: (id: number) => WikiItemDetail | undefined;
  ironman: boolean;
  earn: TacticalInput['earn'];
  style?: PlayStyle;
  priority?: MethodPriority;
  restriction?: TradeRestriction['state'];
  keepDefenceOne?: boolean;
  catalogue?: readonly QuestFact[];
  /** Walking minutes from the trip worker's routes (createWalkingCosts); absent keeps quest travel UNKNOWN. */
  walk?: (from: WorldPoint | null, to: WorldPoint) => Minutes | null;
  /** What the character can teleport with now (levels, carried runes or tablets); absent means walking only. */
  teleports?: TeleportInput | null;
  /** Minutes to gather pieces of an item yourself (gatherTime over the Money engine); absent keeps gathering UNKNOWN. */
  gather?: (name: string, count: number) => Minutes | null;
}

/** Capabilities the readiness engine proves: a step whose fights it assessed is combat-ready and survivable. Regeneration is
 * proven only where the assessed fight models it (fightMechanics.json); elsewhere it stays unknown and the quest waits for verification. */
const ASSESSED = new Set(['combat', 'survival']);
/** The combat audit's reviewed stages (danger on the route) and those whose plan is to run past the danger. When every
 * audited danger still ahead in a quest is a run-past, survival and evasion are proven by that reviewed escape. */
const AUDITED = (combatAuditJson as unknown as { stages: { stepId: string; method: string }[] }).stages.filter(stage => stage.method !== 'none');
const DANGER = new Set(AUDITED.map(stage => stage.stepId));
const RUN_PAST = new Set(AUDITED.filter(stage => stage.method === 'run').map(stage => stage.stepId));
const ESCAPABLE = new Set(['survival', 'evasion']);

// shortcut: the Wiki length category is a band, not a measurement; replace it with measured quest durations (brief 10) once sessions record them.
const QUEST_LENGTH: Readonly<Record<string, readonly [fast: number, typical: number, slow: number]>> = {
  'Very Short': [5, 10, 20], Short: [10, 20, 40], Medium: [20, 40, 80], Long: [40, 80, 160], 'Very Long': [80, 160, 320],
};

/** The quest's remaining work from this step: its share of the Wiki length band by the steps still ahead. An unknown length stays null. */
export function questWork(step: Step, goal: QuestFact): Minutes | null {
  const band = goal.length ? QUEST_LENGTH[goal.length] : undefined;
  const at = goal.stepIds.indexOf(step.id);
  if (!band || at < 0) return null;
  const share = (goal.stepIds.length - at) / goal.stepIds.length;
  return { fast: band[0] * share, typical: band[1] * share, slow: band[2] * share, source: `OSRS Wiki quest length "${goal.length}" (estimated band)` };
}

export function runtimeDecision(input: RuntimePlanInput): CommittedDecision | null {
  const { snapshot, prices, steps, ironman } = input;
  // A closed optional quest is set aside unless the player asks for it by name.
  const aside = setAsideQuests(input.catalogue ?? questCatalogue, steps, input.progress, snapshot.quests);
  const catalogue = (input.catalogue ?? questCatalogue).filter(quest => !aside.has(quest.id) || (input.intent?.kind === 'quest' && input.intent.questId === quest.id));
  const current = input.previous?.activeAction.executionStep ?? (input.previous && steps.find(step => step.id === input.previous!.activeAction.stepId));
  const window = input.previous && current ? planningWindow({ snapshot, decision: input.previous, current, catalogue, steps }) : [];
  const walk = withTeleports(input.walk ?? (() => null), input.teleports ?? null);
  const origin = snapshot.player.position.known ? snapshot.player.position.value : null;
  const stepOf = new Map(steps.map(step => [step.id, step]));
  const options = { prices, style: input.style, priority: input.priority, restriction: input.restriction };
  // Training time to a level from the shared training cost, measured from the observed state (train-then-earn, S61).
  const trainingCost = createTrainingCost(snapshot, options), observed = observedProjection(snapshot);
  const train = (skill: string, level: number) => trainingCost(skill, level, observed);
  // A fight the encounter engine can win: now, with the current levels and gear, or after some training and kit.
  const winnings = new Map<string, boolean>();
  const winnable = (step: Step, currentOnly = false): boolean => {
    const key = `${step.id}:${currentOnly}`;
    if (!winnings.has(key)) winnings.set(key, encounterSetups(step, snapshot, prices, ironman, { currentOnly, keepDefenceOne: input.keepDefenceOne }).length > 0);
    return winnings.get(key)!;
  };
  const tactical = createTacticalResolver({
    snapshot, progress: input.progress, prices, window, style: input.style, priority: input.priority,
    restriction: input.restriction, ironman, walk, keepDefenceOne: input.keepDefenceOne,
    earn: (step, gp, budget, goalId) => input.earn(step, gp, budget, goalId, train),
    gather: input.gather,
    preparationTime: frame => preparationTime(frame, origin, walk, input.gather, undefined, snapshot.quests),
  });
  // Unknown quests and steps without an encounter need only the original length/route estimate. Resolving their full
  // preparation here would eagerly scan every unopened quest on each STATS event, before any candidate can use it.
  const encounterOf = (step: Step, goal: QuestFact) => snapshot.quests[goal.id]?.state !== 'UNKNOWN'
    && snapshot.quests[goal.id] && stepFightNames(step).length && snapshot.combat?.stats && snapshot.combat.gear?.equipment
    ? tactical.resolve(step, goal.id).encounter : undefined;
  // A fight ahead of the quest's current step that is not ready now: proven by a modelled way to win it, its training and kit unpriced.
  const laterFight = (step: Step, goal: QuestFact) => stepFightNames(step).length > 0
    && remainingQuestSteps(goal, stepOf, snapshot.quests[goal.id])[0]?.id !== step.id && tactical.resolve(step, goal.id).action !== null;
  const preparationOf = (goal: QuestFact) => {
    const step = stepOf.get(snapshot.quests[goal.id]?.stepId ?? goal.stepIds[0]);
    return step ? tactical.resolve(step, goal.id).preparationMinutes : null;
  };
  return planIntent({
    snapshot, intent: input.intent, previous: input.previous,
    quests: {
      catalogue, steps,
      adapters: {
        prepare: (step, goal, observed, projection) => {
          const frame = tactical.resolve(step, goal.id);
          const forecast = forecastQuestResources({ snapshot: observed, projection, steps, prices, ironman, detail: input.detail, goal });
          // Combat and survival are proven by the quest's own fight steps, not by the step in hand: each must be ready now.
          const fights = goal.stepIds.flatMap(id => {
            const step = stepOf.get(id);
            return step && (step.foes?.length || step.threats?.length) ? [step] : [];
          });
          const remaining = new Set(remainingQuestSteps(goal, stepOf, snapshot.quests[goal.id]).map(step => step.id));
          // No encounter metadata is not proof of safe combat. A validated cursor may retire an earlier known encounter.
          const met = fights.length > 0 && fights.filter(fight => remaining.has(fight.id)).every(fight => {
            const frame = tactical.resolve(fight, goal.id);
            // A later fight is prepared when it is reached, with kit the quest hands over on the way (a maze key, a shield):
            // a modelled, safe way to win it is the proof now. The current one, still buying its kit, is proven when the current
            // levels and gear already win it: the purchases are then the whole preparation, and they are priced.
            return frame.action === null || !!frame.encounter || (laterFight(fight, goal) ? winnable(fight) : winnable(fight, true));
          });
          const dangers = [...remaining].filter(id => DANGER.has(id));
          const escaped = dangers.length > 0 && dangers.every(id => RUN_PAST.has(id));
          const regenerating = fights.some(fight => remaining.has(fight.id) && modelsRegeneration(fight));
          const proven = (key: string) => (ASSESSED.has(key) && met) || (key === 'regeneration' && met && regenerating) || (ESCAPABLE.has(key) && escaped);
          return {
            action: frame.action, minutes: frame.preparationMinutes,
            ...(frame.encounter ? { executionStep: frame.step, reasons: frame.encounter.reasons, uncertain: frame.encounter.uncertain } : {}),
            capabilities: Object.fromEntries((goal.requirements.capabilities ?? []).map(key => [key, proven(key) ? 'met' : 'unknown'] as const)),
            // The authored quest flow does not account for tactical kit acquisition, training or stochastic food use.
            // Retire projected balances rather than granting later quests unspent cash or uneaten supplies.
            resources: frame.encounter ? null : forecast ? forecast.changes : null,
          };
        },
        work: (step, goal) => {
          const encounter = encounterOf(step, goal);
          if (!encounter && laterFight(step, goal)) return null;
          const band = questWork(step, goal);
          if (!encounter || !band) return band;
          // The length band is a prepared player's quest, fight included: its allowance is the fight as prepared (the chosen setup), not the
          // current kit's longer one; the training and kit are preparation. Never add the fight twice, never price a negative remainder.
          if (encounter.work.typical >= band.typical) return null;
          const rest = { fast: Math.max(0, band.fast - encounter.work.typical), typical: band.typical - encounter.work.typical,
            slow: Math.max(0, band.slow - encounter.work.typical), source: `${band.source}; unmeasured non-combat remainder after the prepared fight` };
          return sumMinutes([rest, encounter.work]);
        },
        // Walking comes only from the trip worker's routes; without an observed start or a route it stays UNKNOWN.
        travel: (step, _goal, projection) => {
          if (encounterOf(step, _goal)) return noTime(); // Complete preparation trip already ends at the fight.
          const from = projection.resources?.position ?? origin;
          const to = step.mapLocation;
          return from && to ? walk(from, { x: to.x, y: to.y, plane: to.plane }) : null;
        },
        // shortcut: each quest's preparation is resolved from the current facts, so stock two quests share is counted for both; replace with forecastProcurement's joint allocation.
        preparationOf,
        remainingPreparation: goals => sumMinutes(goals.map(preparationOf)),
      },
    },
    training: {
      adapters: {
        prepare: candidate => ({
          action: candidate.step ? tactical.resolve(candidate.step, candidate.action.goalId).action : null,
          minutes: candidate.step ? null : noTime(), resources: null,
        }),
        travel: () => null,
      },
      options,
    },
  });
}
