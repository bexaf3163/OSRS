# Inventory cleanup (2.59.0, in the game since 2.61.0)

Advice only. The app and the plugin never sell, drop, destroy, alchemise or move anything.

Where: the **Inventory cleanup** card on the Shopping page. It needs the game connected (the bag comes from RuneLite); without it the card says so and
guesses nothing.

## In the game (plugin 2.61.0+)

The same lines, in a few words ("Sell: Oak logs ×40 (noted) — no use ahead · ~3.6k gp"):

* **Bank and merchant card**: under the step's own rows, "Inventory cleanup (advice only):" and up to 5 lines; the rest are counted. With no step card the
  cleanup gets a card of its own ("Bank · inventory cleanup"). It never changes the card's colour or its "to do" count.
* **Grand Exchange**: only the Sell lines, and only when the step's card is the one shown (the bulk shopping list wins while it still has things to buy).
* **Guide, Advice tab**: the cleanup counts as one tip ("Advice · 1") and lists its first 4 lines. Never on the Steps tab.
* **Slot frames** (setting "Cleanup slot frames", **off** by default): a quiet dashed frame on the bag slot, blue to sell, red to drop or destroy, grey to
  look at. Bag only, never the bank. The lowest of all frames: a step or quest item, a gear-advice item or a transport item keeps its own frame.
* Setting "Inventory cleanup" (on by default) turns all of it off.

What the plugin checks by itself, without the app: the advice is shown only to the character it was made for; a line whose stack has left the bag
disappears, a smaller stack shows what is left (and a smaller estimate); everything is hidden once the app has been disconnected for 10 minutes (it
can no longer follow the route). "Always keep" and "Dismiss" in the app take the line out of the game within a second.

Wire format: snapshot part `cleanup` = `{player, lines:[{name, id, qty, noted?, action: sell|drop|destroy|review, why, proceeds?}]}`, at most 16
lines, sent only when there is at least one (an app with nothing to clean sends exactly the snapshot older plugins know). Lines without an item id are
not sent. Built by `src/lib/cleanupHint.ts`; checked by `CleanupHint.java`.

## The four verdicts

| Verdict | When |
|---|---|
| **Keep** | The route needs it (a count taken from every open step), you marked it "Always keep", or it is always carried: money, food, runes, arrows and bolts, potions, teleports, pouches, jewellery and capes, a small set of general tools (bucket, pot, knife, hammer, tinderbox, spade, rope, needle, thread, shears, chisel, saw, axe, pickaxe) and the checked "other uses" table. |
| **Sell** | Tradeable, nothing in the open route asks for the surplus, and selling is open to this account. Only the surplus is listed: "Keep 3 for Prince Ali Rescue; sell the remaining 20". The price is an exchange estimate before tax. |
| **Drop/Destroy** | Only items on the small verified table (below), and only once their quest is closed in your route. The line says Drop or Destroy and how to get the item again. |
| **Review** | Everything uncertain: charged or transformed items (`(5)`, `(uncharged)`, `(i)`, `(empty)`…), gear (an older piece can be a backup), untradeable items, an Ironman or an account whose type is not known, items a new account cannot sell yet, an item list that has not loaded. |

The words are never "safe to discard". The strongest is "No future use identified in the selected route", which says only that no open step asks for it.

## What counts as "needed"

Every step of the route that is not done or skipped (a partly done quest is an open step: all its needs count). Quantities come from the same
aggregation as the shopping list (tools count once, items carried over from an earlier step are not counted twice). A need whose amount is not
a number ("as many as you have") makes the whole stack a Keep. Recommended (optional) items are kept up to the recommended count.

## Variants

* A stack of banknotes is the same name as the item but a different thing. The plain stack covers the route's need first; the surplus is sold from the notes first (no bank trip). The plugin sends `noted` for each bag row (2.59.0+).
* A charged, uncharged or otherwise transformed name is never matched to the plain item's need and is never sold by a rule.

## Accounts and selling

* The account type comes from the game (plugin 2.59.0+: `accountType` in `/status`). If it is not known, you can say it on the card; the choice is saved per character. Ironman and unknown accounts never get "Sell".
* New-account restrictions: the 40 items on the wiki list (oak logs, cowhides, iron ore…) are Sell only when the restriction is lifted; "restricted" and "unknown" both give Review with the reason.

## Your say

* **Always keep** (per item) and **Dismiss** (per item and verdict: a different verdict for the same item shows again). Saved per profile **and** character, so another character starts clean. "Show dismissed suggestions" brings them back.

## Verified Drop/Destroy table (`OBSOLETE` in `src/lib/cleanup.ts`)

Only items whose wiki page says what is stated here, and a quest that must be closed first:

| Item | After | Verdict | Evidence |
|---|---|---|---|
| Research package | Rune Mysteries (S2-06) | Destroy | OSRS Wiki: untradeable, "Destroy" option, only delivered to Aubury; Archmage Sedridor gives another |
| Ghost's skull | The Restless Ghost (S1-06) | Drop (dropping destroys it) | OSRS Wiki: untradeable, "used only in The Restless Ghost"; cannot be picked up again after the quest |

The table is deliberately tiny. Everything else untradeable is a Review. It is a verified subset, not coverage of all quest items.

## Known uses beyond the route (`OTHER_USES`)

Dramen staff, Ghostspeak amulet, Anti-dragon shield, Holy symbol, Lobster pot: kept with the reason shown. Also a short list, not a guarantee.

## Not done / limits

* The bank is not read: only the bag (`GearState.inventory`) and the worn items are judged. Surplus is computed against the bag only, which is safe (a bank only adds). A note says when the bank has not been opened.
* High Alchemy is not suggested (no check of access, runes and value against selling yet).
* Live verification in the game: not done yet; the engine and the in-game part are covered by automated tests (`tests/cleanup.test.ts`,
  `tests/cleanupHint.test.ts`, `CleanupHintTest.java` with a rendered bank card) and the UI smoke (including the snapshot the game receives).
