# Consumer-specific skill prerequisite equivalence

Partial T05/T13 follow-up after fourth preview 09a6b956; not included in that EXE.

Lost City required the entire multi-skill S8-04 preparation entry even when its explicit Crafting/Woodcutting requirements were reached. Animal Magnetism needs a different subset of the same producer. The previous whole-producer equivalence still demanded unrelated goals before either consumer. Two route-level reproductions failed before repair.

DependencyFact now accepts an optional consumer. A pure level-only producer can satisfy that particular edge when the consumer explicitly requires it, has overlapping skill requirements, and all of the consumer's explicit entry skills are known, finite and reached. Without a consumer, unfinished producer goals remain unfinished. Quest/item/carryover producers are not inferred from skills. Low, missing or invalid consumer skill readings do not bypass the edge.

The common blockers and recursive preparation chain pass their actual consumer through the existing resolver. Next-step selection, quest availability and the bridge's completion preview already use those common blockers. No IDs, route order, saved skip/done marks, quest proof or completion triggers change. This does not globally mark S8-04 complete or remove the later Lost City requirements after Animal Magnetism.

Verification: seven domain cases cover both consumers, incomplete/invalid levels, retained carryover and absent explicit requirement metadata. Full local Vitest passed 1,758 tests in 135 files. Build/TypeScript, check-data 0 errors/warnings, Java testClasses and 390/1280 px browser level-transition scenarios passed. The browser retains S8-04 as skipped while removing the redundant Lost City blocker. Cumulative clean CI is tracked on the draft PR. No live-game acceptance is claimed.

This reuses the route's existing entry requirement data; it does not refresh or prove every quest requirement against current primary sources. Convenience quest-order edges, equivalent item acquisitions, other phase/branch cases and complete continuous route feasibility remain open.
