# Item bank quantity certainty

T03/T07 follow-up, after the separate audit preview branch. This change is **not in the first audit preview EXE**.

## Reproduction and repair

An OWNED report may have `bankSeen: true` but omit `bank` on a particular legacy row. `heldExact` previously replaced that missing field with zero and reported MISSING. A focused regression reproduced that false absence before the change.

- Exact ownership now treats a row's explicit bank quantity, including zero, as required evidence for a complete total. Positive carried/noted stock remains a known lower bound; manual marks retain their existing fallback. The existing fingerprint already distinguishes unknown bank quantity from zero.
- Departure preflight requires an explicit bank quantity for every accepted alternative. A missing field no longer establishes NOT_FOUND_IN_BANK.
- Dose aggregation requires all four bank quantities before reporting a complete shortage. Merely reporting all four dose names is insufficient.
- Requirement explanations distinguish an unreported quantity after a bank observation from a bank that was never opened.

Existing complete-bank test scenarios now explicitly state zero bank stock; their original shortage/allocation assertions remain. New incomplete-row, potion, preflight and branch tests retain unknown-state assertions. Browser scenarios at 390/1280 verify the actual outgoing preparation line remains UNKNOWN and does not tell the game to buy/withdraw unproven stock; notes/unnote tests remain intact.

## Validation and limits

Build and data validation passed (0 errors/warnings). Full Vitest passed 1,674 tests in 128 files; the final focused state/preflight/potion/allocation suite passed 78 tests after the wording adjustment. Focused browser stabilization/items scenarios passed, with no console errors or horizontal overflow. Java code is unchanged; testClasses is checked separately before publication. No live game verification or player save change is claimed.

This is a conservative quantity repair, not completion of T03. Generic tool-family lower-bound/completeness aggregation, full mode/quest/charge eligibility, exact ID/name collisions and remaining acquisition parity still need separate work. Do not undo unknown-state handling to recover an old fixture which omitted an intended known zero.
