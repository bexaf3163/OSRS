# Mandatory loot banking and unscheduled income

Stacked after combat phase sequencing. This is another partial T10 correction, with the full capacity/route comparison still open.

## Change

XP training no longer earns hypothetical sale proceeds from every Cowhide or excess Big bone. Its instructions do not include collecting, carrying, banking and selling all those drops, so that value must not reduce the plan's apparent cost or break a time tie. Potential quantities remain uncounted model context. The folded UI explains this once; it does not add repeated per-plan paragraphs or another persistent panel. The separate Money catalogue and its actual sale observations are unchanged.

A retained item objective now sets a minimum on bank trips. Fifty nonstacking Big bones cannot fit in one default 26-cell training inventory even when no food banking is needed. The plan takes the maximum of required-food and required-loot trips; it does not add the same bank visit twice. It uses the estimator's own bank-time assumptions. This is a minimum bound, not full simultaneous food/loot packing.

Combined objectives are estimated as a complete fight rather than scaling a shorter XP-only fight. Multiplying a one-kill estimate fifty times also multiplied its initial free-health buffer, which could falsely make the collection food-free. The main skill's projected XP is extended only by kills still needed beyond the original XP estimate, and the original real completion trigger remains unchanged.

## Evidence and remaining scope

1,671 Vitest tests, TypeScript/build, data validation and focused Chromium combat checks passed. Tests cover fifty bones with no food banking, partial already-owned stock, shared food/loot visits, the one-kill health-buffer regression and optional drops excluded even with a valid GE price. Desktop/phone browser scenarios also verify that folded comparisons do not advertise unplanned sale income.

Actual combined packing, existing bag contents, pickup/GE overhead, exact bank paths and profitable collection variants need the full executable trip model. No current plan promises that its complete supplies are affordable. The trainer catalogue, gear/capital choices and real-game acceptance also remain open. The default bank-time range is an estimate and these tests are not measured game timings.
