# Magic cost comparison and sale eligibility

Partial T03/T11/T12/T13 follow-up after fourth preview 09a6b956. Not included in that EXE.

S2-04's Magic calculation unconditionally promised cowhide-funded rune purchases, ignored banked elemental staves and called the fewest casts the fastest option. Its full rune replacement cost was presented as a real purchase deficit even though already-owned runes were not deducted.

The existing comparison now reuses shared sale eligibility and liquid/gap semantics. Restricted sales cannot fund runes; unknown eligibility is disclosed, and only completed sales are coins. Unknown bank coins do not become a definite shortfall. An existing Money link points to the implemented funding system rather than creating a second earning planner.

The table is explicitly a listed-cast-XP/full-rune-replacement comparison. Damage XP, combat timing and owned rune deductions are not claimed. Minimum cast count is not labelled elapsed speed. Confirmed banked/noted elemental staff ownership uses heldExact and removes the staff purchase cost. S2-04's actual Staff requirement now accepts the same four elemental staff alternatives, so Preparation/Shopping/the plugin agree that the owned staff counts. IDs, levels, completion, current arrow and rune quantities are unchanged.

Verification: 1,751 Vitest tests in 134 files, production build/TypeScript, data validation and full Java suite passed locally. Six browser scenarios at 390/1280 px cover restricted/unknown/lifted sale status, unknown bank coins and the confirmed banked staff. The six changed readiness snapshot rows and the single native S2-04 fixture row were reviewed; missing/unreported alternative tests retain UNKNOWN vs MISSING. No game client was launched. Fresh cumulative CI is tracked by the draft PR.

Open: a complete spell-dependent supply/owned-rune/net-purchase budget, measured damage XP/timing, S6-04 spell progression, and full UI simplification. The visual test also exposed the existing melee Gear banner during Magic training; that needs its own context fix, not a new Magic DPS engine in this package. Cached spell facts were not refreshed, and no new current Wiki verification is claimed.
