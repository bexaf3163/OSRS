# Preserve supported but conflicting profile sources

Partial T01 follow-up after preview 402222c9. Not included in that EXE.

Two individually supported profile lists previously followed browser precedence and the browser list was immediately mirrored over the native file. That could erase a native-only character or silently replace an active profile, name or character binding.

Startup now compares the normalized active profile and profile identities/content before mirroring. When supported sources disagree, both original sources are retained; the native raw list is additionally preserved in the existing recovery:file key when available, without replacing an earlier recovery copy. Existing profile protection pauses profile-list edits, switching and automatic game sync. The single conditional banner names the disagreement instead of claiming an unsupported file format. No list is automatically merged, selected by timestamp or reset.

Formatting, implicit Main normalization and list order alone do not count as conflicting account content. A deliberate restore of matching supported sources followed by restart releases protection. This package does not add a recovery chooser: selecting the intended source still requires review of the retained originals. Do not clear storage or write a Main fallback to bypass it.

Evidence: four conflict reproductions failed before repair. Full local Vitest passed 1,736 tests in 132 files before the additional matching-source-restart case; final focused profile suite passed 27 tests. Production build/TypeScript, check-data, Java testClasses and browser protection scenarios at 390/1280 px passed. Both warning screenshots were exported; the wide image was visually inspected. Actual-EXE E2E adds a third native-file case containing a supported disk-only character; fresh cumulative CI must verify it. No local native or real RuneLite success is claimed.

Open: physical profile write receipts, reload after failed accepted writes, native read errors collapsed to absence, failures after startup and a user-facing supported conflict resolver. Existing manual progress changes are separate from profile-list protection. This is not completion of T01 or of the project audit.
