# Claude continuation - current authoritative handoff

Updated 2026-10-30. Read this first; open historical records only for the area being changed.

## Current design baseline

Owner accepted Claude's Adventurer's Ledger2.81.1 (`57ec3ca`) on2026-10-30. Preserve its layout, controls and EB Garamond/Cinzel fonts. Current design contract: CLAUDE_REDESIGN_HANDOFF.md and REDESIGN_VERIFICATION.md. Functional WIP was backed up/stashed before fast-forwarding and reapplied without changing src/ledger, pages, App/main or the Ledger frame. No design issue identified during integration. Current Ledger desktop regressions are running without changing its presentation.

## Current delivery — 2.81.2 published and verified

[Normal Portable release](https://github.com/bexaf3163/OSRS/releases/tag/v2.81.2). Product source `6c2e4f41e33180fa4f7bb21d3ae849e952a49990` on main. [Checks](https://github.com/bexaf3163/OSRS/actions/runs/40973832545) and [Release](https://github.com/bexaf3163/OSRS/actions/runs/40973832590) succeeded, including Java, desktop, native and isolated-EXE validation. The downloaded `102439126`-byte EXE has SHA256 `f6c5eed9c79dcad468d6dcd9a07149e123323c050e0c9e3d1e48aea0f2a8ad1b`, matching the GitHub asset digest and SHA256SUMS. Tag/source and both CI head SHAs were verified. No 2.81.2 publication action remains.

Current design/fonts are preserved; no Ledger, frame, page, CSS or font files changed. Live-game acceptance remains Claude's task. Release-attached handoffs are source snapshots; this main-branch file carries the final verification receipt and current remaining work.

## Implemented functional batch 2.81.2

- Fixed the owner-reported starter grind in the shared planner. Declared method bands, tool/equipment unlocks and registered recipe/spell levels create useful review stages. Introductory methods retire at their declared end; efficient older methods otherwise remain eligible. methodPick carries the stage end into methodStep; final completion goals/IDs/saved marks stay intact. The visible plan previews six stages; the internal full path and goal-arrow estimate are not truncated.
- Ranged: seagulls are introductory through20; level10 barbarians21–25 use existing verified combatFoes data. Monks remain a cheap healing alternative; frogs become recommended from26 when the actual kit/food/budget support them. No assumed zero-damage safespot. Wizard is a clearly manual alternative: incoming magic/rune-drop income are not modelled, so it cannot become the automatic default. Verify NPC variants/highlights live.
- Standard bows upgrade at5/20/30, suitable owned same-tier longbows count. Missing basic bows are actual preparation/funding needs rather than silently retaining Shortbow. Arrow value uses shared max-hit/style/break math and current quotes; compatible equipped stacks have hysteresis, avoiding tiny price-driven changes. Armour/amulets remain usable, budget-aware shared StyleGear choices. Unknown cash/bank stays unknown; no cosmetic requirement.
- Future Ranged equipment is simulated only in copies, charging known equipment costs once. Each forecast leg carries its conditional kit; total arrows use those kits. This is not proof future purchases are affordable or a complete consumable-depletion simulation. Never apply projected levels/gear/cash to live state. Existing ranged incoming-damage calculations already used projected armour; no separate fix was necessary there.
- Optional checkpoints: Fish35/Cook35, Mine45/WC36/FM50, optional Magic55 and a membership choice without mandatory Bond shopping or GE travel. Cooking68 remains a separate funded Skills project. Preserve manual completion/skips/notes; no membership prerequisite is added.
- Shared model supplies survive without a named station/kit. Registry tools/materials/access items are watched before handover. F2P equipment hints for Fishing/Cooking/Mining/Woodcutting/Firemaking are reused by Skills/Optional; no invented amulet bonuses. Current-phase upgrade categories prevent irrelevant axes/melee purchases during Firemaking. Extended50/60 engine fixtures remain alongside actual checkpoint tests.
- Preserve accepted Ledger2.81.1 controls/layout/fonts. Functional TrainingCard text only; no Ledger/frame/page/CSS/font changes. Local build/types, zero-error/zero-warning data validation, 2317-test full unit suite, all826 Ledger desktop assertions plus focused posted-game-guide/bow-milestone checks, full647-test Java suite and 92-assertion native Electron smoke passed. Live-game verification belongs to Claude, per docs/CLAUDE_IN_GAME_ACCEPTANCE.md. Release publication and downloaded-EXE verification are complete (receipt above).

### Remaining after this batch

1. Claude: real-game acceptance for new Ranged equipment milestones, trainer transitions, food/ammo/unknown stock, shared peaceful handovers, saved progress and current Ledger UI. No mock screenshot is live acceptance.
2. Wizard magic-defence/food/rune-drop model and exact NPC-variant highlight proof remain unsupported; do not enable automatic selection prematurely.
3. Broader Members outfit advice/other peaceful-skill hints and full acquisition/consumable forecasts are not claimed complete. Existing shared models remain authoritative; add verified registry data, not per-step patches.
4. Parked processing-budget WIP remains outside the repo at ../osrs-audit-temp/parked-processing-2026-10-29/README.txt. Rebase selectively; never overwrite current method/forecast/UI fixes. No mobile work.

## Historical delivery — 2.80.20

**2.80.20 is published and verified.** [Normal portable release](https://github.com/bexaf3163/OSRS/releases/tag/v2.80.20). Source `c7306a1c53ad6fbba0ab5d92df6112f9de925240`; Checks `40937298434` and Release `40937298295` succeeded, including full Java, desktop, native and isolated-portable gates. Downloaded102090430-byte EXE SHA256 `c08a065eb47149709ac0ec705cf261a868374b76f323f78a468234cc4bb4600b` matches GitHub asset metadata and SHA256SUMS. No20 release action remains.

- Optional S6-01 now stops at Ranged40; no Bond or Ranged50 grind is a membership prerequisite. Stage6 is titled Optional F2P preparation before membership. IDs and manual progress are preserved.
- Existing rangedLoadout/StyleGear now select a full usable kit: owned/affordable shortbow, compatible physical arrow stack, armour and suitable amulet. Defence and quest unlocks are separate; reserve starter ammunition, food and basic armour before optional upgrades. Unknown stock/cash does not justify paid upgrades. No mandatory cosmetic ring/cape.
- The same selected kit drives method preparation, combat estimates and goal-arrow forecasts. Forecasts replace old melee armour and remove the shield for two-handed bows. Modelled style is Accurate below5, Rapid thereafter. Refills are starter buffers, not a full-goal guarantee.
- Model-rate cache keys now include budget, quest proofs, manual ownership, legacy-tool certainty and worn quantities; location-only movement still reuses forecasts. This prevents a paid-kit or unlock change retaining the old rate.
- Full desktop suite passed; ten focused ranged assertions cover banked outfit, equipped counts, trainer changes and food. Build/types and Java testClasses passed. Final unit suite: 2,297 tests/196 files; data checks: zero errors/warnings. CI/release gates passed. No live-game test claimed.
- Next: finish Optional peaceful checkpoints/order through existing Skills/F2P advice. Other processing WIP is parked outside the repository, not shipped. Latest owner requirement: both Skills and Optional must show practical peaceful-skill tools/equipment, real useful bonuses, and lighter/no armour when appropriate. Do not invent amulet benefits or force cosmetic purchases; keep Train compact.

## Previous verified delivery — 2.80.19

**2.80.19 is published and verified.** [Normal portable release](https://github.com/bexaf3163/OSRS/releases/tag/v2.80.19).

- Product source: `a999964705fa57c24063b4814b3d217667bcd7c3` on main. Later documentation-only commits do not change this binary.
- Checks `40914442923` and Release `40914443130` passed full app/Java/desktop/native/isolated-portable gates. Local build/types, 2,286 tests/195 files, data checks (zero errors/warnings), 10 Members-gathering desktop and five tool-proof desktop assertions, bridge JAR and Java testClasses passed.
- Downloaded EXE: 102090641 bytes. SHA256 `c908a7cab24f5ab96f8578cf5d7eb41349aa60337792834b382ddb61e23aedff` matched GitHub asset metadata, size, source commit and SHA256SUMS. No 2.80.19 release action remains.
- Members oak/teak now dispatch through existing skillingRates; all six current Woodcutting catalogue methods have models, not all possible tree/tool mechanics. Registry rebuilt against primary Wiki data. Teak uses ordinary chopping, not the removed mixed 34k–93k range. Seers oak is approximate/drop-only; supported Isle of Souls teaks have verified spawns/drop-only. No invented banking income.
- Shared physical-tool lookup uses heldExact: an owned unsupported Infernal axe no longer becomes a Bronze axe rate. Unsupported explicit planned tools and F2P use of Members methods return no model estimate. Synthetic new-content regressions and shared gathering/funding tests cover this; usable unsupported tools still satisfy preparation.
- Compact 2.80.18 presentation is retained: Train has one recommendation; Plan holds analysis/roadmap; Calculator and Reference retain tools/levels/F2P evidence. No save, route, protocol or launcher changes; no live-game acceptance claimed.
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
