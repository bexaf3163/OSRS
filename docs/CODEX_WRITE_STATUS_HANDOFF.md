# Progress write acknowledgement

Stacked after funding execution. Existing recovery, profile filenames, debounce interval, atomic replacement, backups and the old preload API are retained.

## Contract

`saveProgressFileChecked` is additive and resolves after the debounced physical file write. Coalesced edits acknowledge the newest replacement; profiles retain separate results. The original fire-and-forget API remains for older clients. `atomicWrite` returns a sanitized error code on a failed temporary write or rename, leaving the previous destination intact. The same queue flushes on load, close and quit.

Browser storage and desktop file writes are independent attempts. An absent browser store is a failure, not success. The renderer reports which confirmed copy remains, or asks for an export if no persistent copy was confirmed. It waits for physical acknowledgement and guards against stale results, unmounts, profile changes and recovery-paused saving. A later successful write clears the write warning. Existing incompatible/corrupt-source warnings are not cleared by a queued old result.

## Evidence and limits

1,659 Vitest tests passed, including temporary-write/rename failures preserving the prior file, retry, deferred/coalesced receipts, per-profile outcomes, unavailable browser storage, IPC failure and legacy API fallback. Build, TypeScript, syntax checks and data validation passed. Focused Chromium checks show the failure warning and ensure a delayed old failure cannot replace a newer success.

The isolated packaged-EXE gate now creates an empty directory at its own temporary write path to induce a real write error, checks the warning and previous save, then removes that empty directory and verifies retry. This added native scenario requires exact-tree CI before being called passed. The local Electron launch limitation is unchanged; no installed app, profile or player save was used.

Profile-list write errors and secondary backup-folder failures still use their existing contracts; they are not silently promoted to confirmed saves by this change, but their broader reporting/format acceptance remains open. Recovery and full multi-profile/native acceptance are still larger than this write-result patch. Nothing guarantees zero regressions.
