# Native saved-file read protection — unreleased 2.74.3

## Reproduced and changed

The native reader caught every filesystem exception and returned null. The renderer already protected thrown read failures, but that protection never received EACCES/EIO from the real shell: an unreadable existing progress/profile file looked missing and could authorize mirroring or a fresh save.

Only ENOENT now means missing. Other native read failures become a structured IPC failure; the preload throws into the existing progress/profile recovery guards. Successful reads retain the renderer's string/null API. Damaged original text still reaches the existing recovery logic unchanged. No new storage format, recovery overwrite, permissions change, UI panel or polling system was introduced.

Unreadable progress pauses automatic progress writes while retaining any valid browser fallback. Unreadable profile lists pause profile mirroring/edits and game sync through the existing profile gate. Explicit imports/resets remain blocked when unreadable original data cannot be preserved. These are separate existing guards; a profile warning does not claim every manual progress edit is disabled.

## Verification

- Before repair, 15 of 17 new regression cases failed. All 17 pass after repair: EACCES/EPERM/EIO/EISDIR/ENOTDIR, genuine ENOENT, progress/profile receipts, malformed IPC replies, successful original text and browser-fallback protection.
- The focused native/progress/profile suites pass: 91 tests across five files using Vitest's thread pool. The sandbox's forked-worker transform cache intermittently reports missing temporary files, including for existing tests without the new suite; no project test configuration was changed.
- TypeScript/build pass. Packaged E2E now puts a directory at each disposable native save path, checks the actual preload/store warning and absence of replacement writes, restores the fixture and checks recovery after reload. Those new native scenarios require CI; they have not run locally because loopback connections are denied.
- Full local thread-pool run: 1,798 passed, six failed out of 1,804. Four bridgeLimits failures are denied loopback connections; two existing atomic-write tests receive EPERM on temporary-file replacement, also reproduced by running that unchanged suite alone. Data validation has no errors/warnings. Preserve the gates and use CI to establish final native/browser acceptance.
- The earlier sync-only CI passed Java and isolated portable gates, but the Ubuntu browser job timed out downloading fonts from its apt mirror. That is not browser acceptance for either block.

## Still open

Runtime changes to already-loaded native files, supported conflict-resolution UX, secondary-backup error reporting and broader T01 recovery remain open. No user save, installed app or live account was used for these tests. Batch publication is now permitted by the owner; do not label this revision released until its final-tree checks and portable release actually pass.
