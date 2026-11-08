import type { Step } from '../../types';
import { nameKey } from '../items/itemKey';
import { consumeMaterialStock } from '../player/materialStock';
import { projectResources, projectedProcurementState } from './resources';
import { forecastProcurement } from './procurement';
import type { ProcurementForecast } from './procurement';
import type { QuestFact } from './catalogue';
import { canSupplyQuestDelivery, questPreparationSteps } from './catalogue';
import type { ResourceChange } from './contracts';

/** Conditional macro flow only. The tactical resolver still requires real acquisition, wearing and quest observations. */
export function forecastQuestResources(input: Parameters<typeof forecastProcurement>[0] & { goal: QuestFact }): {
  changes: readonly ResourceChange[]; procurement: ProcurementForecast;
} | null {
  const { goal, snapshot } = input, flow = goal.resourceFlow, evidence = snapshot.quests[goal.id];
  if (!flow || input.projection.completed.has(goal.id) || !['NOT_STARTED', 'IN_PROGRESS'].includes(evidence?.state) || !goal.source.url.trim()
    || (evidence.state === 'IN_PROGRESS' && (!evidence.stepId || flow.fromStartOnly))) return null;
  const partial = evidence.state === 'IN_PROGRESS' && flow.partialDelivery;
  const starting = partial ? projectedProcurementState(snapshot, input.projection) : null;
  if (partial && (!starting || !canSupplyQuestDelivery(goal, starting))) return null; // Never buy a guessed full remainder.
  const at = evidence.state === 'IN_PROGRESS' ? goal.stepIds.indexOf(evidence.stepId!) : 0;
  if (at < 0) return null;
  const remaining = goal.stepIds.slice(at);
  if (!remaining.length || remaining.length !== input.steps.length || remaining.some((id, i) => input.steps[i].id !== id)) return null;
  if (flow.consumes.some(item => !nameKey(item.name) || !Number.isSafeInteger(item.count) || item.count < 1)
    || flow.receives.some(item => !nameKey(item.name) || !Number.isSafeInteger(item.count) || item.count < 1
      || !['start', 'complete'].includes(item.when))) return null;
  const change = (items: ResourceChange['items']): ResourceChange => ({ items, gp: 0, source: goal.source.url });
  const gifts = change(flow.receives.filter(item => item.when === 'start' && evidence.state === 'NOT_STARTED')
    .map(item => ({ name: item.name, delta: item.count })));
  const resources = input.projection.resources && projectResources(input.projection.resources, [gifts]);
  if (!resources) return null;
  const projection = { ...input.projection, resources };
  const steps: Step[] = questPreparationSteps(input.steps, goal, evidence);
  const procurement = forecastProcurement({ ...input, projection, steps });
  // Reserved quest payments have not been spent in the purchase; this flow has no reviewed payment model.
  if (!procurement?.purchase || procurement.requiredGp !== -procurement.purchase.gp) return null;
  const stocked = projectResources(resources, [procurement.purchase]);
  if (!stocked) return null;
  const state = projectedProcurementState(snapshot, { ...projection, resources: stocked });
  const use = state && consumeMaterialStock(state, flow.consumes);
  if (!use) return null;
  const consumption = change(use.map(item => ({ name: item.name, delta: -item.count, ...(partial ? { uncertain: true as const } : {}) })));
  const reward = { ...change([...flow.receives.filter(item => item.when === 'complete').map(item => ({ name: item.name, delta: item.count })),
    ...(flow.uncertainReceipts ?? []).map(name => ({ name, delta: 0, uncertain: true as const }))]), destination: null };
  if (flow.unknownItems) reward.unknownItems = flow.unknownItems;
  const changes = [gifts, procurement.purchase, consumption, reward];
  return projectResources(input.projection.resources!, changes) ? { changes, procurement } : null;
}
