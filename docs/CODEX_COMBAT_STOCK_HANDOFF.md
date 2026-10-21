# Required combat loot preserves unknown bank quantities

Partial T03/T10 follow-up after the third audit preview; not included in that EXE.

`itemGoal` now uses the existing `heldExact` observation contract. An opened bank is not proof that a particular item's quantity was reported: an absent Big bones row or a row without `bank` remains unchecked. Confirmed carried/noted stock still reduces the remaining collection ceiling, and fifty confirmed carried bones satisfy the item objective even when other bank contents are unknown. An explicitly reported bank zero remains a known zero.

Plan comparison keeps its existing expandable risk disclosure. It distinguishes a globally unread bank from a specific unread item count without adding another primary card or changing the route goal, candidate set or fight model.

Verification: four regression cases (the unknown-row cases failed before the fix); full Vitest 1,724 tests across 131 files; production build/TypeScript; check-data; Java testClasses; focused browser comparison checks at 390/1280 px, including the real folded warning. All passed locally. Clean cumulative CI is tracked by the draft PR. No live-game verification is claimed.

Remaining: food alternatives and other legacy consumers still need per-row completeness review; a collection ceiling is not proof of missing stock. This does not complete the whole combat, inventory-packing or route audit.
