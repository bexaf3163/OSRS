# Readiness verdict (2.62.0)

One answer on top of the preparation plan (`src/lib/prepPlan.ts`, the single decision of what a step needs): `src/lib/readinessVerdict.ts`.
It adds no requirement of its own. For a combat training step the kit check `src/lib/combatReadiness.ts` (on the personal estimate,
`combatPlan.ts` / `combatEstimate.ts`) supplies the weapon, armour, trip food and opponent version.

## Statuses

| Status | When |
|---|---|
| Requirements not met | a level, quest, closed step or members requirement (`plan.blockers` minus the safety rules) |
| Cannot assess yet | no game connection; or something needed now is not in the bag and the bank is unknown |
| Preparation needed | something needed now is in the bank or missing; a safety rule is broken (Elvarg's shield, also when a two-handed weapon is worn); the trip food is short; coins are short |
| Ready with cautions | nothing blocks, but: the next steps need something from the bank, a supply is low, the bag will not fit, heavy, a bank copy from an earlier session was relied on, armour slots empty, a rough estimate |
| Ready | none of the above |

## Groups under "Why"

Access and quest requirements · Needed for this activity · Safety supplies (food, safety rules, armour) · Not checked yet · Optional upgrades
(never change the status).

## Bank freshness

`live` (seen this session), `saved` (the plugin's copy from an earlier session, `bankSavedAt`), `never` (not opened), `offline`. A saved copy is
named in the cautions when the advice leans on the bank.

## Food

- By healing, in pieces of the step's food (`ownedFood`: `carriedEq`, `bankEq`). The pre-entry guards (`preflight.ts` `countOf`, `Preflight.java`
  `count`) do the same with the wiki food table (`src/data/threats.json`, bundled into the plugin). A food the table does not know counts as one
  piece of the named food, never more.
- Edible items a later open quest needs are reserved (`foodReservations`) and taken out of the bag count first.
- The trip need is the estimate's `nextTrip` (capped by the bag); the versions of an opponent are compared on the whole goal (food and time).

## Tools

A pickaxe or axe tier counts only from its skill level (`toolTiers.ts` `toolUse`/`usableAt`, `ItemCounts.setToolLevels`): Bronze/Iron 1, Steel 6,
Black 11, Mithril 21, Adamant 31, Rune 41 (Gilded 41), Dragon 61 (Infernal, 3rd age 61), Crystal 71. An unknown level counts every tier. Method
tools are not tiers: a harpoon never stands in for a net.

## In the game

`plan.readiness` `{status, headline}` in the snapshot (additive; older plugins ignore it; a bad value is dropped and the plan stands). Shown at the
top of the bank card and first under the Advice tab; not on the Steps tab (no flicker while eating). The pre-entry guards behave as before except
for healing and tool levels.

## Supported

- Supported: combat training steps with an opponent in `combatFoes.json` (Minotaur L12/L27, Hill Giant and the other route trainers), the
  pre-entry guards in `questStages.json` (Below Ice Mountain, the Black Knights' Fortress, Draynor Manor, Delrith, Ithoi and the rest), Elvarg's
  shield.
- Partially: quest fights without a combat model get the plan's items and guards, not a trip-food estimate.
- Not modelled: prayer, poison, ranged and magic kits, gathering trip lengths. The app has no account-build (pure) setting; the advice never
  trains Defence.
