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

Verification: 1,601 Vitest tests passed at this checkpoint, including new recovery/profile/file cases; build and data validation passed; Java testClasses passed. The full browser UI smoke passed, including six new assertions through the actual StoreProvider.
Native source Electron E2E was attempted in a disposable home but the process exited before its debugging endpoint was available (`2147483651`). This is NOT a successful native/portable check. Do not report live-game verification.

Follow-up browser acceptance passed: explicit compatible import resumes saving while retaining the original recovery copy; reset saves a fresh state; an unsupported cross-window event preserves the working file and pauses saving. The native E2E now also exercises corrupted-browser/valid-file recovery, but that new native case has not passed locally. Remaining T01: packaged verification and storage-write error reporting. Do not infer completion of every data-integrity issue from parser tests.

## T02: update-cache integrity

- Cached EXEs are streamed through SHA-256 before they are called ready, after a download and immediately before installation. Matching file size alone no longer suffices.
- Portable automatic installation fails closed when the release has no valid SHA-256 digest. Non-portable builds can still display release metadata.
- `install()` is now asynchronous; the existing IPC and renderer already use Promise<boolean>. Busy protection prevents the release changing while its cache is being checked.
- The delayed portable handoff, path validation, atomic download and existing cleanup rules are retained. No real update was installed during testing.
- All 22 updater tests pass, including same-size corruption, cache modification after check, invalid downloader output, missing digest and successful verified reuse/handoff.

## T04: snapshot invalidation (partial)

- The player-state fingerprint includes player identity, the actual normalized quest set (not just its length), equipment-known status and supplied position/plane.
- Quest order alone does not invalidate the state. Same-length quest replacements and a different character do invalidate it.
- All 14 playerState tests passed; the combined package passes all 1,608 Vitest tests, build and data validation.
- This does NOT close logout/account event ordering or stale async responses. The provider still does not publish a reactive position stream; funding retains its existing position source.

## T14: single-guide corrections (partial)

- Critical HP now outranks a generic danger-zone warning. The zone remains in expanded details; the closed card still has at most one warning.
- Explicit header disclosure is respected while travelling and at the Exchange. Default disclosure, position, typography and the single-overlay layout are retained.
- The full Java suite passed (587 tests). Closed/open render fixtures were generated; these are test images, not live-game screenshots. Saved placement, Alt-drag and click hit regions still need live acceptance.

## T08: bridge payload limits (partial)

- The desktop now matches the plugin's existing UTF-8 request limits: 64 KiB for small commands, 384 KiB for the complete `/prep-plan` snapshot. The small-command bound was not relaxed.
- An oversized request or response returns 413 with a size explanation instead of status 0 (unreachable). The guide shows one explanation per failing content key; its snapshot rejection does not turn a reachable plugin offline.
- Desktop responses and individual SSE blocks have a bounded 384 KiB budget. Large bank events can cross the old 64 KiB boundary. Complete and fragmented event blocks follow the same byte limit; overflow closes the stream for normal reconnection instead of discarding a prefix and interpreting a tail as fresh data. Split CRLF separators are handled.
- Tests cover matching Java constants, exact/one-byte-over request boundaries, Unicode, every real route target through an HTTP transport, a large status response and fragmented/oversized events. The plugin HTTP test also accepts exactly 384 KiB and rejects one more byte without applying it.
- Verification at this checkpoint: all 1,616 Vitest tests, build, data checks and 588 Java tests passed. The focused browser recovery/size-refusal scenarios passed. No live RuneLite check is claimed.
- Still open in T08: accepted-vs-applied sequence ordering and session lifetime. T09 Java SSE backpressure also remains open. The new desktop buffer bound does not solve slow-client writes on the game thread.

## T15: release verification gates (pending CI)

- Pull requests now have a Windows job that builds the real portable EXE and runs the existing native E2E against an isolated copy, alone in a disposable runner directory.
- Release now gates publication on the full Java suite, browser UI smoke, source Electron E2E and packaged EXE E2E. The helper verifies that the source/candidate digest matches and the publication artifact has not changed during its test.
- These workflow additions do not publish anything on this branch and do not bump the version. Native source execution was blocked locally before window startup; the Windows CI result is required before calling portable acceptance passed.

## Still open

- Block 2b: Path simplification, ownership semantics, stale async responses and logout/account lifecycle.
- Block 3: combat plan candidates, complete costs, bones/XP ordering and meaningful equipment preparation.
- Block 4: Skills availability, funding batch limits and complete acquisition plans.
- Block 5: final release gates, packaged-artifact verification, live acceptance and review package.
- Other independent-audit findings: exact Java/TS item quantities, notes vs usable items, shared reserves, prerequisites vs skips, bridge ordering/backpressure and dependency advisories.

Record each follow-up here with its actual verification scope. Automated, browser, native and live-game checks are different evidence levels.
