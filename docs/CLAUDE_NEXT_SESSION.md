# Claude continuation — start here

## Current unreleased blocks: 2.74.3 — progress proof and native reads

Account Sync no longer promotes convenience-route ancestors to game-confirmed completion. Mixed item/retained-stock goals remain unverified; pure finite level goals still sync. StepCard dependency labels use the same evidence as blockers, including live quest precedence and consumer-specific skill equivalence. Notes, skips, saves and the separate explicit manual-review option remain intact. See [CODEX_PROGRESS_PROOF_HANDOFF.md](CODEX_PROGRESS_PROOF_HANDOFF.md). The stable baseline below remains 2.74.2 until this revision passes CI and portable publication.

Native progress/profile read errors now reach the existing recovery guards instead of looking like missing files; only ENOENT authorizes a fresh source. See [CODEX_NATIVE_READ_HANDOFF.md](CODEX_NATIVE_READ_HANDOFF.md). Focused native/recovery/profile tests pass (91); new packaged read-error scenarios await CI. The earlier sync-only CI passed Java/portable but its browser-dependency download timed out. Do not claim full acceptance from that run.

## Verified baseline and working policy (updated 2026-10-23)

Resume from the latest remote main in bexaf3163/OSRS. Verified application release: **2.74.2**, source **95ad7b21b214133ea51513237e8722b94d764bfc**. Check for intervening owner/Claude commits before editing; do not reset them, restore an old checkout or cherry-pick the already included stacked PRs again. Historical branch instructions elsewhere are evidence, not the current starting point.

- Published portable: https://github.com/bexaf3163/OSRS/releases/download/v2.74.2/OSRS-Put-2.74.2-portable.exe
- SHA-256: 2500fe2e6cfc662226ce1075ff60f7b3741b493654448a81c59da40e93be269c — GitHub asset digest matched the actual isolated EXE test log.
- Checks: https://github.com/bexaf3163/OSRS/actions/runs/39689971665 — success.
- Release: https://github.com/bexaf3163/OSRS/actions/runs/39689971634 — success.
- Acceptance: 1,783 Vitest tests/139 files, TypeScript/build, data validation 0 errors/warnings, full Java suite (604 tests), browser UI, source Electron E2E and isolated portable EXE gates passed. Automated fixtures are not live gameplay.

Owner policy: make small repairs in separate commits, update this file and pass relevant tests and cumulative release gates. The owner now permits batching publication while work continues to reduce overhead. Publish to main without force and with a new coordinated portable version when application/plugin behavior changes; do not overwrite an existing release. Documentation-only handoff corrections do not require rebuilding the application. Keep implemented, automated, packaged, live and open evidence separate. No claim that all T01–T17 or old blocks 2b–5 are complete.

This main document supersedes older attached release handoff snapshots. Read project rules and root CLAUDE_REDESIGN_HANDOFF.md; consult individual handoffs as needed rather than rereading every historical branch.

## Latest completed blocks already included in main

1. **S4-03 route repair:** [CODEX_FROGS_HANDOFF.md](CODEX_FROGS_HANDOFF.md). Attack40 alone completes the step; no mandatory 50 bones, Hill Giant detour or saved item-first phase. Surface level13 Giant frogs use the existing combat/navigation pipeline. Early Defence10 on cows can qualify when its food saving justifies the full training time; keep-Defence1 is respected. Ranking includes a transparent repeated-target effort preference (0.05 score units per kill), not extra measured combat time. At Defence10 the guide advises banking and affordable steel armour, preserving food money; black is optional. This is manual Gear advice, not an enforced purchase phase. Estimates use actual worn gear and exclude an unmeasured shopping detour. Money remains separate; later real coin requirements remain enforced. Historical collection fixtures intentionally retain old quotas to test generic collection/reserve behavior, not to describe the current route.
2. **Gear quest evidence:** [CODEX_GEAR_QUEST_PROOF_HANDOFF.md](CODEX_GEAR_QUEST_PROOF_HANDOFF.md). Live quest evidence controls unlocks/toll waivers; skips and partial quest milestones are not full completion. Seven regressions. No new multi-style DPS engine.
3. **Skills quest reward proof:** [CODEX_SKILL_QUEST_PROOF_HANDOFF.md](CODEX_SKILL_QUEST_PROOF_HANDOFF.md). Known live quests win; only explicit manual done is the unread-data fallback. Skipping a quest does not grant its XP. Seven regressions.
4. **Shopping scope:** [CODEX_SHOPPING_SCOPE_HANDOFF.md](CODEX_SHOPPING_SCOPE_HANDOFF.md). Stock up names selected-step purchase reserves; it is not one carried inventory. Existing saved key, quantities, bank withdrawal and ownership calculations retained.
5. **HUD collection semantics:** [CODEX_HUD_COLLECTION_HANDOFF.md](CODEX_HUD_COLLECTION_HANDOFF.md). A genuine collection objective leads over incidental XP. Projected XP and item progress remain distinct. This generic fix remains valid even though S4-03's unnecessary collection goal was removed.

## What is implemented

The precise scopes and test evidence are in `docs/CODEX_REPAIR_CHECKPOINT.md`, `docs/CODEX_AUDIT_BACKLOG.md` and individual `CODEX_*_HANDOFF.md` files. The backlog records all T01–T17 items and all 30 Gemini finding groups, including stale/rejected proposals. Partial means unfinished.

- Progress/backup format admission, lossless source protection, physical save-error reporting, supported conflicting-profile quarantine and profile-write receipts/retry/reload. Preserve damaged/future originals; never mirror over them merely because a source is newer.
- SHA-256 update checks; additive exact container quantities; carried/noted/bank separation; unknown per-row bank facts; recipe deficits and physical potion doses/slots.
- Skip versus real prerequisites, partial Fairytale II milestones, current-session fingerprints, logout clearing, delayed snapshot guards and server-lifetime apply ordering.
- Bounded asynchronous SSE with slow-reader expiry and completion replay. Small commands retain 64 KiB; complete snapshots allow bounded 384 KiB. Do not remove limits to fix Gemini's 64 KiB concern.
- Selected-route shared reserves/cleanup protection, affordable funding batches, separate tools/inputs and honest sale observation.
- Waterfall phase preparation; combat objective sequencing/XP credit, conservative dose carryover, required loot-bank trip minimums, food/shopping after the XP target, confirmed loot/food stock without imaginary drop income.
- Repeatable skill methods remain available beyond suggested brackets; selected Fishing map/tiles project one current destination. Gear no longer accepts a current-DPS loss because of a future average; current and training-window benefits are distinct.
- Lost City axe is acquired in the dungeon. Universal strength-amulet superiority and wasted-Defence-XP claims were removed.
- #36: S2-04 no longer guarantees cowhide-funded runes on a trade-restricted/unknown account. Existing elemental staves satisfy ownership; gross cast-cost comparison is labelled honestly. This is not a new complete spell-supply planner.
- #37: a shared multi-skill producer may satisfy a specific consumer dependency when all that consumer's explicit skills are known and reached. Lost City does not require unrelated Ranged/Slayer/Cooking goals. Never globally complete S8-04 or infer quest/item acquisition from skills.
- #38: selected Magic/Ranged steps do not borrow future melee scimitar banners. Existing melee advice, StyleGear and Gear page remain. This does not implement full Magic/Ranged DPS.

## Evidence boundaries and player follow-up

Live native review used separately approved THIRD preview 402222c9 on 2026-10-21, plugin2.74.0/protocol6, World316, QP43/total271, Attack30/Strength21/Defence1/HP24. The app launched RuneLite; the single HUD expanded/collapsed, Show in game and Gear/Shopping/Money/Skills/Journal were inspected with real data. The isolated profile did not copy or replace the player's save. See [CODEX_LIVE_REVIEW_2026_10_21.md](CODEX_LIVE_REVIEW_2026_10_21.md). No later source repair, new frog/Defence plan, armour shopping, complete quest encounter, Alt-drag/position persistence or end-to-end route timing has been verified live by Codex.

Player subsequently reported black armour/shield with Adamant scimitar, fighting level13 frogs, and estimated 80–90k gross GP from roughly240 bones over two hours. This is user-reported context, not measured telemetry, a current GE quote or guaranteed net profit. Current Attack/Strength, potion boosts, bank and cash must be read afresh. Amulet choice depends on current max-hit breakpoints/style/boosts; never declare Strength or Power universally superior. Optional frog bone sales can supplement training; do not reinstate a fixed quota or count unsold drops as cash.

Retain historical failures honestly: fifth preview's first packaged fixture timed out; rerun39644626154 attempt2 passed without proving the timeout's cause. Initial 2.74.2 browser runs retained obsolete expectations that400gp must be short after first-trip needs shrank. Updated tests cover funded400gp and genuinely unfunded0gp accounts; full corrected Checks/Release above passed. Production affordability and gates were not loosened.

## What must remain intact

Keep Claude's single expandable `OsrsPathGuideOverlay`/`HudModel`; never restore duplicate top-left plates, dock bars or need cards. Preserve route IDs, completion triggers, notes, profiles, manual/owned stock, selected plans and unknown-state semantics. One current action, one conditional warning, details on demand. No mandatory speed-mode switches, new dashboard panels, or wiki-length default cards. Read root `CLAUDE_REDESIGN_HANDOFF.md` and project rules.

## Prioritized remaining work

1. Finish real desktop/HUD acceptance on the latest verified main release: selected plan/current phase matches app, one guide only, header expand/collapse, saved position and Alt-drag, safe prep warning priorities, fonts/DPI/zoom/long text/compact view, reconnect/logout/world-hop freshness. Do not automate combat, movement, spending or skilling. Keep authentication and the player's only saves untouched.
2. Full continuous route feasibility remains OPEN. The 67 IDs were enumerated, not played end-to-end. Review fresh/poor F2P, Members and partial-quest scenarios. Do not renumber IDs or silently apply the deferred Doric/Knight's Sword reorder (`docs/route-reorder-proposal.md`).
3. Fix coherent skill handovers: S6-01 has static Ogress metadata without level-1 Ranged gear/ammo planning; S6-02 needs Cooking supplies/location after Fishing 50; S6-03 needs accessible Mining/Woodcutting trainers/tools and separate completion of each half; S6-04 needs spell-appropriate rune/input batches. S6 is already optional Bond preparation and hidden for Members. Merely setting followsMethod leaves stale NPCs/maps/threats/supplies. The generic method requirement converter currently ignores tool needs; address that with exact ownership/eligibility tests before extending it.
4. Combat catalogue now includes surface level13 Giant frogs; it is still limited. Compare verified accessible trainers, actual style/boost/prayer, attainable Defence+armour and purchase detours, simultaneous food/potion/loot inventory slots, travel/banking and total remaining objectives. Do not replace 725 cows with another fixed mob count without total-time/cash/risk evidence. S4-03 no longer requires bones; do not restore that quota. Other genuine item objectives need their own acquisition comparisons. Food for one bag is not food for the whole goal; estimates are not measured live rates.
5. Quest phase safety: Lost City spells/food/exit/Entrana rules; Demon Slayer bone collection versus fight kit; Monkey Madness non-monotonic returns and feasible per-phase slots; Tanglefoot special damage. Verify current primary sources; preserve intentionally safer route choices while distinguishing them from game prerequisites.
6. Remaining persistence/exact-item gaps: native read errors versus absence; conflict-resolution UX; secondary-backup failures; runtime external changes; exact-ID and remaining legacy ownership consumers. Do not weaken existing quarantine or change unknown to missing.
7. Funding: GE window/batch constraints, full acquisition/shop/rune/travel costs, live proceeds. Current Magic labels do not solve net supplies. Gear needs verified multi-style comparison, not arbitrary total-stat scores. Avoid duplicate engines.
8. Real isolated two-version updater acceptance, frame-time/telemetry cost, residual eight moderate build-tool advisories, final KNOWN-ISSUES/review package and outstanding live acceptance. No forced npm audit fix or builder downgrade. Local installed Vite previously lagged the patched lock; clean CI is the patched dependency evidence.

## Concrete follow-ups to reproduce before fixing

- Account Sync inference and StepCard prerequisite coloring are repaired in the 2.74.3 proof block; consult CODEX_PROGRESS_PROOF_HANDOFF.md and its exact CI/release evidence before treating publication as accepted. Broader native progress recovery remains open.
- Generic skill-method conversion ignores some tool needs: verify exact tool ownership and equip/use eligibility before extending Mining/Woodcutting handovers.
- A remaining GearHintSync non-melee mismatch is only a candidate; require a real non-melee step with foes before calling it a confirmed defect.

## Next-session procedure

Start with one reproducible remaining issue from the prioritized list and [CODEX_AUDIT_BACKLOG.md](CODEX_AUDIT_BACKLOG.md). That ledger covers T01–T17 and all30 Gemini groups, including rejected/stale proposals; it is not approval to apply Gemini patches wholesale. Read the current source first, reuse existing engines, preserve saves/IDs, test the actual failure and fix narrowly. Run build, Vitest, check-data and Java testClasses (full Java tests for plugin behavior); include affected browser/native checks and packaged release gates. Update this file and the relevant detailed handoff with exact revision/evidence/open items. Continue owner-authorized main/portable publication; do not return to the obsolete preview-only branch policy.
