/** Expected input use and a one-time allowance for an unread partially used first unit. */
export interface Consumption { qty: number; initialReserve?: number }

export function validConsumption(input: Consumption): boolean {
  return Number.isFinite(input.qty) && input.qty > 0 && Number.isFinite(input.initialReserve ?? 0)
    && (input.initialReserve ?? 0) >= 0 && (input.initialReserve ?? 0) < 1;
}

/** Actual item requirements are whole units; average prices still use qty per action. */
export function quantityForActions(input: Consumption, actions: number): number {
  return actions > 0 ? Math.ceil(actions * input.qty + (input.initialReserve ?? 0)) : 0;
}

/** Confirm only actions supported even if the first observed unit has minimal uses left. */
export function actionsForQuantity(input: Consumption, count: number): number {
  if (!validConsumption(input) || !Number.isFinite(count) || count <= 0) return 0;
  const actions = Math.max(0, Math.floor((count - (input.initialReserve ?? 0)) / input.qty));
  // Recover a boundary lost to fractional floating-point subtraction, checked against physical stock.
  if (quantityForActions(input, actions) > count) return Math.max(0, actions - 1);
  return quantityForActions(input, actions + 1) <= count ? actions + 1 : actions;
}
