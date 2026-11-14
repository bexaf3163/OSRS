// Project the selected shared acquisition source without turning a drop table or recipe into verified capability.
import type { PrepAction } from './prepPlan';
import type { SourceOption } from './sourceRouter';
import { purchaseCost } from '../items/purchaseCost';
import { hrefTo } from '../pages/pages';
import { formatGp as gp } from './shopping';

export function sourceAction(src: SourceOption | null, name: string, toGet: number, coinsTotal: number | null, stepId: string): PrepAction | undefined {
  if (!src) return { kind: 'BUY', label: 'Buy at the exchange or in a shop', href: hrefTo.shopping() };
  const nav = src.point ? { label: `${src.point.label}: ${name}`, x: src.point.x, y: src.point.y, plane: src.point.plane, itemName: name, stepId } : undefined;
  if (src.kind === 'free' || src.kind === 'make') return { kind: 'GATHER', acquisition: src, label: src.label, ...(nav ? { nav } : {}) };
  if (src.kind === 'drop') return { kind: 'GATHER', acquisition: src, label: src.label };
  if (src.kind === 'bag' || src.kind === 'bank') return undefined;
  const total = purchaseCost(src, toGet);
  const purchase = src.kind === 'shop' || src.kind === 'ge' ? { source: src.kind, ...(src.fee ? { fee: src.fee } : {}) } : undefined;
  // Not enough money: "buy" would be an empty piece of advice, so earn first.
  if (total !== null && coinsTotal !== null && coinsTotal < total) {
    return { kind: 'EARN', acquisition: src, label: `Short of ${gp(total - coinsTotal)} gp for ${name}: earn it first`, ...(src.price !== undefined ? { price: src.price } : {}), purchase, href: hrefTo.shopping() };
  }
  return {
    kind: 'BUY',
    label: `Buy: ${src.label}${src.price ? `, ${gp(src.price)} gp` : ''}${toGet > 1 && src.price ? ` each` : ''}${src.fee ? ` + ${gp(src.fee.coins)} gp ${src.fee.label}` : ''}`,
    purchase,
    ...(src.price !== undefined ? { price: src.price } : {}),
    ...(nav ? { nav } : {}),
    ...(nav ? {} : { href: hrefTo.shopping() }),
  };
}
