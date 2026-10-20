# Selected-route stock protection

Stacked after SSE backpressure. This changes advice only; no inventory, sale, purchase or game action is automated.

## Change

Funding now reserves the selected route's required stock using Shopping's demand ledger: independent consumables add, reusable tools use a maximum, and selected producer carryover is not bought twice. Already held common alternatives are allocated once across demands, food by healing and potions by physical bottle size. Completion and carryover are retained-stock floors rather than an additional consumption. Quest-machine item protection remains.

The funding window resolves its IDs against the adopted skill/combat steps from the shared readiness context. Inventory cleanup uses those selected steps too and applies the same reserves as an additional protective floor. Existing food, tool, jewellery and uncertain-item protections remain. An explicit skip cannot authorize disposal of an obsolete quest item: a known live quest result takes precedence, with an explicit completed mark only as the unknown-state fallback.

Merged rows whose sources accept different alternatives still need source-level allocation in Shopping. Until that is implemented, the primary quantity is retained conservatively and held partial alternatives are protected as well. This can reserve more than necessary, but must not turn a useful partial alternative into a sale suggestion. Uncertain quantities protect all their candidate stock.

## Evidence and remaining scope

Regression coverage includes 10+15 consumables, one reused tool, no double allocation of common alternatives, mixed stricter/alternative requirements, food healing, physical potion bottles, completion/carryover overlap, reusable deficits and uncertain quantities. The Chromium scenario checks that a skipped Rune Mysteries does not permit destroying the research package; a subsequent actual completed quest fact permits the existing verified disposal advice.

Build, data validation and the final full Vitest run are recorded with the PR. Browser results are automated Chromium against the app with a mock bridge, not real RuneLite. No installed program, player save or live character was modified. Full phase-specific and heterogeneous-source acquisition parity remains open under T06/T07; do not replace this protective floor with a claim that all reserves are now optimally allocated.
