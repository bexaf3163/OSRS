# Real-PC review supplement for Claude

Use with CLAUDE_NEXT_SESSION.md. This is a limited live check, not a full route playthrough.

## Exact tested revision

The explicitly authorized EXE was third preview OSRS-Path-audit-test-402222c9.exe, in a new separate folder with its own data and backups disabled. It includes application repairs through #27, not the fifth candidate's later changes. RuneLite 1.13.1 launched through OSRS Path; World 316 and the existing Play buttons were selected. No credentials, game movement, combat, resource gathering, banking, purchases or save import/reset were performed. Original player installation/save was not replaced.

## Observed

- The app eventually opened despite Sky launch_app initially reporting no targetable window. A subsequent window inventory found both OSRS Path and RuneLite. Earlier local shell failures are not evidence this native launch failed.
- The bridge responded inGame=true, protocol=6, pluginVersion=2.74.0. Desktop Connected, QP43 and total271 matched live data. Relevant levels: Attack30, Strength21, Defence1, HP24, Magic25, Fishing32.
- The fresh isolated profile began at S1-01 and offered to mark 26 inferred steps done. This offer was not accepted. Selecting S4-03 from All stages did not reset the original profile.
- Show in game sent activeStepId=S4-03. One guide card appeared. Header click expanded the card; another click collapsed it. No old duplicate HUD plates were seen. One capture timed out, but refreshed inventory/capture recovered and confirmed the collapsed state.
- The expanded card showed 50 Hill Giants, then the cow-training phase. This was visual observation only; no kills, loot or timing calibration were done. Saved position/Alt-drag/restart persistence remain unchecked.
- Gear opened and showed real worn Adamant scimitar, Amulet of power and Iron kiteshield with empty helm/body/legs. Its context was S1-13 because most entries in the fresh isolated profile were unfinished; do not call that loss of the original route.
- Shopping opened with current/next-step rows, coin shortfall and old-bank label. Money opened with a ranked list and conditional unknown-tool/insufficient-funding labels. These are rendering/connection checks, not validation of every recommendation or rate.
- RuneLite logged a login NullPointerException in its built-in npcunaggroarea plugin and cache overlay warnings. The inspected stack did not point into com.osrspath; do not silently alter another plugin or claim the entire client log is error-free.

## Remaining concrete UI follow-ups

1. S4-03 collapsed headline said Train Attack to 34 while the desktop's current task was collecting 50 Big bones. The 34 appears to be incidental projected XP during the collection phase. Prefer the actual collection objective as the headline and retain the style/XP information as secondary detail. Reproduce on the fifth candidate before patching; test both item-only and ordinary training phases without breaking current/next-phase transport.
2. Third-preview Shopping's Next trip tab showed Salmon x142, which reads like a whole-goal purchase rather than one carried load. Verify quantity semantics on the fifth candidate and label purchase reserve versus carried bag explicitly without another panel/tab. Current joint food/potion/loot packing remains incomplete.
3. Third-preview unknown-bank preparation initially said buy food, then resolved after live equipment/inventory arrived. Later #30/#31 source repairs specifically address stock certainty; do not reapply a guessed fix to an older build. Reproduce known/unknown/delayed snapshots on the fifth candidate.
4. The setup step still received future cow-armour advice on the fresh profile. #38 suppresses unrelated Magic/Ranged hints, but broader contextual/one-action Path simplification remains open. Avoid another global redesign while correcting this.

The fifth EXE is verified separately by its own cumulative GitHub checks and Windows packaged fixture E2E. This supplement must never be presented as live verification of that newer EXE.
