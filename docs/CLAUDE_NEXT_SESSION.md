# Claude continuation - current authoritative handoff

Updated 2026-10-29. Read this first; open historical records only for the area being changed.

## Current delivery

**2.80.19 candidate: shared Members gathering.** Members oak/teak now dispatch through existing skillingRates; all six current Woodcutting catalogue methods have models, not all possible tree/tool mechanics. Registry rebuilt against primary Wiki data. Teak uses ordinary chopping, not the removed mixed 34k–93k guide range. Seers oak is approximate/drop-only; supported Isle of Souls teaks have verified spawns/drop-only. No invented banking income. Shared physical-tool lookup now uses heldExact: an owned unsupported Infernal axe no longer becomes a pretend Bronze axe rate. Unsupported explicit planned tools and F2P use of Members methods return no model estimate. Synthetic new-content regressions and shared gathering/funding tests cover this. Full publication receipt follows gates; portable18 remains verified below.

**2.80.18 is published and verified.** [Normal portable release](https://github.com/bexaf3163/OSRS/releases/tag/v2.80.18).

- Product source: `0a5f1cbea75961ef6c4865eaa17d6bde5be05cb6` on main. Later documentation-only commits do not change this binary.
- Checks `40871190338` and Release `40871190286` passed full app/Java/desktop/native/isolated-portable gates. Local build/types, 2,280 tests/195 files, data checks, 725 full desktop assertions plus 88 final focused assertions, 92 isolated native assertions, bridge JAR and Java testClasses passed.
- Downloaded EXE: 102089080 bytes. SHA256 `1c13640e6cbeb1a973204bab1affc8de5dc30bce1c05bdc1619798ed57ad0b70` matched GitHub asset metadata and SHA256SUMS. No 2.80.18 release action remains.
- Train has one recommendation with visible preparation/unknown/funding/risk states; Plan holds analysis/alternatives/roadmap; Calculator and Reference retain tools/levels/F2P evidence. Dark desktop and light/150% fixture screenshots were inspected. Existing route-step TrainingCard presentation is preserved. No save, formula, route, protocol or launcher changes; no live-game acceptance claimed.
- Automated bridge fixtures and renders are not live-game evidence.

## Owner decisions

- English, concise communication; batch related work and checks. Avoid speculative repairs and repeating completed audits/releases.
- **Desktop only:** no mobile/phone development or phone-only QA. Preserve desktop resizing, DPI/text scaling, themes and accessibility.
- Recurring defects belong in shared engines and affected consumers, with different/new-content regressions. New content declares supported requirements through existing schemas; new mechanics still need explicit support. No method/quest/item-ID workaround for a generic bug.
- Preserve IDs, route order, completion goals, profiles, notes, skips, manual ownership and adopted plans. UNKNOWN is not zero or MISSING. Future simulated levels/gear stay in copies.
- Keep the compact interface and one expandable game guide: one current action, at most one leading warning, folded details. Money stays separate.
- Keep `-Xmx1024m` minimum, `-ea` and all other JVM arguments in `electron/runelite-launcher.cjs`, including refactors. OSRS Path's direct Java launch ignores RuneLite launcher config.json.
- Publish verified implementation batches to main with a coordinated version and normal portable release; wait for gates and verify the actual downloaded hash. Never force-push or overwrite assets. Documentation-only changes need no app version/rebuild.
- **Live-game acceptance belongs to Claude.** No automated movement, combat, skilling or spending. Use current admitted character facts, not historical screenshots/stats.

Read [CLAUDE.md](../CLAUDE.md) and [project guidelines](../PROJECT_GUIDELINES.md). For interface changes also read [the redesign handoff](../CLAUDE_REDESIGN_HANDOFF.md).

## Completed - preserve, do not redo

| Releases | Delivered behaviour |
| --- | --- |
| 2.80.8-11 | Protected persistence/recovery, skipped-copy diagnostics, copy-history receipts and pre-write external revision guards. These are not a watcher, automatic merger, cross-process lock or power-loss guarantee. |
| 2.80.12 | RuneLite heap invariant above. |
| 2.80.13 | Confirmed quest-entry food through readiness/preparation/Shopping/funding/cleanup; physical alternative withdrawals in TS/Java; consumer-specific skill proofs. Lost City Magic13 is strategy-specific; four Tuna are a setup buffer and 65 casts a guide allowance, not survival guarantees. |
| 2.80.14 | F2P skill checkpoints, folded comparisons/sources, reached markers from admitted profile levels; desktop-only QA scope. No route-goal/save migration. |
| 2.80.15 | Unit shop prices separated from shared acquisition fees; deduplicated totals; chosen shop price retained in funding. Al Kharid10gp/Karamja60gp are declared allowances, not exact route/fare/discount calculations. |
| 2.80.16 | Shared material alternatives, primary reservations, stock spent once, UNKNOWN/manual/notes handling, physical withdrawals/stack slots; acquisition shortages do not deduct ownership twice. |
| 2.80.17 | Method selection consumes that same allocator. A newly declared recipe regression proves selector/preparation agreement. Complex overlapping kit pricing remains unknown through its conservative guard. |

Relevant modules: playerState/readinessEngine, materialStock, foodAdvice, oneTrip/prepPlan/prepEnvelope, sourceRouter/purchaseCost, trainingRouter and funding/need under `src/lib`. Food healing, equipment, usable tool tiers and doses retain specialised engines. Existing combatRoute, skillingRates, processingRates and methodRates provide the combat/gathering/processing models; do not duplicate them. Utility processing already includes five Firemaking log recipes, Bones/Big bones burial, Superheat iron and four F2P Runecraft altars (source f6a0e82). On 2026-10-29, 36 processing/funding-adapter tests passed. These are implemented basic models, not a claim that every Members/utility method is modelled; do not rebuild them from historical open labels.

## Remaining work and limits

**Skills coverage is not complete.** [The tested coverage ledger](SKILLS_COVERAGE.md) distinguishes all 23 guides from personalized models. Melee/Ranged/Magic combat, Woodcutting/Fishing/Mining gathering, Smithing/Cooking/Crafting/Fletching/Herblore processing, and basic Firemaking/Prayer/Runecraft/Superheat models exist. Not every method/level is modelled. Agility/Thieving/Farming have guide-only catalogue rates; Construction/Hunter/Slayer/Hitpoints use guide rows. Do not claim the owner's full personalized-skill requirements met, or build duplicate engines. Extend existing dispatch only with supported mechanics and sources. Whole-goal supply/acquisition economics and live acceptance remain partial.

1. Perform reachable [live acceptance cases](CLAUDE_IN_GAME_ACCEPTANCE.md), recording exact build/character/state and PASS / FAIL / NOT REACHABLE. Codex does code/automated checks; Claude does live acceptance.
2. Select a **reproduced current issue** from [the audit ledger](CODEX_AUDIT_BACKLOG.md). It retains all T01-T17 and all 30 Gemini dispositions. Historical open/unreleased labels are not proof of a current bug; check source and later receipts first.
3. Broad unfinished areas include route/branch/quest-phase feasibility, full acquisition/travel/future supply economics, broader source-backed combat/skill models, and live lifecycle/performance/interface acceptance. Current releases do not claim the entire historical audit complete.
4. Do not add a watcher, automatic save merge, market-window optimiser or unsupported Members mechanic just because an old record mentions it. Reproduce and scope the actual required behaviour. The Doric/Knight's Sword reorder remains deferred; no new migration is authorised by this documentation cleanup.
5. Future-only food eligibility work for aliases not declared by the actual route was parked outside the repo. It did not ship and is not an automatic next task. No speculative Members-food/mobile work.

The cancelled initial 2.80.16 candidate had a 30-second portable bridge-indicator timeout. Its native fixture lacked the real 15-second SSE keepalive; corrected fixture and diagnostics retain original assertions/timeouts. The original intermittent cause is unproven; no production bridge repair was claimed. Final16 and17 CI passed. If it recurs, inspect diagnostics instead of reopening the cancelled candidate or blindly retrying.

## Verification and resumption

Inspect git status/diff and relevant sources. Codex's local `.codex/work-state.md`, when present, records interrupted work; preserve valid uncommitted changes. Agent directories and runelite-bridge/bin are not release inputs.

Run required build/full app tests/check-data/Java testClasses, full Java for plugin behaviour, affected desktop/native checks and complete existing CI/portable gates. Never weaken assertions or invent PASS results. Do not rebuild unchanged product code for documentation-only receipts. Update this file and the live checklist.

All older commits, digests, detailed fixes, architectural decisions and open areas remain in [the complete preserved history](CLAUDE_SESSION_HISTORY_2026_10_29.md). Its original content is retained; it is an archive, not another current task list.
