# Confirmed loadout phases

Stacked after physical write acknowledgement. Route IDs, progress data and protocol 6 are unchanged. The full-quest Shopping/watch requirements remain available.

## Contract and implemented scope

Readiness and the preparation plan share a loadout selector. Explicit canonical line boundaries can distinguish several bank visits inside one coarse quest variable. Waterfall Quest now maps `usePebble` to the tomb and `getFinalItems` to the waterfall dungeon. These existing instructions and their ordering were checked against the local questStages data and the [Quest Helper source](https://raw.githubusercontent.com/Zoinkwiz/quest-helper/master/src/main/java/com/questhelper/helpers/quests/waterfallquest/WaterfallQuest.java).

Required supplies for a later loadout stay in the existing later disclosure and do not count as current readiness or current bag additions. Finished-only uses disappear from current preparation. Shared tools such as the rope become current again when the next loadout needs them. An acquired quest item becomes required at its explicit phase; if missing, its existing acquisition instructions/NPC are used instead of recommending a GE purchase.

The provider retains the last confirmed cursor during a manual peek, scoped to the active character and step. Logout, reconnect, a different character/step or an authoritative null cursor clears it. Missing/invalid phase metadata does not claim a confirmed current phase. The existing phase card highlights only a confirmed phase; it no longer always calls the first inventory current. Quest-stage hiding also rejects manual peeks.

## Evidence and remaining acceptance

The final full suite passed 1,663 Vitest tests, including null-cursor/invalid-boundary guards. The reviewed golden change affects only Waterfall's opening requirements in six scenarios: later runes are no longer current prerequisites. TypeScript, build and data validation passed. The new data check rejects a configured phase boundary whose canonical line does not exist.

The focused Chromium run passed tomb selection, later rune supplies in the game payload, manual future-view stability, the confirmed transition within stage 3 and cleared-cursor behavior. These are mock-bridge observations, not real-game evidence.

T07 remains partial. Monkey Madness I's return trips need verified non-monotonic phase metadata; none was guessed. Complete merging of every phase-card take/leave/free-slot rule into the shared acquisition and food model, heterogeneous phase quantities, and live quest replay remain open. This patch scopes the existing required-item contract; it does not claim that every textual loadout is now a fully enforced executable inventory.
