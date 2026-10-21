# HUD collection objective over incidental XP pacing

Continuation after the fifth preview db4d3fa9 and its real-PC review. Partial T10/T14, not complete combat/route acceptance.

## Reproduction

The real S4-03 collection phase sent an explicit guide.plan.now (Collect 50 Big bones from Hill Giants) and an XP projection for the incidental Attack gain. HudModel prioritized unfinished pace, showing Train Attack to 34. If that projection finished while item ownership remained unknown/insufficient, the pace-done path could also promote plan.next. Neither XP nor the projection percentage establishes collection progress.

Three regression tests failed before repair: explicit collection versus active projected pace; projected XP done while collection still current; required bank food followed by the collection objective. Ordinary training and its completed-phase tests remain intact.

## Repair boundary

Quest stages retain first priority. An explicit plan.now now uses the existing stepActivity path without the unrelated pace. It supplies the headline/current place/next-phase disclosure, while the existing preparation/preflight/funding/danger rules still wrap it. The card does not invent an item percentage or remaining item count. The app remains responsible for advancing from real item evidence and publishing the next current phase. Ordinary training still uses trainingActivity and XP progress.

No calculations, trainer choice, food quantity, route ID, completion trigger, container observation, plan wire field, profile or save format changes. The single expandable overlay and all click/layout code remain. No extra panel, switch or wiki prose was introduced.

## Verification

Full local Java suite: 604 tests, 0 failures. Vitest: 1,767 tests/136 files. TypeScript/build and check-data 0 errors/warnings passed. The collection fixture was added to HudRenderTest's existing width/scale/height matrix and picture exporter; its targeted render verification is recorded separately. CI must run the final full Java/browser and actual portable EXE gates before this branch's preview publishes. Test renders are not live RuneLite screenshots, and this updated plugin has not been launched on the player's account.

The owner's per-block publication request is implemented by retaining the existing gated, same-repository prerelease job for codex/audit-block- branches. This never skips the portable E2E or updates the stable release. Read the actual Actions conclusion and asset digest; an interrupted or failed block has no accepted EXE.

Remaining work includes per-item collection progress, full inventory packing, the misleading next-trip versus goal-purchase label, broader contextual Path simplification, actual multi-style Gear comparison, continuous skill/quest-phase feasibility, and live acceptance in the main backlog. Do not call these solved by this display repair.
