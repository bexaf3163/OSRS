# Already-reached pure training prerequisites

Partial T05/T13 producer follow-up, after the second preview snapshot. Not included in `audit-test-3174b90e`.

## Reproduction

Skipping S7-04 (Agility 25), S8-04 (five skill goals) or S8-06 (Prayer 43) left the dependent quest with a hard route blocker even when every producer level was already known to meet its goal. Three real-route regression cases failed before repair. This did not mean skipping was proof of completing a quest; it meant actual reached levels were ignored for pure training producers.

## Contract

`dependencyFacts` composes the existing quest facts with positive equivalence for a skill-type producer whose completion trigger contains only skill levels and no item/carryover objective. Every goal must have a finite known level at least its target. Missing/low/invalid levels add no completion fact, so a skipped producer stays blocked. The existing explicit-done fallback remains unchanged; the consumer's own entry requirements still check actual levels.

The same facts feed readiness, queue consumers through the readiness engine, the preparation chain, game auto-completion's next-step selection and the manual completion transition. Known quests retain precedence. Item-bearing training (for example Attack 40 plus 50 Big bones), carryover items, partial quest stages and unknown quest completion cannot be inferred from a high level. No route ID, save mark, order or completion condition changes; reaching a goal does not silently rewrite a skip mark into done.

Player-state known levels can come from the live game or the existing profile fallback, following the current requirements contract. This is not a claim of a live measurement. Session and character guards in the bridge remain in place.

## Acceptance and remaining scope

Local full Vitest passed 1,707 tests in 129 files. Focused cases cover all three real producer edges, incomplete/low/NaN levels, all-goal conjunction, unchanged skip marks, next-step/chain parity and excluded quest/item/carryover types. Build/TypeScript, check-data (0 errors/warnings), Java testClasses and narrow/wide prerequisite browser scenarios passed. Cumulative clean-install/native CI remains the next acceptance gate.

Still open: equivalent acquisition for non-skill producers, distinguishing real prerequisites from convenience-only authored edges, consumer-specific subsets of a multi-skill preparation step, partial quest/cursor/carryover behavior and live RuneLite lifecycle. This does not certify all 67 route entries as feasible or optimally ordered.
