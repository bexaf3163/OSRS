# Training availability versus suggested brackets

Partial T11 follow-up after per-item bank quantity certainty. This is not in the first audit preview EXE.

## Reproduced behavior

The training router used `to` both as the end of a suggested bracket and as a hard availability limit. A faster unlocked method disappeared above that boundary. A synthetic 50-to-55 scenario reproduced selection of a slower later method while the faster method's suggested range ended at 40.

## Changes

- Keep unlocked repeatable methods in the candidate list above `to`. Existing `from`, mode and quest/skill prerequisites still apply. One-time quest reward brackets remain unchanged.
- Compare existing rate/cost/effort/risk evidence. If comparable rate data is absent, use the authored bracket as a preference instead of fabricating a speed or permanently excluding another method.
- Unchecked supplies remain available and disclosed, but no longer win a readiness tie against confirmed preparation simply because their view says READY. Known missing quantities are not invented.
- The first path leg uses the actual recommendation. Action count and its displayed level come from that selected leg, avoiding zero actions or an expired target when retaining an older method.
- Shopping requirements follow the same selected method. Remove the old bracket from their acquisition prose, since that bracket is not an eligibility condition.

## Reviewed consequences

S6-02 can retain fly fishing after 40 using the existing catalogue's rates and effort labels; its arrow, rod/feather requirements and unchanged Fishing 50 completion stay in sync. A player who already owns the lobster pot can still receive that preparation-aware option. No new rates, locations, mechanics or game facts were introduced.

The generated DEFAULT_PLANS diff was reviewed: S6-02's level-40 default retains fly fishing; additional differences document explicit Relaxed versus Balanced choices for Cooking, Crafting, Fishing and Mining. Old automatic-switch-at-40 tests now assert an unlocked useful method and its matching requirements/coordinates. Every-method watch tracking is retained. The old tracking-only regression no longer oscillates in its existing matrix after unknown-ready priority was corrected; it is asserted stable instead of requiring the bug to exist.

## Evidence and remaining scope

TypeScript/build, data validation (0 errors/warnings), all 1,676 Vitest tests in 128 files and Java testClasses passed. Focused browser stabilization/items/skill cases check retained fishing selection and future goal at 390/1280, with no horizontal overflow or console errors. Full cumulative CI remains an independent gate; no live game or player save change is claimed.

Not complete T11: the catalogue still needs independently verified minimum unlocks versus recommended start ranges, current rates by level/setup, actual material budgets, unlock uncertainty and broader skill coverage. Existing `from` remains the conservative eligibility floor; this change does not assert every data entry is an exact game unlock. Whole-goal time projection still uses current-method rates and needs a separate multi-leg measured-rate audit. Gear's active-style/current-versus-future benefit remains separate work. Do not treat this as a newly researched comprehensive skilling guide.
