# Secondary-copy error reporting — partial T01

Source-confirmed defect: automatic latest-copy failures were swallowed; a manual copy failure was returned once but backup:get rebuilt a state with error=null. Opening Settings could therefore erase the failure report.

The native shell now retains per-session errors by configured target and phase. An automatic latest-copy success only clears that phase; it cannot erase a failed scheduled/dated-copy attempt. A successful complete retry clears that target. Disabled/removed targets do not keep contributing errors. Existing BackupState/error UI is reused; no new panel or primary-save failure state.

Primary progress writes still acknowledge their actual result independently. A secondary copy failure never rejects a successful primary save, changes profile binding or modifies the saved progress. No source file, backup format or recovery migration changed.

New real Electron/packaged E2E scenario uses only the disposable test home: preserve the copy directory, temporarily replace its exact guarded path with a file, verify checked primary save succeeds, observe automatic/manual errors through backup:get, restore in finally and confirm successful retry clears the error. It never changes the player's folders, ACLs or game state. TypeScript/syntax and all1,941 local tests/build/data pass; fresh native/portable CI is required before this scenario is claimed observed.

Remaining: session-restart error history, per-file skipped-copy diagnostics, first-write .bak failures, supported conflict-resolution UX and broader recovery. This does not close all T01. In-game checks belong to Claude and are unrelated to this isolated native test.
