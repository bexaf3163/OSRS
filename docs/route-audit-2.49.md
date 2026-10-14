# Route audit 2.49.0

Basis: route export of version 2.48.1. All step IDs are kept; ordering is the array order. Every number below was recomputed from the route's own rewards (`src/data/goals.json` is generated from them and `check-data` verifies it).

## A. Audit findings

| # | Finding | Severity |
|---|---|---|
| 1 | S3-04 told the player to fight or mine "ore"; the working method is Mine on four Structural pillars (Mining 10, any pickaxe). No food or pickaxe pre-flight, no warning that the Guardian hits up to 7. | High |
| 2 | An optional quest (S3-05) was a hard requirement of S3-06, so skipping it stalled the route. | High |
| 3 | A quest could be "complete in the game" while what the route needs from it (wool, flour, ashes, ore, helm) was already used or sold. | High |
| 4 | Waterfall Quest asked for runes, weapons and armour in a tomb that refuses them; the preparation list could not be satisfied in one bank visit. | High |
| 5 | Members route (stage 6 skipped) never trained Woodcutting 36 (Lost City) or Cooking 10 (Recipe for Disaster). S8-04 claimed Woodcutting was "already above both after the F2P route". | High |
| 6 | Monkey Madness I needed Protect from Melee (Prayer 43) but no step produced Prayer 43; the preparation lacked the gold bar, the ball of wool and the Lockpick. | High |
| 7 | Stage goals claimed levels no step produces: Mining 30 (only 10, 15 after Doric), Attack 10 in stage 1, Attack and Strength 50-60 in stage 6, Prayer 25-43 before any Prayer step. | Medium |
| 8 | Stage 6 was a mandatory F2P grind in the model although Members mode skips it. S6-01 title (Combat 50-60) and method (Ranged) disagreed. | Medium |
| 9 | Safety text used fixed HP thresholds ("below 15", "below 20"). | Medium |
| 10 | Data quality: moss giants named for Hill Giant drops, "Trout x10 or Salmon x8" as two rows, Nature rune amount, Bond price in two figures, stale kill counts. | Low |
| 11 | Daero's choice (Attack 60 / Dragon scimitar) was static text. | Low |

## B. Changes by group

- **Route model:** `softRequires`, `optional`, `bondBranch`, `carryover`, `loadouts`, `rewardChoice`, `StepItemRequirement.phase`, `CompletionTrigger.atLeast`, stage line `mh`, pre-flight `alt`.
- **Route data:** S3-04 rework, S3-05/S3-06 relation, carryover on S1-03/04/08/12 and S2-11, S6-01..05 as the optional Bond branch, S7-01 loadouts, new S8-06 (Prayer 43), S8-03 optional, S8-04 trains Woodcutting 36 and Cooking 10, S9-04 preparation, safety text, data fixes.
- **App:** Goals page (nine stages, guaranteed / range / optional cells), step cards (carry note, loadouts, reward choice), Members mode drops the Bond branch.
- **Plugin:** milestone varbits, tool alternatives, per-line max hit, pillar highlight. Protocol 6 unchanged.

## C. Route before and after

| Stage | Before (2.48.1) | After (2.49.0) |
|---|---|---|
| 3 | S3-05 required by S3-06 | S3-05 optional, S3-06 only suggests it |
| 6 | Mandatory F2P grind, Combat 50-60 | Optional Bond branch: Ranged 50, Fishing/Cooking 50, Mining/Woodcutting 60, Magic 55, Bond. Dropped in Members mode |
| 7 | Same order | Waterfall → Fight Arena → Tree Gnome Village → Agility 25 → Grand Tree (quest XP first, as before) |
| 8 | Priest in Peril, Nature Spirit, Agility 40, skill step, Animal Magnetism | Agility 40 optional; S8-04 adds Woodcutting 36 and Cooking 10; new S8-06 Prayer 43 |
| 9 | Lost City, Fairytale I and II (start), MM1, RfD | MM1 requires S8-06 and has four loadouts and the Daero choice |

Defence stays at 1 until Dragon Slayer I (S5-09 gives 33), and no early Defence grind was added.

Geography: S2-04 → S2-05 → S2-06 was kept. Rune Mysteries ends at the Wizards' Tower, the closest point to S2-07 (Falador); swapping Romeo & Juliet and Rune Mysteries would only trade one walk for another and would break the ascending-ID check. Stage 3 was not reordered for the same reason (quest point thresholds).

## D. Data model changes

See `src/types/index.ts`: `Step.softRequires`, `Step.optional`, `Step.bondBranch`, `Step.carryover`, `Step.loadouts`, `Step.rewardChoice`, `StepItemRequirement.phase`, `CompletionTrigger.atLeast`, `QuestStageLine.mh`, `StagePre.alt`, `QuestStageItem.alt`, `GoalValue.kind`, `GoalValue.from`. Libraries: `carryover.ts`, `toolTiers.ts`, `daero.ts`, `alchemy.ts`. All optional: an old payload behaves as before.

## E. Below Ice Mountain result

- Recommended: Mine four Structural pillars (corner objects, "Mine" option, Mining 10 and any pickaxe). Each breaks and hurts the Ancient Guardian (level 25, 40 HP, up to 7 crush).
- Safe fallback: lure it to the east side and retreat into the entrance passage; then Ranged or Magic.
- Pre-flight: any pickaxe tier and 10-15 food; Mining 10 is a requirement.
- Health: warns below two hits (under 14 HP) and says "eat now" at 7, while the fight line is current.
- Highlight: "Structural pillar"; a broken pillar is no longer a target.
- Completion: only from the quest state.
- Not done: a live "n/4 pillars" counter (the game gives no reliable variable), and a verified safe-tile highlight (the safespot is described, not drawn).

## F. Validation results

- Vitest: 914 passed (new `tests/routeModel.test.ts`, updated goal tests).
- `check-data`: 0 errors, 0 warnings, including the new goal, quantity and requirement checks.
- Java: full suite passed, including `RouteModelTest`.
- Not run: the Quest Helper generator (no Python here); not confirmed in the live game.

## G. Remaining recommendations

1. Confirm the Structural pillar fight, the Waterfall loadouts and Monkey Madness I in the live game.
2. Static prices in the step texts ("about 105 gp") are approximate; the app shows live prices. A later pass could remove them from prose.
3. Membership detection is not automatic: Members mode is the player's choice.
4. A "pillars left" counter and a drawn safe tile for S3-04 need a verified tile or variable.
5. Re-run `tools/qh-machines` on a machine with Python after the next Quest Helper update.
