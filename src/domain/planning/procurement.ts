import type { Step, WikiItemDetail } from '../../types';
import type { PriceView } from '../market/quotes';
import { aggregateShopping } from '../prep/shopping';
import type { ShoppingLine } from '../prep/shopping';
import { budgetOf, shopRows } from '../economy/shoppingView';
import type { ShopRow } from '../economy/shoppingView';
import type { PlanningSnapshot, Projection, ResourceChange } from './contracts';
import { projectedProcurementState } from './resources';
import { projectedQuestPoints } from './catalogue';

export interface ProcurementForecast {
  conditional: true;
  /** Lower bound remains useful when another row is unread/unpriced, but is never presented as a complete budget. */
  confirmedGp: number;
  requiredGp: number | null;
  shortfall: number | null;
  unknownOwnership: number;
  unknownPrices: number;
  unknownQuantities: number;
  /** Conditional physical purchase only. Quest payments stay reserved; no withdrawal, consumption, sale or completion is inferred. */
  purchase: ResourceChange | null;
  /** Acquisition channels from the existing source router, not current ownership/readiness proof. */
  acquisition: readonly Pick<ShopRow, 'key' | 'name' | 'id' | 'qty' | 'channel' | 'cost' | 'fee' | 'sources' | 'reusable' | 'package'>[];
}

/** Joint remaining demand uses Shopping's physical allocation, doses, alternatives, reuse, carryover and source pricing exactly once. */
export function forecastProcurement(input: {
  snapshot: PlanningSnapshot; projection: Projection; steps: readonly Step[]; prices: PriceView;
  ironman: boolean | null;
  detail: (id: number) => WikiItemDetail | undefined;
  onGe?: (line: ShoppingLine) => boolean;
}): ProcurementForecast | null {
  const state = projectedProcurementState(input.snapshot, input.projection);
  if (!state) return null;
  const list = aggregateShopping([...input.steps], { wholeGoal: true });
  const prices = input.prices;
  const rows = shopRows(list, { state, detail: input.detail, onGe: input.onGe ?? (() => true),
    gePrice: line => prices.buy(line.nameEn, line.id)?.price ?? null,
    priceOf: name => prices.buy(name)?.price ?? null, geLimit: line => prices.limitOf(line.nameEn, line.id),
    qp: projectedQuestPoints(input.snapshot, input.projection) });
  const budget = budgetOf(rows, list.coins, { bag: state.coins.bag.known ? state.coins.bag.value : null,
    bank: state.coins.bank.known ? state.coins.bank.value : null });
  const unknownQuantities = rows.filter(row => !row.optional && !row.exact).length;
  const complete = budget.unknownRows === 0 && budget.unpriced === 0 && unknownQuantities === 0;
  const acquisition = rows.filter(row => !row.optional && row.channel !== 'have' && row.channel !== 'equip' && row.channel !== 'bank')
    .map(({ key, name, id, qty, channel, cost, fee, sources, reusable, package: pack }) => ({ key, name, id, qty, channel, cost, fee, sources, reusable, package: pack }));
  return { conditional: true, confirmedGp: budget.required + budget.coinsForSteps, requiredGp: complete ? budget.required + budget.coinsForSteps : null,
    shortfall: complete ? budget.shortfall : null, unknownOwnership: budget.unknownRows, unknownPrices: budget.unpriced, unknownQuantities,
    purchase: complete ? purchaseOf(acquisition, budget.required, input.projection, input.ironman) : null, acquisition };
}

/** Materialize the allocator's chosen packages, not another stock allocator or a second quote/fee calculation. */
function purchaseOf(rows: ProcurementForecast['acquisition'], cost: number, projection: Projection, ironman: boolean | null): ResourceChange | null {
  if (!Number.isSafeInteger(cost) || cost < 0 || !projection.resources || projection.resources.gp.floor < cost) return null;
  const items: ResourceChange['items'][number][] = [];
  for (const row of rows) {
    if (row.channel !== 'ge' && row.channel !== 'shop') return null; // A pickup/drop/recipe needs its own verified work model.
    if (row.channel === 'ge' && ironman !== false) return null;
    if (row.cost === null || !Number.isSafeInteger(row.cost) || row.cost < 0) return null;
    if (row.package) {
      for (const part of row.package.lines) {
        if (!Number.isSafeInteger(part.count) || part.count < 1) return null;
        items.push({ name: part.name, delta: part.count }); // Whole physical bottles; spare doses stay in that bottle.
      }
    } else {
      if (!Number.isSafeInteger(row.qty) || row.qty < 1) return null;
      items.push({ name: row.name, delta: row.qty });
    }
  }
  return { items, gp: cost === 0 ? 0 : -cost, source: 'Shared Shopping allocation, physical packages and once-only quotes/fees' };
}
