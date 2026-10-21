# Route advice consistent with contextual combat decisions

Partial T10/T11/T13 text follow-up after profile protection. Not included in the published previews.

S3-07 still claimed that Amulet of strength was faster in every combat step and that power was useful only without strength. This contradicts the contextual DPS/breakpoint comparisons already covered by the Gear regression matrix. The same purchase step still directed every player to stock the old Minotaur example even when a different combat plan was selected. S3-08 also described early Defence training as wasting the later quest XP reward.

Four text values in `steps.json` now refer to the selected plan and contextual Gear comparison, distinguish whole-goal purchases from one carried trip, and describe the Defence decision as a time/cost trade-off. Extra Defence XP does not remove a subsequent XP reward. No new fixed recommendation or timer replaces the old example. Armour equip requirements remain unchanged.

This is a wording repair only: no IDs, order, triggers, quantities, prices, items, formulas, defaults or profile data change. It does not establish that defensive detours, gear purchase costs or every trainer are fully modelled. The existing handoffs keep those engine/route gaps open. The old route instructions are still available through the existing disclosure when an adopted plan replaces them; no additional card or toggle is introduced.

Initial checks caught two affected copy assertions and a Gear search-ranking regression from an added keyword. Keep the existing estimate disclosure, update the old automatic-buy wording assertion to selected-plan/whole-goal/one-trip semantics, and preserve the Gear search contract. Final full acceptance and cumulative CI are recorded with the PR. No gameplay measurement or local native success is claimed.

Final local acceptance passed: 1,715 Vitest tests in 129 files, build/TypeScript, check-data (0 errors/warnings) and Java testClasses. The existing Gear navigation search test remains unchanged and passed. Fresh cumulative browser/native CI remains required for this text revision.
