# OSRS Path audit preview — test build, audit still in progress

This third portable preview includes cumulative repairs through draft PR #27 (remaining collection combat in food/shopping projections). The app's internal version remains **2.74.0**; the EXE filename and this prerelease identify the audit revision. This is not a completed audit or a replacement for the stable release. Stable auto-updates ignore prereleases. The first `audit-test-978cb6d6` preview predates PRs #15–27; the second `audit-test-3174b90e` predates PRs #24–27.

## Included

- Progress recovery and reporting of physical save failures; SHA-256 update verification.
- Exact carried/noted/bank item quantities, explicit unnoting, recipe deficits and physical potion slots.
- Quest prerequisites versus skipped route entries, partial Fairytale II scope, session freshness and queued snapshot ordering.
- Bounded asynchronous plugin event output and slow-reader expiry.
- Selected-route item reserves and cleanup protection; affordable funding batches and separate tools/inputs.
- Confirmed Waterfall preparation phases.
- Combat objective sequencing with XP credit, conservative potion carryover, minimum required loot banking and removal of imaginary optional loot income.
- Per-item unknown bank quantities remain unknown; all potion-size quantities are needed for a complete bank total.
- Repeatable skill methods remain available beyond their suggested bracket; current map and game tiles follow the selected method.
- Gear rejects current-DPS downgrades caused by future Strength averaging and labels current versus training-window benefit.
- Lost City's axe is acquired inside the dungeon, not required before boarding for Entrana.
- Lossless browser profile-source validation and supported native backup selection, preserving unknown-format originals.
- Minimal dependency/lockfile repairs, with remaining build-tool advisories documented separately.
- Reached pure skill goals satisfy their route dependency without changing saved skip marks; quests/items/carryover still need their own proof.
- Native profile-source protection before mirroring/binding, with one conditional recovery warning and preserved compatible browser recovery.
- Contextual route explanations replace the universal amulet and wasted-Defence-reward claims.
- Food/shopping keeps the required Hill Giant collection workload after Attack 40; known bone stock reduces remaining kills without adding a new visible skill goal.
- Claude's single expandable game guide is retained. This is primarily a correctness preview, not the final Path/Skills/Gear redesign.

## Test safely

1. Keep your current working EXE and its `OSRS-Put-data` folder. Close OSRS Path before starting this preview.
2. Put this EXE in a **new separate folder**. Never replace the working EXE or copy this build over your only save. Existing automatic backups may restore your progress into that folder; this does not establish a fully separate backup namespace.
3. Inspect Path, Skills, Gear, Shopping and Money. Open the bank in-game before judging bank ownership; unknown information must stay labelled unknown.
4. Start RuneLite through the preview app if testing its plugin. Avoid running two OSRS Path versions at once. Your game login and actions remain manual.
5. Report the preview filename, step ID, actual equipment/levels and screenshots for any contradiction. Keep test changes out of the original data folder. Do not reset/import over your original profile for this test.

The preview's Windows CI runs TypeScript/build, data validation, all Vitest tests, all Java tests, full Chromium UI smoke and native E2E against the actual portable EXE in an isolated folder. Native E2E uses a bridge fixture and test profiles, not a live account. The downloadable EXE is the same verified artifact; its SHA-256 is included separately.

## Still open

Full combat trainer coverage, complete joint food/potion/loot packing, acquisition/travel and gear budgets; verified skill unlock/rate/budget coverage, compound Fishing/Cooking handover and actual combat-style Gear comparison; all route steps as a continuous progression; compatible-but-divergent profile sources, profile write receipts and remaining phase/unknown-state edge cases; Path simplification; residual dependency advisories; real-game screenshots and lifecycle/update acceptance. Automated estimates are not measured live combat timings. See `docs/CODEX_AUDIT_BACKLOG.md` and the individual handoffs in the source tree.

No claim of zero regressions or completion is made. Local native execution was blocked before window startup and local packaging hit an EPERM restriction; the separate Windows runner supplies artifact verification.
