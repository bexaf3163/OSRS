# Confirm physical profile writes before publishing a change

Partial T01 follow-up after preview 402222c9. Not included in that EXE.

## Contract and change

The previous fire-and-forget profile save accepted a switch or rename without learning whether profiles.json reached disk. A failed switch could reload into old sources. A separate existing bug also left the previous progress loaded after deleting the active alternate profile: the deletion changed active to Main before switchProfile tested whether a reload was needed.

The new optional preload saveProfilesFileChecked method uses a synchronous receipt for rare profile metadata edits. The main process reuses createProgressWriter.saveNow and atomicWrite; it does not create another persistence engine. It flushes/coalesces queued older writes, reports this file's physical result and cannot later overwrite the accepted edit with the old timer. Frequent progress writes retain their existing asynchronous/debounced contract. The legacy profile IPC remains available for older renderers.

The renderer publishes cache changes only after the native receipt (when available) and browser write succeed. Failure keeps the current profile/progress open, retains the intended edit for retry and returns false to create/rename/delete/switch callers. The existing banner area shows one conditional warning and Retry profile save; normal screens gain no extra panel. Rename/create inputs are not dismissed after refusal. A successful retry publishes the latest intended edit and reloads only if its active profile changed. Active-profile deletion follows the same confirmed reload rule.

Browser-only/older preload compatibility remains: it can accept browser storage plus the old unconfirmed native call. This path does not claim a physical receipt. A browser failure after a successful native write can leave the intended file newer than the browser; the edit is retained for retry and startup source-conflict protection prevents blind overwrites if the app closes first. This is not a transactional write across two different storage systems.

## Evidence and limits

Local full Vitest passed 1,745 tests in 133 files. New cases cover physical failure, thrown IPC, no early switch/reload, retained intended retries, browser-copy failure, latest failed edit, active-profile deletion and queued write supersession. Production build/TypeScript, check-data 0 errors/warnings, Java testClasses and browser failure/create/retry scenarios at 390/1280 px passed. No live RuneLite or local native startup success is claimed.

Actual-EXE E2E now blocks only its disposable profiles.json.tmp path with a temporary directory, verifies original native bytes and editable unsaved rename, then removes that directory and retries through the real preload. This requires fresh cumulative Windows CI; do not report it as passed until that job succeeds.

Remaining T01: native reads that collapse filesystem errors to absence, runtime external source changes, secondary backup error reporting, supported conflict-selection/recovery UX and a real isolated two-version update. A successful write/rename receipt is not a power-loss fsync guarantee. The all-project and real-game audits remain unfinished.

Clean cumulative CI passed at 7e5b5af2256d45f132c668ecd02c3f46aead5a9c, run 39609958018: 1,745 tests, patched Vite 8.3.3, full browser/Java and the actual isolated Windows EXE. The native temporary-path refusal, unchanged original profile bytes, retained rename and successful retry all passed. Fourth-preview actual-EXE checks also passed with digest c48aee8c8380dadaab2877d0c8388a3f0ecff8ab0384f0dda60504f75735d68d. These are fixture/runner checks, not a live game session.
