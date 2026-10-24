# Superheat starter recipe — partial T11

The Skills method previously checked Magic43/Smithing15 but could claim preparation without any ore or runes. The existing method resolver now supplies a physical starter bag: 25 unnoted iron ore, 25 nature runes and100 fire runes. A confirmed owned Staff of fire substitutes fire runes only with an explicit equipment requirement; banked/noted supplies still need withdrawal/unnoting. Unread stock/skills remain unchecked. Clear spare items first; 25 ore plus two rune stacks occupy27 slots. Keep coal banked to avoid making steel instead.

This uses the same method needs/evaluation/projection and watch list, without a new panel, state store, shopping list, price engine, spell automation or save/protocol change. No Java production code changed.

A partially consumed bag remains usable while at least one complete recipe is carried. Preparation follows that bag's remaining cast count; only an exhausted ingredient requests the next starter batch. Casting once must not flip the recommendation just because 24 ore remain instead of25.

Local gates: all1,921 Vitest/152files, TypeScript/build and data0errors/warnings pass. Nine recipe regressions cover all inputs, both unlocks, unknown stock, noted ore, worn/banked staff substitution, no-staff casting and canonical projection. Final cumulative browser/portable acceptance is pending. The earlier ranged preview does not contain this block.

After consumed-bag and Ranged banked-food follow-ups: all1,923 Vitest/152files, build/data pass. Ten Superheat recipe regressions now include partial-bag completion. Fresh browser/portable CI is still required.

Scope is deliberately partial: the actual S6-04 route still needs complete spell-dependent progression, acquisition/net budget and current-method integration. Its Nature-only fallback is not fixed by this helper. Low/High Alchemy still require target selection and full costs; splash setup must be verified. No full-goal funding, universal staff-family support, measured speed or live-game result is claimed.

Sources checked: https://oldschool.runescape.wiki/w/Superheat_Item and https://oldschool.runescape.wiki/w/Iron_ore . No current prices copied.
