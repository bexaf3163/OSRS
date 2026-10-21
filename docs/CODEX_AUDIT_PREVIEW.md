# OSRS Path audit preview — test build, audit still in progress

This cumulative block preview fixes Gear quest evidence as well as retaining all preceding Skills, Shopping and HUD repairs. A skipped Prince Ali Rescue no longer waives the toll, live completed quests unlock their gear without a route mark, and live NOT_DONE overrides stale manual completion. Explicit manual full-quest completion is retained while live facts are unread; partial quest milestones do not unlock full-quest gear. No DPS formula, route completion or saved state changed. Read docs/CODEX_GEAR_QUEST_PROOF_HANDOFF.md for scope and evidence.

The Skills repair is retained: a skipped route quest no longer counts as a received reward; live quest facts override manual marks, and explicit done is retained as an offline fallback. Existing guide data, XP, saved marks and route completion are unchanged. Read docs/CODEX_SKILL_QUEST_PROOF_HANDOFF.md for evidence and limits.

The Shopping scope repair is retained: Stock up replaces the misleading Next trip label; purchase quantities cover the selected steps, not one inventory. Calculated quantities, saved scope, bank withdrawals and exchange payloads are unchanged. No new panel or mode. Read docs/CODEX_SHOPPING_SCOPE_HANDOFF.md for the small wording repair and its limits.

The earlier HUD block is retained: collection shows Collect 50 Big bones instead of its incidental Attack 34 projection. Reaching projected XP cannot announce the next phase while collection is unconfirmed; food preparation still takes priority. Ordinary skill-training cards retain their XP progress. No combat estimate, completion trigger, saved state or protocol changed. Read docs/CODEX_HUD_COLLECTION_HANDOFF.md for reproduction and scope.

The app's internal version remains **2.74.0**; identify this revision by the EXE filename/SHA. This is a working review candidate, not a completed audit or a replacement for the stable release. Stable auto-updates ignore prereleases. Read the attached CLAUDE_NEXT_SESSION.md before continuing development. Every codex/audit-block- branch in this repository publishes its separate portable EXE only after all existing gates pass, as requested by the owner; fork branches cannot publish.

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
- Required combat loot and food alternatives preserve unreported per-item bank quantities. Confirmed stock reduces the goal or covers a trip; an unknown remainder cannot justify a purchase.
- Supported but conflicting profile lists are preserved rather than silently mirrored. One conditional warning pauses unsafe profile-list changes and game sync pending recovery review.
- Rare profile edits confirm the physical native write before publication/reload, retain failed edits for retry and reload Main correctly after deleting the active alternate profile. Frequent progress writes retain their existing debounced contract.
- Claude's single expandable game guide is retained. This is primarily a correctness preview, not the final Path/Skills/Gear redesign.

## Test safely

1. Keep your current working EXE and its `OSRS-Put-data` folder. Close OSRS Path before starting this preview.
2. Put this EXE in a **new separate folder**. Never replace the working EXE or copy this build over your only save. Existing automatic backups may restore your progress into that folder; this does not establish a fully separate backup namespace.
3. Inspect Path, Skills, Gear, Shopping and Money. Open the bank in-game before judging bank ownership; unknown information must stay labelled unknown.
4. Start RuneLite through the preview app if testing its plugin. Avoid running two OSRS Path versions at once. Your game login and actions remain manual.
5. Report the preview filename, step ID, actual equipment/levels and screenshots for any contradiction. Keep test changes out of the original data folder. Do not reset/import over your original profile for this test.

The preview's Windows CI runs TypeScript/build, data validation, all Vitest tests, all Java tests, full Chromium UI smoke and native E2E against the actual portable EXE in an isolated folder. Native E2E uses a bridge fixture and test profiles, not a live account. The downloadable EXE is the same verified artifact; its SHA-256 is included separately.

## Still open

Full combat trainer coverage, complete joint food/potion/loot packing, acquisition/travel and gear budgets; verified skill unlock/rate/budget coverage, compound Fishing/Cooking handover and actual combat-style Gear comparison; all route steps as a continuous progression; supported profile-conflict recovery UX, native read/secondary-backup errors and remaining phase/unknown-state edge cases; Path simplification; residual dependency advisories; real-game screenshots and lifecycle/update acceptance. Automated estimates are not measured live combat timings. Profile receipts are not a transaction across native/browser storage or a power-loss guarantee. See `docs/CODEX_AUDIT_BACKLOG.md` and the individual handoffs in the source tree.

No claim of zero regressions or completion is made. The older third preview was launched successfully through Computer Use on the player's PC on 2026-10-21; RuneLite started, World 316 was selected, the bridge returned protocol 6 and the real character's stats, and the app showed Connected. This does not establish live acceptance of this fifth preview or a complete route playthrough. The separate Windows runner verifies the exact downloadable artifact.
