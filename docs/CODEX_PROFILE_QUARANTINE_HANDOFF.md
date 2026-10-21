# Profile-source protection before mirroring and live binding

Partial T01 follow-up after pure-skill dependency facts. Not included in either published audit preview.

## Reproduction and contract

A valid browser list previously mirrored over an invalid/future native file without reading that file first. If both sources were damaged, the Main fallback could subsequently be serialized by profile edits or automatic character binding. Four initial cases failed before repair.

`readProfiles` now inspects both sources before mirroring. A malformed/unsupported native source, an unsupported browser version, a thrown read, two invalid sources or an unpreserved browser recovery collision pauses profile edits and game sync. The valid source can still be displayed; otherwise the Main fallback remains for display only. Original profile sources are not overwritten. Native profile loads return invalid raw text, using the existing broken-file copy mechanism, so syntax damage is distinguishable from absence.

A damaged browser source with a compatible native list remains recoverable when its original is verifiably preserved in the existing recovery key. It is not left locked solely because it recovered from that source. Two missing sources are still a normal first installation. The pure character matching function remains separate; the bridge uses the guarded variant before sending snapshots, auto-linking, importing live levels or auto-completing route marks.

One conditional warning reuses the existing profile banner and explains restoring a compatible profiles.json backup or using a version that supports the format, then restarting. Profile edit controls are disabled in that state. Normal screens gain no extra panel. There is deliberately no silent downgrade or destructive reset button.

## Evidence and limits

Local full Vitest passed 1,715 tests in 129 files. Cases include native syntax/future/row damage, two-source damage, a future browser source, a thrown native read, a conflicting recovery copy and successful preserved-browser recovery. Build/TypeScript, data validation (0 errors/warnings), Java testClasses and focused browser acceptance are tracked with the PR.

The actual EXE E2E now writes future-format and syntactically broken native lists only inside its disposable data directory, reloads against a valid browser list and changed fixture-game Magic level, and verifies original bytes survive, one warning appears and the new level is not imported. This new native case requires fresh Windows CI; local native startup remains unavailable. Browser checks cover the warning, disabled controls, no mirror/no live level import and overflow/console behavior at 390/1280 px.

This is startup source protection, not a complete profile storage redesign. Compatible but divergent lists still follow existing browser precedence; native reads that internally collapse filesystem failure to absence, failures after initialization, physical profile write receipts and reload after a failed accepted write remain open. Manual progress editing is separate from profile-list saving; no claim that every progress edit is disabled is made. Existing backup rotation/source safeguards must be retained. No live RuneLite acceptance is claimed.

Clean-install cumulative CI passed on remote commit `413223cf14c46003d3b93576a9526efc5da2f77a`, run `39598626445`, including full browser, Java and actual isolated Windows EXE. Both new native source-protection scenarios passed. This does not change the local startup restriction or establish live-game acceptance.
