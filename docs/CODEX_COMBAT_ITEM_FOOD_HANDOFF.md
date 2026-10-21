# Food estimation continues while required loot remains

Partial T10/T13 follow-up. Not included in either published audit preview.

## Reproduction and repair

After Attack 40, S4-03 could still require all fifty Big bones, but `combatPlanView` stopped at the reached XP goal and returned no food projection. Preparation/Shopping could fall back to the written one-trip amount for a whole collection workload. The same gap affected a retained item-first estimate whose projected XP had been reached elsewhere and an XP-first plan's item-only second phase. Three meaningful regression cases returned null before repair.

The existing whole-objective projection from plan comparison is extracted into `combatObjectives.ts` and reused by food planning, including the potion comparison. This is the same fight model and full-fight health buffer, not a separate estimator or a multiplied one-kill result. The existing guaranteed-drop contract decides whether the current opponent can supply the route's required item. Fifty missing bones require fifty Hill Giant kills; thirty owned bones leave twenty. A cow phase is not extended to obtain Big bones. Once both route goals are met, no collection estimate is added.

An item-only second phase gets a private training-skill input for food/time projection, without adding a visible XP pace goal, changing the existing short collection action or serializing that metadata to the game. An initial attempt exposed a new XP pace target; the unchanged existing UI/selection tests caught it, and that approach was replaced. The route still completes only by its original Attack 40 plus fifty-bone trigger. Existing authored/adopted plan instructions and disclosure remain intact.

## Evidence and remaining scope

Local full Vitest passed 1,720 tests in 130 files before the final additional parity assertions; build/TypeScript and check-data (0 errors/warnings) passed. Focused browser checks at 390/1280 px verify Food and time remains present after Attack 40, the actual protocol-6 food requirement, unchanged completion and automatic recalculation after a bank-stock update. Final assertions, Java and cumulative clean CI are tracked with the PR. No live RuneLite or local native success is claimed.

This fixes fight/food workload parity, not complete joint inventory packing. Current loot-trip accounting is still a lower bound; full simultaneous food/potion/required-loot capacity, optional pickup work, acquisition/travel/gear costs and measured timings remain open. Legacy per-row stock completeness and food-detail versus full-plan banking time also need further work. Do not describe this package as a complete simulator or a full route audit.
