# Keep melee upgrade hints out of spell/ranged training

Partial T11/T14 follow-up after fourth preview 09a6b956. Not included in that EXE.

The Magic visual review showed a Suggested gear change banner recommending a scimitar. PathWide intentionally showed a future-fight banner on steps without foes, but did not distinguish Magic/Ranged training from ordinary preparation. All six restricted/unknown/lifted narrow/wide browser cases reproduced the unwanted banner before repair.

A small shared meleeHintApplies predicate reads the existing explicit style, Magic plan, selected method/pace and skill-goal metadata. Known Magic/Ranged training does not borrow that future melee hint, and an explicit step GearPrompt uses the same guard. PathWide passes its actual selected step to the banner. Melee and ordinary preparation behavior is retained. No purchase/stat calculation, fight selection, HUD transport, saved preference or route data changes.

Verification: 1,767 Vitest tests in 136 files passed locally; nine context cases cover the four Magic/Ranged route entries, retained melee/preparation behavior and a selected ranged method. Build/TypeScript, check-data 0 errors/warnings, Java testClasses and six 390/1280 px browser scenarios passed. The Magic ownership/funding scenarios remain intact. Fresh cumulative CI is tracked on the PR.

This removes misleading desktop clutter. It does not implement Magic/Ranged DPS comparison, special quest damage rules, actual-style/boost/prayer comparison, or claim that the game HUD has been tested. Existing StyleGear and the separate Gear page remain available. Do not call this the complete Gear redesign or a complete multi-style combat model.
