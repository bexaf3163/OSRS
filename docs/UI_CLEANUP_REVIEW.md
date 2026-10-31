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

## Queued after cleanup — useful bank stock, not repeated shopping trips

Owner request2026-10-31: all skills should consider a budget-aware purchase of upcoming useful tool/weapon/gear tiers and a practical consumable reserve at the same Exchange visit. Reuse existing milestone/goal demand, Shopping, acquisition routing and funding. Respect the actual stopping goal, known stock, unread bank, current-kit/food/travel costs and unknown prices. Future items may remain banked and must not become current carry/equip/readiness blockers. Do not assume future earnings, buy redundant grades or spend GP automatically. Implement after the current cleanup/map work; avoid a new settings/menu stack.

## Cleanup implementation / remaining review — 2026-10-31

Implemented locally, not yet published: retired Appearance/preview/Compact/Inspector/font/panel/custom zoom paths; exclusive Copy Report collection; Journal matrix and exclusive split display/calculations; conflicting catalogue roadmaps and Reference training tables. Shared internal goals, duration formatting, actual logs/CLI telemetry, active helper/training flags, updates, storage and native pinning remain.

The completed canonical Plan now shows its reached-checkpoint state, without obsolete stage-goal notes for explicit checkpoint/preparation/tracked targets. Quest point selection remains in the full map: the Where-preview CSS no longer hides the nested dialog's picker. The single-map preview, retry and Betty quest-point navigation pass dedicated browser scenarios. The available Wiki base atlas is archival2019 imagery, not a claim of a current-world map; metadata selection/coordinate projection and directions are independent of image availability.

Cross-section searches found and qualified static Smithing platebody/fastest advice, a universal melee level order, GE-only Ranged purchasing advice and a universal Ranged-style claim. This is not a complete revalidation of every factual table or guide. Keep useful reference data and legacy resume consumers.

Still to review with the Skills work: non-training Reference facts/tables/FAQs in src/data/skills.json; guide-only/members text in src/data/skills/*.json and member skill data; authored Path text against current projected instructions; Gear comparison explanations/unknown data; Shopping current-activity versus remembered filter/empty states; Money catalogue eligibility/quote provenance. Runtime navigation and unit/native tests do not establish every external game fact or actual performance rate. Full browser CI and exact Portable receipt remain release gates; real-game acceptance remains Claude's.

Architecture, evidence boundaries and the complete prioritized takeover plan are in CLAUDE_TAKEOVER.md. Buy-ahead remains queued after cleanup; do not mark it implemented merely because conditional whole-goal demand already exists.
