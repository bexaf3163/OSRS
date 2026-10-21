# Combat food quantities require per-row evidence

Partial T03/T10 follow-up after preview 402222c9; this is not included in that EXE.

The global bankSeen flag previously authorized a food purchase deficit even if a tracked alternative (for example Lobster) had no reported bank quantity. ownedFood now reuses heldExact for each accepted food. It exposes the confirmed healing-equivalent stock as a lower bound and a separate bankComplete flag. Old bank values are excluded when the current session has not seen the bank. Quest-food reservations and noted/usable separation are retained.

A whole-goal purchase deficit requires complete food quantities, unless the confirmed lower bound already proves no purchase is needed. Next-trip readiness can still withdraw confirmed bank food or unnote owned food without waiting for every alternative. If that known stock is insufficient, it asks to check the remainder instead of inventing a purchase. The existing Food and time line labels confirmed stock without incorrectly calling bank/noted food carried. No primary panel, setting, route goal or combat formula was added.

Seven regression cases reproduced the previous behavior. Existing complete-snapshot fixtures now explicitly report zero for absent accepted fish; their original purchase assertions are retained. Validation: 1,731 Vitest tests in 132 files; production build/TypeScript; check-data 0 errors/warnings; Java testClasses; browser checks at 390/1280 px, including an OWNED update with an omitted alternative and partial known bank stock. Focused UI passed after the final copy simplification. Both food-line screenshots were visually reviewed before removing repeated same-food healing text. Cumulative clean CI is tracked on the PR.

This does not establish that every legacy readiness/Shopping consumer uses complete per-row observations, nor complete simultaneous food/potion/loot packing, gear/travel costs, actual account rates or live RuneLite acceptance. The all-67-step audit remains open.

Clean cumulative CI passed at 30ad2840a3767fc25de725b8bf13d5eddc50934e, run 39607713585, including the full browser/Java and actual isolated Windows EXE gates.
