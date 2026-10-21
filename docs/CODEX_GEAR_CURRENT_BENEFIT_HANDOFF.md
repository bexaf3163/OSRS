# Gear: current damage versus projected training value

Partial T11 follow-up after skill availability. Not included in the first audit preview EXE.

## Reproduced defect

Gear's ranking value averages damage over the current and next Strength levels. It was also printed as the current expected damage increase and could admit a change that reduced damage at the current levels. A 600-configuration regression matrix (five Attack/weapon tiers, Strength 1–60, strength/power amulets, Hill Giant) reproduced multiple do-now downgrades. For example, at Attack 1/Strength 36 an amulet swap reduced the model's current DPS by about 8% while qualifying on its future average.

## Focused repair

- Do-now/save-up actionable candidates cannot reduce current model DPS beyond the existing 0.1% comparison tolerance merely to obtain a future average gain.
- `Gain.ratio` remains explicitly the training-window value, preserving existing comparison/ranking behavior among the admitted choices. Current damage percentages in `gainText` use `after.dps / before.dps` instead.
- A benefit present only in the average is labelled as a training average over up to ten Strength levels; it is not printed as a current increase. Negative current comparisons, when displayed as non-actionable comparison data, retain their negative sign.
- The compact prompt says "Suggested gear change" instead of universally promising faster hits. Existing attack-interval, accuracy, defence, ownership, budget/reserve and one-recommendation disclosure remain intact.

## Validation and scope

The added downgrade matrix failed before the repair and passes afterward. The existing larger opponent/amulet/style text sweep now also asserts that displayed current percentages agree with the underlying current DPS, rather than the future average. Full Vitest passed 1,677 tests in 128 files; build/TypeScript, data validation (0 errors/warnings), Java testClasses and focused browser Gear scenarios at 1440/390 passed. Browser cases retain owned-before-buy, one primary action, folded secondary data, offline/unknown handling, no overflow and no console errors. Full cumulative CI is separate from these local results.

"Current" here means the existing melee model at current levels with its selected best style and first comparison foe. It is not a measured game session or proof that the player's active attack style/prayers/boosts match the model. Passing the actual phase/style, broader worn-slot bonuses and foe variants, no-target uncertainty, full acquisition/travel cost, meaningful defensive tradeoffs, future-only upgrade prioritization and ranged/magic comparisons remain separate open work. Do not call this completion of Gear or T11.
