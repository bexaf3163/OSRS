# Skills quest rewards require completion evidence

Partial T05/T11 continuation after the HUD and Shopping blocks. Skills' useQuestDone callback returned true for isClosed(routeStepId) before looking at live quests. A skipped Knight's Sword or a stale manual done mark could therefore hide the quest's reward step from the roadmap/followed skill projection although the game did not report the quest complete.

The existing callback now delegates to a pure questRewardDone adapter in skillGuide.ts. A non-null live list is authoritative, including a known empty list and a list containing a different quest. While the list is null, explicit isCompleted is the manual fallback; skipped is not proof. Non-quest methods have no reward. Case-insensitive quest-name matching is preserved. This reuses the existing skill guide/progress systems, not a new state engine.

Seven regression cases cover these boundaries; three reproduced failures after extracting the old callback unchanged, before the repair. Local full Vitest suite: 1,774 tests in 137 files. TypeScript/build, check-data 0 errors/warnings and Java testClasses passed. Existing focused skill browser scenarios and cumulative CI/actual portable E2E provide additional acceptance. No new live game session is claimed.

No quest XP numbers, levels, unlocks, route IDs, completion triggers, saved marks, followed-plan settings, bridge protocol or HUD code changed in this block. Manual-only use remains possible while facts are unknown. The public roadmap callback is shared by the followed plan and its Shopping projection, so they receive the same corrected proof.

This does not solve all quest-proof consumers. Gear's old free-toll helper still treats a closed Prince Ali Rescue route entry as proof, and its quest list is built from manual route marks rather than live completion. Review those with the existing canonical dependency/player facts before a separate repair. Complete continuous skill progression, correct supplies, compound Fishing/Cooking and other route/phase work remain in the main backlog. Do not claim an updated set of guide rates or a finished Skills redesign.
