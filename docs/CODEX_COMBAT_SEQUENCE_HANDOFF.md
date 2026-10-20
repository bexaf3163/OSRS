# Combined combat objectives and phase order

Stacked after confirmed quest-phase preparation. No route IDs, completion triggers, save formats or visible persistent panels were added. Existing manual choices and bank-trip change boundaries remain in force.

## Implemented comparison

The combat planner now compares collecting required drops first and credits the explicitly trained skill's XP before estimating subsequent training. The existing XP-first split remains available. When the item stock is already complete, an XP-only alternative is still compared instead of dropping the alternative trainer entirely. Item collection can be estimated after the XP target is reached. Defence-first phases must budget the remaining item objective and cannot count the combined phase done on XP alone.

Collection-first instructions explicitly name Accurate/Aggressive/Defensive as appropriate. The selected step carries that phase's XP projection into the existing food model, while the single HUD current action remains the item objective. A real item observation changes the phase; projected XP never writes progress or proves actual XP. Original route completion still requires its real combined trigger.

Strength doses are allocated across sequential estimates using only model-unused whole doses. Partly used boosts are conservatively not transferred to the next bank visit. A tie now has deterministic score/key fallbacks instead of returning a positive comparator in both directions.

For the historical fixture (Attack 30 at 13,363 XP, Strength 21, Defence 1, 24 HP, Adamant scimitar and iron armour), collecting 50 Hill Giant bones on Accurate supplies 7,000 Attack XP. Remaining cow training is 527 kills instead of the XP-first split's 746. These are formula results using existing foe data, not measured performance on the player's current account. The generated DEFAULT_PLANS report records changed recommendations.

## Evidence and limits

Regression cases cover partial/already-owned bones, Attack already complete, no imaginary XP, required attack style, low-remaining-XP Defence plans retaining all bones, dose carryover, preserved manual choices and no mid-trip auto-switch. Chromium verifies the default collection action, matching game payload, food-model projection, folded comparison, manual selection and the observed transition to remaining XP at desktop and phone widths. The full suite and exact-tree CI are recorded with the PR.

Local validation passed 1,668 Vitest tests, TypeScript/production build, data checks and the focused Chromium combat suite. The generated default-plan diff was reviewed: only the combat rows and heading changed; skill-training rows were unchanged.

This is partial T10. The trainer catalogue still has its original Cow/Minotaur/Hill Giant ceiling. Actual loot capacity and pickup/banking time, full acquisition and cash constraints, gear-upgrade and buy-versus-collect variants, Defence plus newly equipable armour, location/variant parity and live timing remain open. A plan's net-drop estimate is not spendable money or a promise that its whole cost is affordable. The existing food/bank/funding preparation guards remain necessary. Do not publish these formulas as a complete combat optimization audit or verified live timings.
