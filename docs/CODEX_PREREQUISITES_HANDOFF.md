# Prerequisite and milestone stabilization

Stacked after the item-readiness contract (`cc0ff6d`). This changes route eligibility, not saved IDs, ordering or the single HUD layout. No player save or installed game was used.

## Behavior

- A skip closes the route queue but does not prove a hard prerequisite. Soft suggestions still do not block. Manual done remains a fallback only when game quest facts are unknown.
- A known completed quest satisfies its prerequisite even if its route step is unmarked/skipped; known NOT_DONE overrides an old done mark. The same facts feed readiness, route selection, quest availability, completion previews and the game plan's next-step caption.
- Completion previews and auto-advance check prerequisites and actual known QP. A confirmed automatic event proves only that event's milestone. No predicted quest-point reward is invented while the next game status is pending.
- Fairytale II S9-03 now stops at its existing stage-40 unlock goal: the walkthrough, stage lines, machine roots/conditions, travel targets and protected quest ingredients exclude the later cure and Gorak encounter. Its Dramen staff is explicitly required. Skipping S9-03 no longer unlocks fairy rings.
- The generated combat audit no longer calls this partial goal a required Gorak fight. Existing progress IDs and the milestone trigger remain unchanged.

## Evidence

- TypeScript/build and data validation passed (67 steps, zero validator errors/warnings).
- 1,633 Vitest tests across 119 files passed. New regressions cover skip/done/live facts, QP-aware preview, auto-advance and partial quest scoping through the actual outbound guide and quest-item protection.
- Focused Chromium scenarios passed: a live unfinished prerequisite blocks an old manual done mark; a QUESTS update clears it without rewriting progress. The full Java suite passed (591 tests). A full browser run is also in progress; repeat the build/browser gate after the final remaining selector consumers were wired to the shared dependency facts.
- Generated active-step and readiness fixtures changed only for the intended S9-03 scope/staff; the generated combat audit loses that obsolete fight.
- The independent upstream Java oracle still checks all in-scope vectors. For the full quest's stage-40-and-later vectors it explicitly checks that those machine roots are absent; impossible synthetic pre-40/hideout cases must resolve only to an allowed pre-unlock instruction. Existing milestone tests continue checking completion at and above 40.

## Sources and remaining acceptance

The [OSRS Wiki quick guide](https://oldschool.runescape.wiki/w/Fairytale_II_-_Cure_a_Queen/Quick_guide) separates ring access from the later cure/skill requirements. [Quest Helper's FairytaleII source](https://github.com/Zoinkwiz/quest-helper/blob/master/src/main/java/com/questhelper/helpers/quests/fairytaleii/FairytaleII.java) identifies the Godfather permission as quest stage 40. These support the existing milestone; no full quest completion is inferred from it.

T05 remains partial: live cursor/reconnect and Shield of Arrav branch acceptance are not completed. Existing non-quest producer `requires` still use explicit route completion; replacing a producer with equivalent already-owned items needs the exact requirement/reserve contract, not a blanket removal of dependencies. A QP-gated destination may wait for the game's updated count. Live RuneLite and native screenshots have not been taken for this change.
