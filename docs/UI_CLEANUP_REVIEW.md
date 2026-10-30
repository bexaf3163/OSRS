# UI/content cleanup — owner decisions, 2026-10-31

Preserve the accepted Ledger layout/fonts and working gameplay, progress, update and bridge functionality. Remove retired features with their exclusive state, handlers, IPC, styles and tests; retain shared infrastructure used by surviving features. Do not equate code presence with live-game verification.

| Surface | Current finding | Required action / status |
|---|---|---|
| Skills Plan | A second static Wiki roadmap contradicts the current personalized staged plan (Ranged screenshot) | Confirmed; remove competing roadmap for catalogue-backed skills. Audit static Reference training tables/intros too. |
| Unfinished skill guides | Some have guide-only rates or no method catalogue (see SKILLS_COVERAGE.md) | Review separately; label unpersonalized guidance honestly and record specific stale sections. Do not fabricate supported mechanics. |
| Settings Appearance | Legacy theme, density, compact view, font/panel/zoom controls and preview are retired by owner | Remove complete feature paths, including header Compact and obsolete settings persistence. Preserve Ledger defaults and native DPI/resizing. |
| Settings Diagnostics | Copy-report feature retired | Remove UI and exclusive report collection code. Preserve operational error/startup logging and watchdogs used elsewhere. |
| Settings Training | Priorities, auto-preparation and Defence-at-1 have active planner consumers | Keep working controls; remove obsolete Zen/Compact explanation and duplicate presentation. |
| RuneLite helpers | Places, bank tags, pace, level import and upgrades have actual consumers | Retain; verify toggles and update stale descriptions. Live behavior remains Claude acceptance. |
| Journal | Visible stage-goal forecast matrix is obsolete/misleading | Remove visible matrix, not the internal goals used by planning and prerequisite calculations. Preserve quests and session records. |
| Maps | Pinned 2026-08-12_a tile request returns404; current message incorrectly asserts no connection | Repair current map source/fallback and failure handling. Remove duplicate preview, preserve world map and in-game destination actions. |
| Path | New canonical prepared/staged actions exist; historical authored content can still be surfaced | Audit all visible ribbons/cards against current normalized step. Pending. |
| Gear | Active equipment and upgrade calculations must survive cleanup | Audit descriptions, duplicate/legacy displays and source certainty. Pending. |
| Shopping | Current preparations, ownership and funding must survive cleanup | Audit stale copy and redundant controls, preserve shared allocations and quantities. Pending. |
| Money | Active earning/funding sessions must survive cleanup | Audit catalogue/current-session presentation and descriptions. Pending. |
| Reference/search | Shared item/NPC dossiers and data remain functional | Audit old training advice versus current engines; preserve useful source/level/XP data. Pending. |

Record concrete findings and completed changes here as each surface is reviewed. Do not treat pending rows as verified or delete internal engines because their old screen is removed.
