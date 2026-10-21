# Profile-list source validation

Partial T01 follow-up after the Entrana correction. Not in the first audit preview EXE.

## Reproduction

`validProfileText` formerly checked only that JSON contained a `list` array. Values such as `[null]`, duplicate IDs, an invalid active ID, oversized lists, unsupported versioned records and malformed character bindings were accepted as a source to mirror. The permissive parser then removed data or produced Main, and that normalized fallback could replace a valid native profile list. Six regression cases failed before the repair.

## Repair

Before treating browser profile text as a validated mirror source, require valid unique IDs, preserve every existing ID through normalization, preserve the selected active ID, reject malformed names/bindings and unsupported versioned formats, and respect the list cap. A compatible older list without Main remains accepted when adding the implicit Main loses no existing profile. The existing parser remains permissive for its other explicit normalization callers; IDs, progress filenames and binding rules are unchanged.

Rejected browser source text remains at its original key and in the existing recovery key. Reading falls back to the native file without mirroring a default over it. No new persistent UI panel is added.

## Evidence and remaining scope

Full local Vitest passed 1,685 tests in 129 files; build/TypeScript, check-data (0 errors/warnings), Java testClasses and focused browser stabilization passed. Browser recovery checks show a native alternate profile in Settings, retain damaged text and assert no default mirror. Local dependency reads still show old versions; clean-install acceptance is tracked in cumulative CI.

The actual EXE E2E now seeds an alternate character only inside its disposable native data directory, damages browser profile rows, reloads and checks the native list remains intact and the damaged original is retained. **This new native case requires the attached PR's Windows CI; it was not run successfully on the player's desktop.** A separately downloaded first-preview EXE matched its public SHA-256, but local native spawn failed with `spawn UNKNOWN` before a window. Do not convert the previously passing CI into a claim that this new case passed locally.

Still open: malformed/unsupported native-file source selection, both-source quarantine and recovery UX, physical profile-list write receipts, reload after a failed profile switch, and semantic validation of automatic backup candidates. This focused browser-mirror fix does not establish all-profile or all-format recovery. Do not overwrite retained invalid/future data while implementing those follow-ups.

Clean-install cumulative CI passed on remote commit d14ce18fad6d2c203ef9146a7b2607f4ce3eea85, run 39560971559, including the newly added alternate-profile recovery case in the actual isolated Windows EXE. This does not change the local native-startup limitation or establish live RuneLite acceptance.
