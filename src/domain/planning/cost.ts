import type { ActionCost, CostExpression, Minutes } from './contracts';

export function validMinutes(value: Minutes | null): value is Minutes {
  return value !== null && [value.fast, value.typical, value.slow].every(n => Number.isFinite(n) && n >= 0)
    && value.fast <= value.typical && value.typical <= value.slow && value.source.trim().length > 0;
}

/** Unknown cost never becomes zero. Zero is reserved for a known absent component. */
export function sumMinutes(values: readonly (Minutes | null)[]): Minutes | null {
  if (values.some(value => !validMinutes(value))) return null;
  const known = values as readonly Minutes[];
  return { fast: known.reduce((n, v) => n + v.fast, 0), typical: known.reduce((n, v) => n + v.typical, 0),
    slow: known.reduce((n, v) => n + v.slow, 0), source: [...new Set(known.map(v => v.source))].join('; ') || 'No remaining work' };
}

export const noTime = (): Minutes => ({ fast: 0, typical: 0, slow: 0, source: 'Not required' });
export function totalCost(cost: ActionCost): Minutes | null { return sumMinutes(Object.values(cost)); }

export function validActionCost(cost: ActionCost): boolean {
  return Object.values(cost).every(value => value === null || validMinutes(value));
}

export function exactCost(minutes: Minutes | null): CostExpression | null {
  return validMinutes(minutes) ? { known: minutes, unresolved: [] } : null;
}
export function validExpression(value: CostExpression | null): value is CostExpression {
  return value !== null && validMinutes(value.known) && value.unresolved.every(term => typeof term === 'string' && term.trim().length > 0);
}
export function sumExpressions(values: readonly (CostExpression | null)[]): CostExpression | null {
  if (values.some(value => !validExpression(value))) return null;
  const known = values as readonly CostExpression[];
  return { known: sumMinutes(known.map(value => value.known))!, unresolved: known.flatMap(value => value.unresolved) };
}
/** Keep repetitions: two unknown bank visits do not cancel one unknown bank visit. */
export function unresolvedKey(value: CostExpression): string { return JSON.stringify([...value.unresolved].sort()); }
export function comparableKnown(a: CostExpression | null, b: CostExpression | null): boolean {
  return validExpression(a) && validExpression(b) && unresolvedKey(a) === unresolvedKey(b);
}
