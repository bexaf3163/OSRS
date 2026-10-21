# Explicit combat selection in UI regression scenarios

The full CI run for combat sequencing (39499279686) passed Java and the isolated packaged EXE but failed ten Chromium assertions. They were the same five food/variant assertions at two widths: S3-08 now correctly selected the XP-only Cow alternative, while an older scenario still assumed Minotaurs were the automatic default.

The Minotaur food tests now store an explicit player choice of the written route. All their original food, bank-deficit, level-27 comparison, armour, readiness and disclosure assertions remain. A separate scenario verifies automatic XP-only selection, Strength-before-Attack order, original completion goals and the outgoing game payload. Neither production selection nor its old-save/manual-choice behavior was changed to satisfy the fixture.

The full browser run is required on this follow-up tree; its result is recorded with the PR. Earlier failed CI must not be reported as green merely because focused combat checks had passed. The final cumulative branch's CI must pass before release.
