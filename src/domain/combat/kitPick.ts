// One rule for the worn kit of every combat style: per slot the best owned piece is worn, and the best piece the levels allow
// is bought. What the coins do not cover is the funding shortfall the plan sends the player to earn. Styles differ only in their
// candidates and how a piece ranks (Ranged: Ranged attack; melee: strength, attack).

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
  /** Coins left for the kit; null (unknown coins or prices) buys nothing. */
  budget: number | null;
}

const above = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/** The piece chosen for each slot, in slot order; a slot with nothing to wear is left out. */
/**
 * The plan earns the shortfall only for a piece up to this price; a dearer one (a 58M dragon kiteshield) is bought only from coins in
 * hand. shortcut: a fixed cap, replace with earn time against the training time the piece saves once a kit's rate gain is modelled.
 */
export const EARN_CAP = 1_000_000;

export function pickKit(input: KitInput): { slot: string; name: string; buy: boolean }[] {
  const out: { slot: string; name: string; buy: boolean }[] = [];
  for (const s of input.slots) {
    const owned = s.names.filter(input.owned).sort((a, b) => (above(input.rank(b), input.rank(a)) ? 1 : -1))[0];
    const buys = s.wearOnly || input.budget === null ? [] : s.names
      .filter(name => !input.owned(name) && (!owned || above(input.rank(name), input.rank(owned))))
      // Price and rank once per piece: the price reads the player's holdings, which the sort would otherwise repeat per comparison.
      .flatMap(name => { const price = input.price(name); return price !== null && price <= Math.max(input.budget!, EARN_CAP) ? [{ name, price, rank: input.rank(name) }] : []; })
      .sort((a, b) => (above(b.rank, a.rank) ? 1 : above(a.rank, b.rank) ? -1 : a.price - b.price));
    if (buys.length) {
      out.push({ slot: s.slot, name: buys[0].name, buy: true });
    } else if (owned) out.push({ slot: s.slot, name: owned, buy: false });
    else if (s.starter) out.push({ slot: s.slot, name: s.starter, buy: false });
  }
  return out;
}
