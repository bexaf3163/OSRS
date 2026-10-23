# Owner request: armour, live prices and dates

Full requested specification: [OWNER_ARMOUR_PRICING_DATES_REQUEST.md](OWNER_ARMOUR_PRICING_DATES_REQUEST.md). This follows the tool-requirement repair. It is not a claim that all three features are done.

## Date presentation — source implemented, final CI pending

Removed calendar/snapshot dates from Gear's last-known header, Settings progress/import preview, backup metadata, Journal/Money totals, Money method verification, combat/food/spell references, StyleGear, travel reference metadata and Wiki item price timestamps. Source links, stale/offline Gear disclosure, counts and requirements remain. The backup action uses the existing toast to confirm success rather than displaying a date. No new panels.

Internal timestamps remain unchanged: progress ordering/import/export, profiles, last-known gear selection, price-side freshness/cache/backoff, journal windows, backups, logs, native telemetry/screenshot filenames and build/data provenance. Date-based exported backup filenames serve recovery/version identification and remain functional. Diagnostic event times remain troubleshooting data. The Java guide contains no calendar-date formatter; the discovered native formatters name diagnostic screenshots/telemetry files, and were retained.

Dead display-only date exports and the Wiki drawer's date-formatting helper were removed. Static reference labels no longer imply their prices are live. This does not implement the pending comprehensive live-price presentation.

Browser regressions cover the real Settings save/import views at 390/1280px, confirm dates are absent while internal ordering timestamps/notes remain intact, and retain Gear's stale snapshot disclosure without its calendar date. No live-game acceptance is claimed.

## Remaining required work

Pricing foundation follow-up: the shared quote store now marks retained boards stale after an offline response or thrown refresh, preserving quote timestamps and allowing recovery back to live. Previously it kept a live label after both failures. Explicit item-ID pricing can also read a valid quote when the separate name-mapping request is unavailable. Three focused pricing suites pass (35 tests), with before-fix reproductions. This is a correctness repair to the existing provider, not completion of all price consumers or the Java presentation.

Local foundation validation: TypeScript/build and data checks pass; 1,814 of 1,820 tests pass, with only the same six independently reproduced sandbox network/rename failures. This pricing follow-up is newer than the tool/date CI revision and must receive final-tree CI before publication. Existing deliberately labelled baked planning estimates are not yet removed from all consumers; do not present them as live prices.

Owner decision: accept owned equivalent/better armour and buy only needed upgrades. Do not force a four-piece Black purchase when suitable owned equipment already covers those slots. The current repository contains no mandatory Black kit; the new preparation policy must be structured, respect equipability and preserve explicit restricted builds.

1. Armour + Defence10: inspect the actual selected route/combat phase. Current Defence-first advice says affordable steel armour, with black optional; there is no verified mandatory black kit yet. Do not misrepresent a route recommendation as an OSRS quest prerequisite. Implement the owner's chosen black-kit preparation through existing structured goals/equipability/acquisition/bridge systems, preserving saved IDs, alternative owned gear, affordability and explicit restricted-build preferences. Resolve the exact pieces from the current plan before adding quantities; do not silently invent a full set.
2. Prices: reuse `src/services/pricesApi.ts`. It already batches latest/mapping/hour feeds, caches, deduplicates concurrent calls, backs off after failures and retains side-specific quote timestamps. `buyPrice` can substitute an unavailable opposite side; full quote boards preserve actual missing sides. Audit every consumer before promising live acquisition costs. Distinguish GE estimates, fixed NPC shop prices/fees, planning assumptions and untradeable values. Keep current stock/unknown semantics and avoid new Java network fetches.
3. Complete all requested app/bridge/HUD scenarios and cumulative CI, including stale/missing price behavior, affordability, below/at10Defence and preservation of internal timestamps. Stable release remains batched.
