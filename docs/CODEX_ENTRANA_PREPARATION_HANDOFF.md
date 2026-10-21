# Lost City: acquire the axe inside the quest

Focused T07/T13 correction after the dependency assessment. Not in the first audit preview EXE.

S9-01 already says to bank all weapons/armour including the axe, board Entrana, then kill dungeon zombies until an axe drops. Its required-item data nevertheless marked the axe as something to obtain before departure. The regression reproduced that contradiction in `preflightItems` before the change.

Mark the existing Bronze axe requirement `inStep: true`; no new item, quantity, coordinate or mechanic is introduced. The existing readiness/shopping/serialization machinery then excludes it from departure requirements and bank withdrawals while retaining it as an acquired-during-quest item. The quest machine and its axe-observation requirement remain unchanged. A banked axe must not generate "take it" before boarding.

Evidence: absent and banked-axe integration cases; browser checks of the actual outgoing preparation payload and withdrawal list; reviewed golden diff (only the six S9-01 readiness rows remove the axe); reviewed Java active-target fixture (only S9-01, removing departure checklist/guide item). All other route rows remain unchanged. Full local Vitest passed 1,678 tests in 129 files; TypeScript/build, check-data (0 errors/warnings), focused browser scenarios and full Java suite passed. The local dependency versions still predate the lock refresh; updated-dependency acceptance comes from clean CI and the cumulative follow-up CI.

This fixes the departure contradiction, not the entire encounter. Tree Spirit spell/rune/food quantities, allowed equipment, current teleport exit/cooldown, zombie acquisition, missing/unknown state and live Entrana boarding/fight validation remain open. Do not claim the quest was played or that the character is safely provisioned merely because the axe is no longer requested early.
