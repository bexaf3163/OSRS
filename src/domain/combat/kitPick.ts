// One rule for the worn kit of every combat style: per slot the best owned piece is worn, and a better piece is bought while the
// coins allow. Styles differ only in their candidates and how a piece ranks (Ranged: Ranged attack; melee: strength, attack).

export interface KitSlot {
  slot: string;
  /** Pieces usable now (levels, quests, mode), by name. */
  names: readonly string[];
  /** No purchase in this slot (a weapon is bought through the upgrade evaluator, cosmetic slots are not worth coins). */
  wearOnly?: boolean;
  /** A free piece to wear when nothing better is owned or bought (a starter leather piece). */
  starter?: string | null;
}

export interface KitInput {
  slots: readonly KitSlot[];
  /** Higher is better, compared element by element (offence first, then defence). */
  rank: (name: string) => readonly number[];
  owned: (name: string) => boolean;
  /** The price to buy it, or null when it cannot be bought now. */
  price: (name: string) => number | null;
  /** Coins left for the kit; null buys nothing. */
  budget: number | null;
}

const above = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/** The piece chosen for each slot, in slot order; a slot with nothing to wear is left out. */
export function pickKit(input: KitInput): { slot: string; name: string; buy: boolean }[] {
  let budget = input.budget;
  const out: { slot: string; name: string; buy: boolean }[] = [];
  for (const s of input.slots) {
    const owned = s.names.filter(input.owned).sort((a, b) => (above(input.rank(b), input.rank(a)) ? 1 : -1))[0];
    const buys = s.wearOnly || budget === null ? [] : s.names
      .filter(name => !input.owned(name) && (!owned || above(input.rank(name), input.rank(owned))))
      .filter(name => { const p = input.price(name); return p !== null && p <= budget!; })
      .sort((a, b) => (above(input.rank(b), input.rank(a)) ? 1 : above(input.rank(a), input.rank(b)) ? -1 : input.price(a)! - input.price(b)!));
    if (buys.length) {
      budget! -= input.price(buys[0])!;
      out.push({ slot: s.slot, name: buys[0], buy: true });
    } else if (owned) out.push({ slot: s.slot, name: owned, buy: false });
    else if (s.starter) out.push({ slot: s.slot, name: s.starter, buy: false });
  }
  return out;
}
