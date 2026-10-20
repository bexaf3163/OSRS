# Stabilization handoff after 2.74.0

Baseline: `4be6f94f20489a2bf711be45570f7cf168e8c6d4` (Claude's single-guide release). Branch: `codex/stabilization-2.74`.
The owner authorized continuing the unfinished repair blocks. This is an isolated checkout; the owner's installed app, game data and Claude's checkout have not been modified.

## Coordination

Read this file and the current diff before resuming the old repair prompt. Do not repeat completed work or restore the removed second HUD.
The independent audit's T01–T17 list supplements the earlier blocks 2b–5; matching an old block label alone does not close the newer audit findings.
No version bump or release is included in these stabilization commits. Keep them reviewable before publishing an executable.

## T01: progress recovery and migration

- `progressStorage.ts` validates both sources before comparing their saved timestamps. A damaged browser record can no longer beat a valid file by acquiring a new empty-state timestamp.
- Invalid/unsupported source text is kept under the profile's `:recovery:local` / `:recovery:file` key. An existing different recovery copy is never overwritten. Failed preservation, unreadable sources, unknown formats and no valid source after corruption pause automatic saving.
- A small warning appears only in this exceptional saving-paused state. The working in-memory state can be exported; explicit compatible import/reset can resume saving only when preservation succeeded. Normal user flows have no new panel.
- The Electron reader can return the damaged original text after making its existing `.broken-*` copy; this lets the renderer distinguish a missing file from corruption. Its default API behavior is unchanged for existing callers.
- Supported versions are unversioned/V1, V2 and V3. Future or malformed version values are not silently treated as V1. V2 task keys migrate with their step IDs.
- A damaged profile list no longer gets mirrored into the file before validation; a valid file can restore the active profile. Recovery text is retained separately.
- Cross-window invalid/unsupported progress updates do not replace the working snapshot and pause writes until recovery.

Verification so far: 1,601 Vitest tests passed, including new recovery/profile/file cases; build and data validation passed; Java testClasses passed. Six new browser assertions passed through the actual StoreProvider, and the full UI smoke is still running at this checkpoint.
Native source Electron E2E was attempted in a disposable home but the process exited before its debugging endpoint was available (`2147483651`). This is NOT a successful native/portable check. Do not report live-game verification.

Remaining T01 follow-up: exercise explicit import/reset and cross-window corruption through the UI; verify recovery on a packaged executable and storage-write error reporting. Do not infer completion of every data-integrity issue from parser tests.

## T02: update-cache integrity

- Cached EXEs are streamed through SHA-256 before they are called ready, after a download and immediately before installation. Matching file size alone no longer suffices.
- Portable automatic installation fails closed when the release has no valid SHA-256 digest. Non-portable builds can still display release metadata.
- `install()` is now asynchronous; the existing IPC and renderer already use Promise<boolean>. Busy protection prevents the release changing while its cache is being checked.
- The delayed portable handoff, path validation, atomic download and existing cleanup rules are retained. No real update was installed during testing.
- All 22 updater tests pass, including same-size corruption, cache modification after check, invalid downloader output, missing digest and successful verified reuse/handoff.

## Still open

- Block 2b: Path simplification, ownership semantics, stale async responses and logout/account lifecycle.
- Block 3: combat plan candidates, complete costs, bones/XP ordering and meaningful equipment preparation.
- Block 4: Skills availability, funding batch limits and complete acquisition plans.
- Block 5: final release gates, packaged-artifact verification, live acceptance and review package.
- Other independent-audit findings: exact Java/TS item quantities, notes vs usable items, shared reserves, prerequisites vs skips, bridge limits/order/backpressure and dependency advisories.
- Two 2.74.0 HUD issues: urgent health should outrank a generic zone warning; manual disclosure should not be silently overridden by travel compacting.

Record each follow-up here with its actual verification scope. Automated, browser, native and live-game checks are different evidence levels.
