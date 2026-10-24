# Magic route supplies — unreleased2.74.3

S6-04 now follows the existing method resolver instead of requiring only an unparsed Nature rune quantity while describing several different spells. Route ID, optional/bond branch and Magic55 completion remain unchanged. No save/protocol/HUD/menu migration.

## Implemented

- Real Strike recipes reuse spells.json/STAFFS. Wind Strike is a budget fallback. A higher unlocked Strike is chosen only when at least20 casts of its ingredients are confirmed owned; no unknown prices or proceeds fund an assumed upgrade. Its actual name and needs travel in the existing TrainingPick to desktop, preparation and game snapshot.
- A confirmed owned elemental staff substitutes only its element and carries an explicit wear requirement. Banked/noted inputs require the existing withdrawal/unnoting path. Unreported stock stays UNKNOWN. Low rune supply requests a100-cast starter batch; a funded20-cast stack is usable. These are preparation thresholds, not whole-goal estimates.
- Starter combat food uses recognized food/healing metadata; current carried food remains usable. Instructions require removing metal armour and checking that damage/XP actually arrive. Magic attack/weakness/DPS and whole-goal survival are not simulated.
- Superheat uses the existing physical recipe (CODEX_SUPERHEAT_HANDOFF.md), Magic43/Smithing15 gates and current castable bag. Its NPC highlights clear instead of keeping the old combat target. Unknown entry requirements cannot beat known-eligible methods by an optimistic rate.
- Low/High Alchemy and splashing remain visible manual alternatives. They cannot be automatic defaults while target selection, margin or negative Magic attack/location setup is unverified. Their existing references remain available behind the same details control. Alchemy lists nature/fire inputs; splash disclosure includes the Lumbridge no-XP restriction. No auto-casting or spending.
- Shared projection removes redundant weaker skill gates. Current food includes healing metadata for the plugin. Combat ledger now includes this mixed combat/utility stage; generated readiness/native/default fixtures were reviewed.

## Verification

Initial full run exposed missing raw fallback icons/Requirements text and a browser-test nullable boolean; corrected without relaxing checks. New tests cover Magic1/25/35/43/54/55, supported staff/input substitution, unknown stock/skills, actual unlocks, current recipe/target parity and manual alternatives. Browser390/1280 scenarios cover Strike -> prepared Superheat -> worn staff plus a partially consumed bag. Latest full local build/data/tests are recorded in CLAUDE_NEXT_SESSION.md; fresh cumulative Chromium/actual portable acceptance is required. Java608 passed against the updated native fixture. No live-game result is claimed.

Final local gates: all1,936 Vitest/153files, TypeScript/production build and data0errors/warnings pass. No failed or skipped local check is claimed as successful. Local headless browser startup remains blocked before assertions, so use the remote Chromium gate.

Final target-clear follow-up: a previously projected combat step also clears Cow highlights when changed to Superheat. All1,937 Vitest/153files, build and data0errors/warnings pass after this additional regression.

## Remaining

This is not a complete cost/time/weakness optimizer. Bolt/Blast families, combination/battlestaves, other trainers, verified worn Magic attack, full spellbook/access checks, affordable whole-goal supply budgeting, alchemy target selection and measured rates remain open. Wind Strike fallback may be slower than a properly supplied stronger method; no fastest claim is made. Existing S2-04 comparison still describes cast XP/full replacement cost, not net purchases. Keep the single preparation pipeline and do not introduce a separate funding state.

Sources checked: https://oldschool.runescape.wiki/w/Free-to-play_Magic_training ; https://oldschool.runescape.wiki/w/Superheat_Item ; https://oldschool.runescape.wiki/w/Iron_ore ; https://oldschool.runescape.wiki/w/Splashing/Guide ; https://oldschool.runescape.wiki/w/Low_Level_Alchemy ; https://oldschool.runescape.wiki/w/Fire_rune . No prices copied into runtime data.
