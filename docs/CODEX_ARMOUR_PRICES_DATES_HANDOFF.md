# Owner request: armour, live prices and dates

Full requested specification: [OWNER_ARMOUR_PRICING_DATES_REQUEST.md](OWNER_ARMOUR_PRICING_DATES_REQUEST.md). This follows the tool-requirement repair. It is not a claim that all three features are done.

## Structured armour preparation — source implemented, acceptance pending

CI receipt for source06d450325d42c84bebb157faef696bce3ecd49e1: run40006124537 passed all1,836 Vitest tests, TypeScript/build/data, full Java and the actual isolated portable EXE. Browser checks passed the wear-to-training transitions at390/1280px, but failed two scope assertions (upcoming supplies were counted as current armour) and stopped at an assumed default-plan status link. The follow-up scopes the assertion to NOW armour, verifies no armour withdrawal, and explicitly chooses an alternative when testing the intentionally hidden baseline banner. Full corrected CI remains required; no gate was removed and no production behavior was changed for these test assumptions.

S4-03 now carries the catalogue IDs for head/body/legs/shield: Black full helm, platebody, platelegs (plateskirt accepted), kiteshield. This is a route preparation policy, not an OSRS quest prerequisite. Every standard-build trainer choice first trains Defence10 on surface cows using Defensive, then equips usable owned equivalent/better pieces or obtains only needed upgrades, then resumes its selected trainer. Explicit keepDefenceOne bypasses the policy. Already reached Attack40 does not force this preparation. Route IDs, save schema and Attack40-only completion remain unchanged; no bone quota returns.

The current phase projects through the existing combat pick, shared readiness/preparation/shopping/checklist and protocol6 snapshot into the one HUD. Required armour carried in the bag says Equip; banked/noted items say withdraw/unnote; neither ownership nor an unread equipment snapshot completes the equip phase. Actual worn usable armour proves completion. Shared physical equipment ownership preserves unknown alternatives while accepting known stock. Equip tasks have no bank/GE navigation when the item is already carried; unknown state keeps the task open.

Owned usable equivalents precede purchases. Current shared quotes can choose the cheaper acceptable Black legs/skirt and price the actual selected units for desktop/game. Unusable higher tiers do not satisfy the kit. Training estimates continue to use actual worn gear: no benefit from unbought armour is credited. Shopping/armour purchase time and a joint armour/food budget optimizer remain unmodelled and explicitly disclosed; do not claim those are complete.

Local verification: TypeScript/build and data checks pass (0 errors/warnings). Full Vitest: 1,830 pass of1,836; only the six established sandbox loopback/temporary-rename failures remain. Final equip-task follow-up: 21 focused tests and TypeScript pass. All production Java sources compile directly against cached dependencies; Checklist/HudModel focused JUnit tests pass (50). Full Gradle remains blocked by daemon loopback permissions. New 390/1280px browser scenarios cover carried equipment, actual snapshot flags, wear-to-training advancement and overflow; they still require execution in final CI, alongside the full Java/browser/isolated portable gates. No live gameplay verified. This source block is NOT in the previously linked9f37646f portable.

## Style gear quote integration — source implemented, CI pending

The existing Magic/Ranged equipment fold now reads the shared quote board through usePriceView and itemPrice. Its separate mount-only mapping/per-item fetch loop is gone; board refreshes update advice and displayed prices. Missing quotes do not revive database planning prices or claim the item is untradeable. Current/cached/unavailable estimates are labelled per item, including cached alternatives. The summary includes known purchases only, one item per slot; it is not a complete ammunition or trip budget.

The fold also reuses gearQuestEvidence: a live incomplete quest overrides a stale route mark. Banknotes no longer count as wearable bag gear. The existing slot heuristic and fold remain; this is not full Magic/Ranged DPS, complete bank gear comparison or a new loadout planner. No HUD or save/protocol change.

Local validation:35 focused style/price/quest-evidence tests pass, TypeScript/build and data checks pass (0 errors/warnings). Full Vitest:1,830/1,836 pass, with only the same six sandbox loopback/temporary-rename failures. Four browser scenarios cover390/1280px current/missing quotes and overflow; final browser/portable CI remains required. No live acceptance claimed.

## Date presentation — implemented and CI verified

Removed calendar/snapshot dates from Gear's last-known header, Settings progress/import preview, backup metadata, Journal/Money totals, Money method verification, combat/food/spell references, StyleGear, travel reference metadata and Wiki item price timestamps. Source links, stale/offline Gear disclosure, counts and requirements remain. The backup action uses the existing toast to confirm success rather than displaying a date. No new panels.

Internal timestamps remain unchanged: progress ordering/import/export, profiles, last-known gear selection, price-side freshness/cache/backoff, journal windows, backups, logs, native telemetry/screenshot filenames and build/data provenance. Date-based exported backup filenames serve recovery/version identification and remain functional. Diagnostic event times remain troubleshooting data. The Java guide contains no calendar-date formatter; the discovered native formatters name diagnostic screenshots/telemetry files, and were retained.

Dead display-only date exports and the Wiki drawer's date-formatting helper were removed. Static reference labels no longer imply their prices are live. This does not implement the pending comprehensive live-price presentation.

Browser regressions cover the real Settings save/import views at 390/1280px, confirm dates are absent while internal ordering timestamps/notes remain intact, and retain Gear's stale snapshot disclosure without its calendar date. No live-game acceptance is claimed.

## Shared preparation pricing — implemented and CI verified

The existing quote store now feeds the shared readiness engine. Required-item chips, current sub-step items, preparation rows and the protocol-6 plan use a common market estimate. Physical quantities multiply the actual ID quote; cached/old-side and opposite-side estimates are labelled. Database planning fallbacks cannot appear as current quotes. Identified tradeable items without quotes say "Price unavailable"; unidentified/untradeable items receive no invented GE value. Potion doses remain priced as actual bottle packages by Shopping, not multiplied as bottles here.

Preparation source selection receives an explicit missing quote instead of falling back to the card's baked GE price. Fixed NPC prices/tolls remain fixed. Existing ownership UNKNOWN/withdrawal semantics are unchanged. A new engine snapshot updates costs and its per-item acquisition advice without spending GP. This is not a new aggregate affordability optimizer.

The app sends an optional bounded price label in each preparation line. Java validates it and displays supporting costs only in expanded preparation/hover details, keeping the collapsed single HUD unchanged. There is no Java network provider and no protocol bump; old clients ignore the additive optional field.

Historical calendar dates and dated GE-price claims were also removed from route prose. Fixed quest cash rewards, tanning fees, training quantities, route IDs/triggers/requirements/pacing/carryover and all internal timestamps remain. Five generated active-target fixture descriptions were refreshed from production; structural comparison confirms only acquisition text changed. Undated hardcoded GE-price prose elsewhere still needs classification/migration.

Validation: TypeScript/build and data checks pass (zero data errors/warnings). Local full suite: 1,824 pass / 1,830, with only the six known sandbox loopback/temporary-rename failures; maxWorkers=4 avoids an unrelated overloaded-worker import timeout seen on the first run. The Java suite is locally blocked by the same Gradle daemon loopback restriction. New pricing/engine/envelope focused coverage passes; browser scenarios at 390/1280px cover quantity costs, missing quotes, actual bridge parity and overflow. Final-tree GitHub Java/browser/portable gates remain required. No live game test is claimed.

## Cumulative verification

Verified production source **9f37646ffdd373e65b4e5083d56b036717ecd8e3**: [Checks run 40000648722](https://github.com/bexaf3163/OSRS/actions/runs/40000648722) passed all 1,830 Vitest tests/143 files, TypeScript/build, data validation (zero errors/warnings), full Java, complete Chromium smoke and isolated actual portable EXE checks. The 390/1280px price/absence, date-preservation and tool-uncertainty browser scenarios all passed. [Test portable](https://github.com/bexaf3163/OSRS/releases/download/audit-test-9f37646f/OSRS-Path-audit-test-9f37646f.exe), internal version2.74.3, SHA-256 **3f81d98d0dc4a542393cac622c32930311b5862ace36ad83320803f887b62ca3**; the asset digest matches the actual isolated-EXE test log. Stable/main publication remains held. This is automated/packaged verification, not live gameplay or completion of the broader audit. Later documentation-only corrections do not change that verified production tree.

## Remaining required work

Pricing foundation follow-up: the shared quote store now marks retained boards stale after an offline response or thrown refresh, preserving quote timestamps and allowing recovery back to live. Previously it kept a live label after both failures. Explicit item-ID pricing can also read a valid quote when the separate name-mapping request is unavailable. Three focused pricing suites pass (35 tests), with before-fix reproductions. This is a correctness repair to the existing provider, not completion of all price consumers. The later preparation/Java presentation block is described above.

Local foundation validation: TypeScript/build and data checks pass; 1,814 of 1,820 tests pass, with only the same six independently reproduced sandbox network/rename failures. This pricing follow-up is newer than the tool/date CI revision and must receive final-tree CI before publication. Existing deliberately labelled baked planning estimates are not yet removed from all consumers; do not present them as live prices.

Owner decision: accept owned equivalent/better armour and buy only needed upgrades. Do not force a four-piece Black purchase when suitable owned equipment already covers those slots. The new structured source policy above accepts owned equivalent/better gear and preserves explicit restricted builds; final acceptance remains pending.

1. Armour + Defence10 source integration is described above. Complete final CI/browser/portable and live acceptance; preserve the distinction between route preparation and real quest prerequisites.
2. Prices: reuse `src/services/pricesApi.ts`. It already batches latest/mapping/hour feeds, caches, deduplicates concurrent calls, backs off after failures and retains side-specific quote timestamps. `buyPrice` can substitute an unavailable opposite side; full quote boards preserve actual missing sides. Audit every consumer before promising live acquisition costs. Distinguish GE estimates, fixed NPC shop prices/fees, planning assumptions and untradeable values. Keep current stock/unknown semantics and avoid new Java network fetches.
3. Complete all requested app/bridge/HUD scenarios and cumulative CI, including stale/missing price behavior, affordability, below/at10Defence and preservation of internal timestamps. Stable release remains batched.

## Armour continuation constraints

The baseline slots discussed with the owner are head/body/legs/shield, with owned equivalent/better gear accepted. Existing gear.json supplies Black full helm 1165, Black platebody 1125, Black platelegs 1077 or plateskirt 1089, and Black kiteshield 1195, all requiring Defence10. Reuse those records and existing canWear/missingRequirements/relevantDefence checks rather than duplicating bonuses or unlocks. The OSRS Wiki Black equipment page confirms the Defence requirement: https://oldschool.runescape.wiki/w/Black_equipment. These are route preparation choices, not a game quest prerequisite.

Do not satisfy an equipment phase from ownership alone: notes, banked gear, an unknown equipment snapshot or an unequipable higher tier are not worn protection. Train Defence before the equip phase, retain keepDefenceOne, preserve completed Attack goals/IDs/saves, and use current actually worn gear for combat estimates. The existing combat-plan phases, readiness engine and one snapshot/HUD must share the preparation action. Include acquisition/food-budget limits honestly; do not silently credit the benefit of unbought armour. The source integration above now follows these constraints; final acceptance remains pending.
