# OSRS Path repair checkpoint — 2026-10-21

This is a continuation handoff, not a completed-project audit or a zero-regression claim.

## Source and test builds

- Main remains Claude's 2.74.0, `4be6f94f20489a2bf711be45570f7cf168e8c6d4` (last checked on 2026-10-21). No audit PR has been merged.
- The application repair stack is draft PRs #1–28 in bexaf3163/OSRS; #29 contains this documentation-only checkpoint. Each new package is based on the previous package; review/apply in order rather than cherry-picking only a late dependent PR onto main.
- Third preview source: branch `codex/audit-test-build-3`, remote commit `402222c9672cfafecb6d128121b22263d58d06e2`. Includes application repairs through #27. Its filename is `OSRS-Path-audit-test-402222c9.exe`; all CI gates passed and the separate prerelease is published: [download the verified portable EXE](https://github.com/bexaf3163/OSRS/releases/download/audit-test-402222c9/OSRS-Path-audit-test-402222c9.exe). SHA-256: `06333d32f54aead72de743b95b279b2d2234c7cac28077de5badcff913f7a0e0`.
- Earlier preview `audit-test-3174b90e` includes through #22 and excludes #24–27. Preview `audit-test-978cb6d6` is older again. All keep internal app version 2.74.0; identify the test revision by filename/SHA.
- Original portable installation and player data have not been replaced. Test in a separate directory and retain the working EXE/data folder. Prereleases do not replace stable auto-updates.

## Recent repairs

| PR | Repair | Scope limit |
| --- | --- | --- |
| #21 | Shared renderer/native format admission for backups; unsupported/invalid candidates cannot displace supported progress; unknown originals survive rotation/overwrite. | Not complete profile persistence/recovery. |
| #22 | Selected training method projects one current map/ground point instead of mixing future Fishing destinations. | Compound Cooking handover and other skill steps remain open. |
| #24 | Known reached pure skill goals can satisfy a skipped training dependency without changing the skip mark. | Not proof of quest/item/carryover completion or equivalent acquisitions. |
| #25 | Both profile sources inspected before mirroring; native/future/two-source damage pauses unsafe profile edits and game sync with one conditional warning. | Compatible divergent lists, physical profile write receipts and later failures remain open. |
| #26 | Route text no longer claims strength amulets always win or early Defence wastes the quest reward; stocking advice follows the selected plan. | Does not implement full gear-cost/Defence-detour comparison. |
| #27 | Food and Shopping include remaining required collection after Attack 40; fifty missing bones means fifty Hill Giant fights, thirty owned means twenty. | Full joint food/potion/loot packing and complete banking/travel cost remain open. |

Earlier packages cover progress recovery/write reporting, update digests, exact item/notes/doses, prerequisites, session freshness, snapshot ordering, bounded SSE output, shared reserves, executable funding batches, Waterfall phase preparation, combat objective order and required loot-trip minimums, dependency fixes and contextual Gear benefit. The exact scopes and limitations are in the individual CODEX_*_HANDOFF documents.

## Evidence

- Latest local application suite: 1,720 Vitest tests in 130 files; TypeScript/Vite build; data validator 0 errors/warnings; Java testClasses. Earlier full Java suite has 601 tests and the cumulative CI runs the full suite again.
- Narrow/wide retained-combat browser tests verify the real protocol-6 prep snapshot, food after Attack 40, unchanged completion and a live fixture stock update from 0 to 30 bones. Existing item-only instructions/visible pace tests remain intact; the internal estimation skill is not serialized to the game.
- #24, #25 and #26 clean CI passed. #25's actual isolated EXE retained future/syntax-damaged native profile bytes, displayed protection and did not import changed fixture-game Magic levels.
- #27/#28 cumulative clean CI passed at their own commits, runs 39602704028 and 39602935795. The published third-preview digest matches the actual-EXE test digest. Browser fixtures and actual-EXE fixture tests are different from a live RuneLite session.
- Local native execution has not succeeded: source startup failed before a window, packaging hit EPERM, and a downloaded EXE's native spawn returned UNKNOWN. Do not rewrite these as passes. Computer Use launch of newly downloaded software requires its separate action-time confirmation.
- No real game screenshots, current account stats, replayed completed quests or measured live combat rates are claimed. The historical Attack 30 / Strength 21 / Defence 1 / 24 HP fixture is a reproduction case, not a fresh account reading.

## Resume without duplicating or undoing work

Read `CLAUDE_REDESIGN_HANDOFF.md`, `docs/CODEX_AUDIT_BACKLOG.md` and the linked handoffs on the repair branch. The backlog includes T01–T17 and dispositions of all 30 Gemini finding groups; it deliberately rejects stale or mismatched proposed patches. The 64 KiB concern was not solved by removing all limits: small commands retain 64 KiB, complete snapshots have a bounded 384 KiB contract, and refusal/reconnection behavior is tested.

Keep the single expandable `OsrsPathGuideOverlay`; do not restore the old text plate, dock bar or duplicate need card. Preserve IDs, completion triggers, notes, profile keys, selected plans, unknown-state semantics and owned/manual stock. Use one current action and disclosure for details; do not add more dashboard panels or switches to expose an engine fix.

Important unfinished work remains:

1. Continuous feasibility of all 67 route entries for fresh/poor/historical F2P, Members and partial-quest profiles. Route extraction or a green data check is not a full playthrough. Reordering remains deferred in `docs/route-reorder-proposal.md`; IDs must not be renumbered.
2. S6-01 Ranged should not lead a level-1 account straight into the static Ogress plan without a coherent trainer/ammunition/gear/safespot projection. S6-02 needs a real Cooking supplies/location handover after Fishing. S6-03 needs continuous Mining/Woodcutting unlocks/tools; S6-04 needs spell-appropriate inputs. Simply adding followsMethod leaves stale targets/instructions.
3. Combat trainer catalogue beyond Cow/Minotaur/Hill Giant, full simultaneous inventory packing, travel/acquisition/banking/gear costs, actual fight style and measured rates. Required loot is not imaginary sale income. Whole-goal food purchases are not the same as one carried bag.
4. Remaining quest/loadout phases, non-monotonic Monkey Madness returns, Lost City spell/food/escape supplies, Demon Slayer's separate inventory phases, Tanglefoot's special damage rules and equivalent acquisition dependencies.
5. Per-row bank completeness throughout remaining legacy views, profile write receipts/reload after failure, compatible-source divergence, secondary-backup error reporting and a real isolated two-version update.
6. Path simplification and complete desktop/HUD acceptance across DPI, zoom, themes, fonts, long text, offline/unknown/ready/missing and actual click/Alt-drag regions. Test renders are not game screenshots.
7. Final KNOWN-ISSUES, review package and stable release only after their actual acceptance. Remaining build-tool dependency advisories are documented; do not run a forced audit fix or downgrade the builder.

Do not declare all old blocks 2b–5 complete from these repairs. Report implemented, automated, packaged, live and still-open evidence separately.
