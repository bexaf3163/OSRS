# Supported backup source selection

Partial T01 follow-up, stacked after profile source validation. Not included in the first audit preview EXE.

## Reproduction and repair

Native copy selection previously accepted any parseable JSON. A newer unsupported progress record displaced a valid dated backup; malformed profile rows could become the restore source. The fresh-folder refresh could also overwrite a future-format target with an older-format record solely because its timestamp was newer. Three initial regression cases failed before repair.

The native backup paths and renderer now share source admission in `electron/saved-data.mjs`. Progress admission checks the app marker, supported versions and the existing structural entry contract (at least one object-valued steps/levels/notes field). Profile admission preserves all valid unique IDs, the active selection and character bindings within the existing cap, including compatible implicit-Main lists. Renderer normalization, route migrations and explicit profile parsing remain in their original modules.

Session, daily and latest copies admit supported source records only. Automatic restoration chooses supported candidates before comparing their existing timestamp/date ranks. Existing invalid, unsupported or unreadable targets are retained instead of automatically overwritten, including unknown latest/session backup files. Dated copies still proceed around an unknown latest file, preserving a new supported recovery opportunity. Original rejected source files are untouched. Daily rotation still keeps fourteen supported dated copies per file; unknown/damaged copies are retained for explicit recovery rather than deleted during rotation. Separate profile filenames remain unchanged.

This is format admission, not deep route/value validation or a guarantee that a backup contains the player's desired state. Unknown route IDs and individual legacy values still follow the existing renderer migration/normalization rules.

## Evidence and remaining scope

Tests cover unsupported/faulty/foreign records as candidates and copy sources, invalid-only fresh installation, existing future targets, malformed profile lists, preserved unknown latest/session files, dated copy fallback and implicit-Main cap eviction. Older copy fixtures now use actual supported progress/profile shapes; raw native reader fixtures remain unchanged because that reader must return invalid/future text for renderer recovery protection.

Local full Vitest passed 1,701 tests in 129 files. Build/TypeScript, check-data (0 errors/warnings), Java testClasses and focused browser stabilization passed. Local dependency installation still resolves the older physical versions; clean-install Windows CI is required for cumulative acceptance. Packaged startup must also prove Electron can load the shared native module. No local native or live RuneLite success is claimed.

Remaining T01 work includes both-source profile quarantine/recovery UX, malformed native profile selection, physical profile-list write receipts, failed profile-switch reload, secondary-backup error reporting and actual two-version recovery. Unknown retained backup files need explicit user recovery; do not delete or normalize them as a silent cleanup step.

Clean-install cumulative CI passed on remote commit `274f5bfc63a5b578e37fac1a8c028222ca8da24b`, run `39563245481`: checks (including full browser), Java and actual isolated Windows EXE. Packaged startup exercised the shared native module; the alternate-profile recovery gate also passed. This is runner evidence, not a local/live game claim.
