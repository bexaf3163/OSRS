# Claude continuation — authoritative takeover

Updated2026-10-24. This replaces the rolling historical status entries. Start from the latest remote main, not an old local branch/chat prompt. Check for subsequent owner/Claude commits before editing. Do not reset them or replay included stacked commits.

## Delivery and decisions

Current batch: coordinated app/plugin **2.74.3**, protocol6, cumulative PR44. Owner requested finishing this batch, pushing main and handing remaining work to Claude. Publication remains in progress until the regular Release/artifact gates finish; an audit preview is not a stable release.

**All in-game tests belong to Claude**, by explicit owner decision. Read [CLAUDE_IN_GAME_ACCEPTANCE.md](CLAUDE_IN_GAME_ACCEPTANCE.md). Automated/native evidence is separate. Launch RuneLite through OSRS Path; preserve player-controlled gameplay, saves and credentials. Unreachable/completed encounters stay unverified.

Original Claude checkout and RuneLite Optimizer were not edited. HDOS implementation was not authorized/included. Owned equivalent/better armour is accepted; buy only needed affordable upgrades, respect restricted Defence and preserve food money.

## Completed — do not redo

- Save/recovery: supported formats/migrations, damaged/future-original preservation, physical write receipts/retry, profile validation/conflict quarantine, unreadable native files distinguished from missing saves. [Native reads](CODEX_NATIVE_READ_HANDOFF.md), [stabilization](CODEX_STABILIZATION_HANDOFF.md).
- Secondary backups: per-target/phase errors survive Settings reads; successful latest copy cannot hide failed dated copies. Individual I/O failures report COPY_INCOMPLETE while healthy profiles still copy. Preserve originals, clear after successful retry; primary receipts remain independent. [Backup errors](CODEX_BACKUP_ERROR_HANDOFF.md).
- Quest/progress: skip is not a prerequisite or received quest XP; live evidence wins, unread facts retain explicit manual fallback. Account Sync excludes unproven ancestors. Explicit reached consumer skills can satisfy shared producers without unrelated goals. [Progress](CODEX_PROGRESS_PROOF_HANDOFF.md), [Gear proof](CODEX_GEAR_QUEST_PROOF_HANDOFF.md), [skill proof](CODEX_SKILL_QUEST_PROOF_HANDOFF.md), [dependencies](CODEX_SKILL_DEPENDENCY_HANDOFF.md).
- Items/preparation: exact quantities, noted/usable/bank separation, per-row uncertainty, recipe deficits/unnoting, physical potion doses/slots, selected-route reserves/cleanup protection. Method tools preserve unknown unreported tiers; equipped quantities participate in state/readiness. [Items](CODEX_ITEM_READINESS_HANDOFF.md), [tools](CODEX_METHOD_TOOLS_HANDOFF.md).
- Bridge: identity/quest-set/known-state fingerprints, logout clearing, delayed-response/profile guards, server-lifetime apply ordering. Commands64KiB/snapshots384KiB in UTF-8 bytes, explicit rejection. Bounded asynchronous SSE, slow-reader expiry and completion replay. Broader restart/live acceptance remains open.
- S4-03: Attack40 alone completes; no mandatory50-bone quota/Hill Giant detour. Surface level13 Giant frogs and justified optional Defence10 use existing combat/prep/navigation. [Frogs](CODEX_FROGS_HANDOFF.md).
- Armour/prices/dates: structured affordable armour prep follows adopted plan/owned alternatives. Migrated consumers share runtime quotes; failed refresh loses live label, known IDs can quote without name mapping. Unnecessary display dates removed; internal timestamps retained. [Armour/prices/dates](CODEX_ARMOUR_PRICES_DATES_HANDOFF.md). Full joint budget remains open.
- S6-02 Fishing/Cooking and S6-03 Mining/Woodcutting hand over to unfinished skills with current tools/supplies/location/highlights; unknown second skill cannot complete the pair. [Handovers](CODEX_SKILL_HANDOVER_HANDOFF.md).
- S6-01 Ranged: actual F2P trainer, owned ordinary bow/compatible equipped arrow counts. Worn20+ continues, below20 requests100; mixed types cannot form one equipable stack. Banked food does not revert trainer; absent food can select safer monks. [Ranged](CODEX_RANGED_PREPARATION_HANDOFF.md).
- S6-04 Magic: current Strike recipe/name/unlocks; owned elemental staff substitutes only when worn; food and Superheat Magic43/Smithing15 inputs. Castable partial bags continue; utility handover clears old combat highlights. Unverified alchemy/splash remain manual, not automatic ready/defaults. Original Magic55/IDs/optional branch retained. [Magic](CODEX_MAGIC_ROUTE_HANDOFF.md), [Superheat](CODEX_SUPERHEAT_HANDOFF.md).
- Funding: separate tools/inputs, affordable batches/replenishment, known-total proceeds; no hypothetical drop/self-transfer income. Owned ingredients avoid irrelevant purchase waits; subsequent replenishment and sale liquidity remain constrained. [GE pacing](CODEX_OWNED_INPUT_PACING_HANDOFF.md).
- Gear/Shopping/HUD: exclude current-DPS downgrades hidden by future averages; stock-up reserves are not one carried bag. Keep one OsrsPathGuideOverlay/HudModel; actual collection outranks incidental XP. [Shopping](CODEX_SHOPPING_SCOPE_HANDOFF.md), [HUD](CODEX_HUD_COLLECTION_HANDOFF.md).
- Release/dependencies: fullJava/browser/isolated actualportable gates; trusted SHA256 update/cache/handoff verification; compatible lock/cache/source-map repairs and residual advisory assessment. [Dependencies](CODEX_DEPENDENCY_HANDOFF.md).

## Verification boundaries

Current partial-copy source: **1,944 Vitest/153files, TypeScript/build and data0errors/warnings pass locally**. Fresh cumulative browser/fullJava/actualportable CI is required before publication, including both new actual IPC backup failure/retry scenarios.

Preceding source8591a78949a0f014f9a204a7c4426eaae8c51d04 passed [Checks40087680050](https://github.com/bexaf3163/OSRS/actions/runs/40087680050):1,941Vitest/build/data/fullJava/completeChromium/isolated actualportable. [Preview](https://github.com/bexaf3163/OSRS/releases/download/audit-test-8591a789/OSRS-Path-audit-test-8591a789.exe), SHA256 **0bc84b20f5f66a3bd617bb71c27c147a4e147bf0af91c1a641d32823854c2968**, matches log/asset, but predates both backup fixes. Earlier Magic87d856ff passed Checks40086397787 with1,937Vitest/Java608/browser/portable. Previous stable2.74.2 passed Checks39689971665/Release39689971634 with1,783Vitest/Java604/browser/sourceElectron/portable. Older receipts do not verify newer source.

Only Codex live review: preview402222c9,2026-10-21, plugin2.74.0/protocol6/World316. It does not verify subsequent repairs. [Live record](CODEX_LIVE_REVIEW_2026_10_21.md). No new in-game tests for this delivery. User later reported Black armour/shield/Adamant scimitar and level13 frogs. Prior Attack30/Strength21/Defence1/HP24 are historical; reread current levels/boosts/bank/cash. Reported bone income is not measured net profit/live pricing.

The earlier six local sandbox failures are historical: permitted loopback and workspace TEMP/Vitest threads resolved them. Current full suite has no failures. Local Chromium/Edge startup remains unavailable; CI supplies browser/native evidence without weakened gates.

## Remaining work and exact takeover

1. Confirm latest main/release, versions and artifact digest. Perform reachable [in-game checks](CLAUDE_IN_GAME_ACCEPTANCE.md), recording exact state/evidence and PASS/FAIL/NOT REACHABLE. No gameplay automation, spending/destruction or forced save reset.
2. Reproduce one remaining priority issue from [CODEX_AUDIT_BACKLOG.md](CODEX_AUDIT_BACKLOG.md), fix narrowly, verify and update evidence. It retains **allT01–T17 and all30 Gemini dispositions**. Partial means unfinished; this release does not finish the entire audit.
3. Do not redo completed tool/skill/pricing migrations above. Current source decides whether an old proposed defect exists.

| Open area | Required work |
| --- | --- |
| T01 | Conflict-resolution UX; first-write.bak failures; restart error history; invalid/unsupported skipped-copy diagnostics; runtime external file changes/broader recovery. Preserve quarantine. |
| T02 | Real isolated two-version update/post-update save recovery. Existing digest tests are not an old-to-new restart. No new fixture transport/test seam implemented. |
| T03 | Remaining exact-ID/legacy consumers, special-tool eligibility/mixed-version parity. Never substitute physical tools twice or unreported facts as absent. |
| T04/T08 | Broader account/restart/session and partial-rejection acceptance. Preserve working freshness/order/limits guards. |
| T05 | Equivalent acquisition proof, consumer subsets, branch/cursor recovery, Shield of Arrav/partial-quest acceptance. No repeat completed quest to reacquire items. |
| T06/T07 | Other quest phases beyond Waterfall: Lost City spells/food/exit/Entrana, Demon Slayer collection vs fight kit, Monkey Madness returns/slots, Tanglefoot mechanics. Verify current authoritative sources. |
| T09 | Measured frame-time/telemetry overhead. Bounded SSE is implemented; no unmeasured FPS claims. |
| T10 | Broader verified trainers, actual styles/boosts/prayers, attainable gear, joint food/potion/loot slots, complete acquisition/travel/banking/objectives/cost/risk. No universal amulet ranking/arbitrary stat score. |
| T11 | Whole-goal spell budget, other Ranged weapons/consumption, worn Magic attack/weakness/DPS, verified rates/trainers. Wind is budget fallback, not fastest guarantee. Alchemy net targets/splash setup remain manual until proven. |
| T12 | Actual4hGE windows/used/shared limits, partial-trip averaging, full shop/rune/acquisition detours. Owned-input pacing is not full market-window modelling. Verify proceeds/teleport components/unlocks/cooldowns. |
| T13 | Continuous feasible fresh/poorF2P/Members/partial-quest routes across current67steps: entry/cost/prep/risk/output/reserves/completion/nextstep. Enumeration is not this audit. Preserve IDs/saves; deferred Doric/Knight's Sword reorder needs migration/owner decision. |
| T14/T15 | Remaining Path simplification, equal-state fonts/DPI/zoom/layout/click/position checks, actual launch/plugin/post-update acceptance. One current action/conditional warning. |
| T16 | Eight propagated moderate builder advisories remain assessed; no force fix/downgrade. Recheck upstream reachability/clean-install artifact evidence. |
| T17 | Consolidated KNOWN-ISSUES/final review/regression evidence after remaining work. No premature whole-backlog completion. |

Read CLAUDE.md, PROJECT_GUIDELINES.md and CLAUDE_REDESIGN_HANDOFF.md. Preserve IDs/completion goals/notes/skips/profiles/manual stock/adopted plans and PRESENT/MISSING/UNKNOWN. Reuse playerState → readiness → preparation → UI/HUD; no duplicate engines. Keep one expandable guide, no forced speed switches or wiki-sized defaults; Money stays separate.

Inspect/reproduce before editing. Add meaningful regressions, retain original assertions. Run build/fullVitest/check-data/Java testClasses (fullJava for plugin behavior), affected browser/native checks and actualportable gates. Distinguish simulated renders from game screenshots. Publish main without force/new coordinated version for behavior changes; never overwrite releases. Keep this file and the relevant detailed record current.
