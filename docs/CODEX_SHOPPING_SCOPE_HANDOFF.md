# Shopping: purchase reserve versus carried inventory

The real-PC third-preview review showed Salmon x142 under Next trip. scopeList deliberately calls aggregateShopping with wholeGoal=true for purchases and separately builds per-trip amounts for bank withdrawals. The scope label therefore implied the wrong inventory contract even when the calculation was doing its intended job.

This small T14 follow-up renames the existing default selector Stock up and the copied list scope upcoming steps. One short clarification joins the existing scope line when there are purchases/unchecked purchase requirements: purchase amounts cover selected steps, not one inventory; Path says what to carry now. No new panel or mode.

The stored trip key and all engine/allocation/price/ownership/withdrawal/exchange-payload code remain unchanged. This is not the complete joint inventory-packing solution, nor a recalculation of required food or proof that a proposed load fits. Unknown ownership remains unknown. Existing browser and packaged UI gates must pass before the block's separate portable prerelease. No implementation-mirroring unit test was added for this wording-only change.

Local verification: 1,767 Vitest tests/136 files, TypeScript/build, check-data 0 errors/warnings and Java testClasses passed. Existing focused Shopping browser cases passed (purchases, owned, bank withdrawals, unknown bank, offline, no overflow/console errors), and exported 390/1440 px images were inspected. They retain the existing controls/details and show the clarification without a new panel. The actual newer EXE and live game have not been checked locally; cumulative CI supplies the packaged fixture acceptance.
