# Skill handover repair — S6-02

Source implemented; final cumulative CI and live acceptance pending. This follows the fully CI-verified pricing source e5c5e9a4. It does not complete every T11 case.

## Behavior

The method picker reads the unchanged combined completion trigger, with the declared primary skill first. Fishing50 switches S6-02 to its unfinished Cooking goal instead of releasing all tools. The store's existing method projection feeds the same step to the page, readiness, Shopping, snapshot and single HUD. Cooking supplies, destination and highlights replace obsolete Fishing metadata. No save migration, route ID change, progress reset or parallel completion engine was added.

An unread second skill produces a level-check action and an UNKNOWN readiness requirement, with no stale fishing arrow. Only both known reached goals release supplies. The bank watch contains tools/ingredients for both halves before switching and remains within the existing40-item bound.

Cooking methods now prepare actual raw ingredients:26 meat/fish per starter bag or13 grape/water-jug pairs. Mixed raw beef/chicken is accepted through the existing alternative-quantity engine. These are starter bags, not whole-goal quantities or minimum theoretical costs. Bank old tools/surplus and withdraw owned ingredients first. When comparable pace evidence is absent, balanced selection prefers an owned usable recipe over unmeasured new purchases. Known bank stock remains a withdrawal, not a purchase. Unknown stock stays unknown.

Raw-meat/fish defaults use the existing Barbarian Village fishing-spots location and its nearby permanent fire. This avoids inventing range/guild access; Cooking tuna does not require Fishing35 when raw tuna is already available. Wine uses Edgeville Bank, without a range or guild requirement. Notes disclose burned food/bad wine and fermentation rather than promising XP on every attempt. Ingredient prices remain shared market estimates, never fixed GP claims.

Sources reviewed: [Barbarian Village facilities](https://oldschool.runescape.wiki/w/Barbarian_Village), [F2P Cooking training](https://oldschool.runescape.wiki/w/Free-to-play_Cooking_training), [Jug of wine](https://oldschool.runescape.wiki/w/Jug_of_wine), [Lumbridge Castle range access](https://oldschool.runescape.wiki/w/Lumbridge_Castle). Cached search extracts were readable; direct Wiki pages were robots-blocked. No live encounter or measured XP/time claim is made.

## Verification and limits

Thirteen regressions cover Cooking1/20/30/35/49, owned/banked inputs, mixed meat, unknown levels, unchanged trigger, completed goals and bounded watches. Existing Fishing/tool/chooser tests remain; their former Fishing-only completion assertion now proves the Cooking handover and both-goal completion. Generated DEFAULT_PLANS and the one affected active-target fixture were refreshed. The default-plan document now explicitly compares old ordering against the current catalogue, rather than claiming a historical snapshot.

TypeScript/build/data pass (zero data errors/warnings). Full local1,874/1,880 pass; only six established sandbox loopback/rename failures remain. Two390/1280px browser scenarios change Fishing49→50 and Cooking30→35 through SSE, checking ingredient/destination/trigger parity and no premature completion. They still require remote CI. Java code/protocol are unchanged; full Java gate remains required for the updated fixture/watch data.

Remaining: exact XP/burn-adjusted purchase caps, full price-aware recipe optimization, broader special-tool eligibility and real-game handover acceptance. S6-03 Mining/Woodcutting, S6-01 low-level Ranged and S6-04 spell batches are separate unfinished T11 cases. Do not mark the whole backlog complete.
