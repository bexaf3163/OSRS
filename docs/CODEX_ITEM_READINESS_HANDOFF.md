# Item ownership and usable preparation — follow-up

Branch: `codex/item-readiness-contract`, based on stabilization head `7ce774a099e78dd5179dfd6571c6590de200f7ab` (PR #1). This is a focused T03/T07 follow-up, not completion of the entire audit.

## Implemented

- Java OWNED rows retain the original `carried` / `noted` / `bank` fields for older clients and add `exactCarried` / `exactNoted` / `exactBank`. Those new fields use physical counts without higher-tool substitution. Missing `exactBank` represents an unread bank; it is not fabricated as zero.
- TS prefers the exact quantities. Malformed or incomplete exact records are not converted into known zero or silently downgraded to legacy substituted counts. Older tool reports use a conservative maximum rather than summing overlapping substituted tier counts. New reports can sum distinct exact tools normally. This additive wire change does not require replacing protocol 6.
- One shared `item-ownership.json` fixture is checked against the real Java report builder and consumed by TS. It covers one Rune pickaxe watched under multiple tier names, food/notes/bank separation and an unread bank with an unusable higher tool.
- Usable preparation excludes notes from bag food. Owned totals and acquisition budgets still include them, avoiding a recommendation to buy supplies already owned as notes. Notes generate an explicit unnote-at-bank action. Their actual quantity remains in `have.noted`; it is not relabelled as a bank container quantity.
- `BANK` remains the existing preparation-action category for a required bank visit. Its captions and action text distinguish notes from banked stock. Optional `unnote` units travel in the plan payload; old clients/plugins can ignore the additive field while retaining the action text.
- Combat food now separates usable bag healing, noted healing and bank healing. A trip covered by notes requires unnoting, not another purchase. Quest food reservations remain protected. Duplicate names in the food alternative list do not count an item twice.
- The Java pre-entry guard directs owned notes to a bank; notes do not satisfy the carried guard. The single HUD uses the unnote headline/action when the app supplies it. No new panel, extra overlay or layout change was introduced.
- A partially held recipe ingredient is a deficit, not an INVENTORY-ready line. The bank action requests the missing usable quantity.
- Slot estimates use actual known potion bottles, preserve dose-size identity and aggregate a dose family's pull across deadlines. Existing bag supplies are not subtracted a second time for the next deadline. Adding to an existing rune stack needs no extra slot. Slot estimates remain conservative for freeing a consumed note stack and unknown purchases.

## Verification

- 118 Vitest files / 1,628 tests passed; TypeScript/Vite build and data validation passed (0 errors/warnings).
- Full Java suite passed: 591 tests, 0 failures/errors/skips. A newly added HUD test initially used the wrong test-helper type; that test compilation issue was fixed before the successful full run.
- Focused real-browser cases passed at 390 and 1280 CSS pixels: unnote caption, actual outbound plan field, no horizontal overflow/console errors, and action clearing after a subsequent OWNED event.
- The full browser smoke and Windows packaged CI must also pass for this follow-up. There is no claim of a live RuneLite session.

## Still open

- T03 exact-ID/name collisions, stricter legacy-data certainty, and complete Java/TS tool eligibility parity (including Members/quest/charge restrictions). Conservative legacy maximums can undercount separate tools when only part of a family was reported; do not describe them as exact inventory measurements.
- T07 current loadout/quest phase rather than always the first loadout, full recipe acquisition choice and anyOf/healing allocation across all consumers.
- The rest of T04–T17 remains in [the consolidated audit backlog](CODEX_AUDIT_BACKLOG.md). Do not undo these fixes while implementing those tasks.

The owner's installed application, progress files, RuneLite configuration and account have not been modified. Do not publish this partial branch as completion of the route/combat audit.
