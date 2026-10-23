# Progress proof — 2.74.3

## Changed

- Removed AccountSync's withRequired expansion. A completed Goblin Diplomacy route entry previously added Prince Ali Rescue and shopping ancestors to the list labelled game-confirmed. Route convenience links do not establish completion. All directly observed quests/pure skill goals are still collected by syncCandidates; unverified earlier steps remain behind explicit manual review. Existing saved marks, skips, notes, undo and profile gating are preserved.
- Account sync does not infer remaining item or carryover stock from level attainment. Required levels must be finite and observed. The existing plugin completion triggers remain unchanged; this repair does not add a second ownership evaluator.
- StepCard dependency labels now reuse blockersOf with current engine dependency evidence. A skipped prerequisite or live contradiction is not shown green; live completion and reached consumer-specific entry skills can satisfy a displayed dependency without changing the producer's saved mark. Accessible text says met, not globally done.

## Verification

Three newly added unit cases failed before repair (mixed loot, carryover, non-finite levels); focused account-sync tests pass after repair. The full local run has 1,783 passing tests and four bridgeLimits failures caused by the current sandbox denying loopback connections (a direct localhost fetch reports EACCES). Local browser startup and Gradle daemon communication are blocked by the same restriction. Do not label those checks passed locally or weaken them. Build/TypeScript and data validation pass; require the exact-tree full GitHub Java/browser/Vitest/portable gates before main publication.

Browser regression covers a fresh Goblin Diplomacy account at 390/1280px: only the actual quest is confirmed; shopping remains manually reviewable; a known unfinished quest is excluded; applying sync preserves notes/skips and cannot mark ancestors. Existing quest/skill prerequisite browser scenarios now also check dependency colors before/after live evidence changes. The old expansion-specific unit test was removed with the deleted private helper; generic skill/item/profile tests remain.

## Scope

No live-account progress was synchronized, no existing marks were rewritten or cleared, and no new in-game acceptance is claimed. Full native read-error handling, conflict resolution, runtime source changes and broader route/skill work remain open in the consolidated backlog. Keep the single HUD and minimal UI.
