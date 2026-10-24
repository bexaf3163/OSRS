# Combat audit

Written by `tests/combatAudit.test.ts` from `src/data/combatAudit.json` (revision 2026-10-18) and the route data. Do not edit by hand: change the ledger or the route and run `UPDATE_FIXTURES=1 npx vitest run tests/combatAudit.test.ts`.

Every stage of the route where the player fights or can be attacked, checked against the route text, the quest stage lines (Quest Helper), the OSRS Wiki infoboxes in combatFoes.json and the danger zones. The rule for a fight the quest cannot go on without: its food is a required item (readiness and the game check it before leaving), the app estimates it with the player's kit where it has the opponent's numbers, and an unread kit or bag is reported as not checked, never as ready.

27 stages: 11 retained, 11 revised, 2 with a branch, 3 deferred.

| Step | Kind | Mandatory | Opponents | Method | Estimate | Food in the item list | Decision |
|---|---|---|---|---|---|---|---|
| S1-06 The Restless Ghost | avoid | no | Skeleton (13) | run | - | - | Retain |
| S1-07 Misthalin Mystery | not-combat | yes | - | none | - | - | Retain |
| S1-13 Money for the shopping: cowhides | incidental | no | Cow (2) | melee | Cow | - | Retain |
| S2-03 Witch's Potion | incidental | yes | Rat (1), Giant rat (3) | melee | - | - | Retain |
| S2-07 The Knight's Sword | avoid | yes | Ice giant (53), Ice warrior (57) | run | - | - | Deferred |
| S2-08 Vampyre Slayer | quest-fight | yes | Count Draynor (34) | melee | Count Draynor | Trout 10 | Revised |
| S2-09 Pirate's Treasure | incidental | yes | Gardener (4) | melee | - | - | Retain |
| S3-02 Black Knights' Fortress | avoid | yes | Black Knight (33) | run | - | Trout 5 | Revised |
| S3-03 Demon Slayer | quest-fight | yes | Delrith (27), Dark wizard (20) | melee | - | - | Deferred |
| S3-04 Below Ice Mountain | quest-fight | yes | Ancient Guardian (25) | other | - | Trout 10 | Revised |
| S3-05 Shield of Arrav | incidental | yes | Jonny the Beard (2), Weaponsmaster (23) | melee | - | - | Retain |
| S3-08 Strength to 20 and Attack to 30 | training | yes | Minotaur (12) | melee | Minotaur | Salmon 20 | Branch |
| S4-01 The Corsair Curse | quest-fight | yes | Ithoi the Navigator (35) | melee | Ithoi the Navigator | Salmon 10 | Revised |
| S4-02 The Ides of Milk | quest-fight | yes | Brutus (30) | melee | Brutus | Trout 5 | Revised |
| S4-03 Attack to 40 | training | yes | Giant frog (13) | melee | Giant frog | Salmon 25 | Branch |
| S5-03 Map piece 1: Melzar's Maze | quest-fight | yes | Melzar the Mad (43), Lesser demon (82) | melee | Melzar the Mad | Salmon 10 | Retain |
| S5-08 The battle with the dragon Elvarg | quest-fight | yes | Elvarg (83) | melee | Elvarg | Lobster 20+ | Retain |
| S6-01 Ranged to 50 with a prepared ranged loadout | training | no | Seagull (3), Monk, Giant frog | other | - | - | Revised |
| S6-04 Magic to 55 (High Level Alchemy) | training | no | Cow, Chicken | other | - | Trout 5 | Revised |
| S7-02 Fight Arena | quest-fight | yes | Khazard Ogre (63), Khazard scorpion (44), Bouncer (137) | safespot | - | - | Retain |
| S7-03 Tree Gnome Village | quest-fight | yes | Khazard warlord (112) | safespot | - | - | Retain |
| S7-05 The Grand Tree | quest-fight | yes | Black demon (172) | safespot | - | - | Retain |
| S8-01 Priest in Peril | quest-fight | yes | Temple Guardian (30), Monk of Zamorak (30) | melee | Temple Guardian | Trout 5 | Revised |
| S8-02 Nature Spirit | quest-fight | yes | Ghast (30) | melee | Ghast | Lobster 15 | Revised |
| S9-01 Lost City | quest-fight | yes | Zombie (25), Tree spirit (101) | safespot | - | - | Revised |
| S9-02 Fairytale I - Growing Pains | quest-fight | yes | Tanglefoot (111) | other | - | - | Deferred |
| S9-04 Monkey Madness I | quest-fight | yes | Jungle demon (195), Monkey zombie, Gorilla | safespot | - | - | Revised |

## S1-06 The Restless Ghost

**Retain.** A skeleton appears at the altar while you take the ghost's skull; the quest does not need it dead.

Quest stage lines: 3.1.

Assumptions:

- Running away is enough: the skull is already in the bag when it appears.

Alternatives:

- Kill it for a little XP: not needed and not suggested.

Evidence:

- Quest stage line 3.1 (Quest Helper): it can be run from.
- Food is recommended only (Cooked chicken, Shrimps).

## S1-07 Misthalin Mystery

**Retain.** "Fight" on Abigale is a menu option of the mystery; no combat happens.

Quest stage lines: 7.4.

Evidence:

- Quest stage line 7.4: "no actual combat occurs".

## S1-13 Money for the shopping: cowhides

**Retain.** Cows for cowhides to pay for the shopping; any combat XP is a side effect.

Assumptions:

- A cow cannot threaten a new character: no food is asked for.

Problems:

- Cowhides cannot be sold by a trade-restricted account; the funding system (2.64) counts them only when the restriction is lifted.

Alternatives:

- The funding system offers other ways to raise the coins when hides cannot be sold.

Evidence:

- combatFoes.json: Cow, max hit 1.
- tests/funding: restricted items are never counted as realised coins.

## S2-03 Witch's Potion

**Retain.** Kill a rat for its tail and a giant rat for meat to burn.

Quest stage lines: 1.0, 1.2.

Assumptions:

- Level 1 to 3 rats are no danger to a character past the tutorial.

Alternatives:

- Raw beef from a cow works instead of rat meat (route text).

Evidence:

- Quest stage lines 1.0 and 1.2.

## S2-07 The Knight's Sword

**Deferred.** Mine blurite ore in the Asgarnian Ice Dungeon, where ice giants (53) and ice warriors (57) attack: run in, mine, leave.

Quest stage lines: 3.0.

Assumptions:

- The player does not fight them; the Trout (10, recommended) covers the hits taken on the way.

Problems:

- No in-game danger zone for the dungeon: the route has no surveyed area for it, so the game does not warn on entry.
- The app has no numbers for ice giants or ice warriors, so the food is not sized to the kit.

Alternatives:

- None in the route: blurite is only mined there.

Evidence:

- Step field "Dangerous" and quest stage line 3.0.
- dangerZones.json has no entry for the Asgarnian Ice Dungeon.

## S2-08 Vampyre Slayer

**Revised.** Kill Count Draynor (34, 35 hit points, hits up to 3) with the stake and the hammer.

Quest stage lines: 3.0, 3.2.

Assumptions:

- Melee on Aggressive with a Strength potion dose; garlic weakens him; a Fire Strike safespot behind the chair is the other way.

Problems:

- The Trout was only recommended, so readiness and the game's departure check never looked at it.

Alternatives:

- Safespot behind the chair with Fire Strike (route safespot text).

Changed:

- 2.66.0: Trout (10, or Salmon, Tuna, Lobster, Swordfish) is a required item: checked before leaving and sized up by the fight estimate when the kit needs more.

Evidence:

- Step field "Combat"; combatFoes.json (wiki infobox).
- Danger zones warn about the stake, the hammer and the garlic.

In-game danger zones: draynor-manor-stake, draynor-manor-hammer, draynor-manor-garlic.

## S2-09 Pirate's Treasure

**Retain.** The Gardener (level 4) appears when you dig in Falador Park; kill him and dig again.

Quest stage lines: 3.3.

Assumptions:

- Level 4 is no danger at this point of the route.

Evidence:

- Quest stage line 3.3.

## S3-02 Black Knights' Fortress

**Revised.** Black Knights (33) attack inside the fortress while you listen at the grill and drop the cabbage.

Quest stage lines: 1.0.

Assumptions:

- The route does not need them dead: walk past, eat if they catch you. A full kill estimate (25 to 50 Trout for a character at this point) would overstate the need, so none drives the food.

Problems:

- The 5 Trout the step text asks for were only recommended: nothing checked them before the fortress.

Alternatives:

- Fight them or walk past quickly: the route does not need them dead.

Changed:

- 2.66.0: Trout ×5 (or better fish) is a required item.

Evidence:

- Step field "Disguise"; quest stage line 1.0; combatFoes.json (Black Knight, hostile).

## S3-03 Demon Slayer

**Deferred.** Kill Delrith (27, 7 hit points, hits up to 3) with Silverlight while the dark wizards (7 and 20, magic up to 6) attack on sight.

Quest stage lines: 0.0, 1.0, 4.1.

Assumptions:

- Delrith dies in a few hits; the risk is the wizards' magic.

Problems:

- The Trout (5) is only recommended: the 25 Bones for Traiborn and the food do not fit the bag together in the item list, and the step has no loadouts that would take the food on a later bank visit.
- The app has no numbers for Delrith (the wiki infobox gives the generator no single max hit) or the dark wizards: the fight is not estimated.

Evidence:

- Step field "Combat"; quest stage line 4.1 (lines 0.0 and 1.0 are dialogue).
- Danger zone dark-wizards-varrock warns on the way.

In-game danger zones: dark-wizards-varrock.

## S3-04 Below Ice Mountain

**Revised.** Beat the Ancient Guardian (25, 40 hit points, hits up to 7) by mining the four Structural pillars while it keeps attacking.

Assumptions:

- Mining 10 and any pickaxe; eat before each pillar. A melee estimate would mislead, so none is shown.

Problems:

- The 10 to 15 Trout or Salmon the step asks for were only recommended, and there is no bank before the fight.
- The step did not name the Guardian, so the method line never showed.

Alternatives:

- Fallback in the route: lure it to the east side and safespot it from the entrance passage with Ranged or Magic.

Changed:

- 2.66.0: Trout ×10 (or better food) is a required item; the Guardian is the step's threat, which shows the pillar method in the food card.

Evidence:

- Step fields "Combat", "Recommended method", "Bring", "Fallback: safespot"; combatFoes.json (Ancient Guardian, golem).

## S3-05 Shield of Arrav

**Retain.** Kill Jonny the Beard (2) for the report and the Weaponsmaster (23, 20 hit points, hits up to 3) for the crossbows.

Quest stage lines: 2.2, 3.2.

Assumptions:

- A max hit of 3 against a character with Attack 30 or more is no real danger.

Evidence:

- Quest stage lines 2.2 and 3.2; OSRS Wiki infobox of the Weaponsmaster (20 hit points, max hit 3), read 2026-10-18.

## S3-08 Strength to 20 and Attack to 30

**Branch.** Strength 20 and Attack 30 on the level 12 Minotaurs.

Assumptions:

- Defence stays at 1 unless the player adopts a Defence plan.

Alternatives:

- Defence first on cows, compared by the combat plans (2.65).

Changed:

- 2.65.0: the step's plans are compared for the player's levels and gear; 2.65.1: a Defence plan must beat the route on the middle estimate while Dragon Slayer I's Defence XP is ahead.

Evidence:

- tests/combatRoute (plans, pick, later).

## S4-01 The Corsair Curse

**Revised.** Kill Ithoi the Navigator (35, 55 hit points, hits up to 6 with magic).

Quest stage lines: 3.0, 3.1.

Assumptions:

- Melee with the Adamant scimitar and a Strength potion dose; eat before your health falls to 12.

Problems:

- The step had no food at all: readiness said Ready with nothing to check.

Alternatives:

- Magic (quest stage line 3.0).

Changed:

- 2.66.0: Salmon ×10 (or Trout, Tuna, Lobster, Swordfish) is a required item, sized up by the fight estimate when the kit needs more.

Evidence:

- Step field "Combat"; combatFoes.json; threats.json (max hit 6).

## S4-02 The Ides of Milk

**Revised.** Beat Brutus (30, 58 hit points): plain hits up to 3 cannot kill in the quest, his specials (up to 19) can.

Quest stage lines: 4.0.

Assumptions:

- Dodging the specials is the real defence; food keeps health above a special that lands.

Problems:

- The step had no food at all.
- The estimate counts only his plain hits: the food it gives is a lower bound (said in the fight line).

Changed:

- 2.66.0: Trout ×5 is a required item, with the special's 19 in its note.

Evidence:

- Step field "Combat"; threats.json (melee 3, special 19).

## S4-03 Attack to 40

**Branch.** Attack 40; no mandatory loot quota.

Assumptions:

- Surface level 13 frogs only; current gear and levels drive estimates.

Problems:

- Slow and food-hungry for the reported character (Attack 30, Strength 21, Defence 1, HP 24, iron armour).

Alternatives:

- Compare cows and level 12 minotaurs; Defence-first includes its training cost.

Changed:

- 2.65.0: the plans are compared and one can be adopted: arrow, food, shopping and the game follow it.
- 2.65.1: Dragon Slayer I's 18,650 Defence XP is counted before Defence training is recommended.
- 2.74.2: replace mandatory Hill Giant funding detour with surface Giant frogs; training completes at Attack 40. Funding remains separate.

Evidence:

- tests/combatRoute/plans.test.ts, pick.test.ts, later.test.ts; UI smoke (combat).

## S5-03 Map piece 1: Melzar's Maze

**Retain.** Melzar's Maze: the marked rat, ghost, skeleton and zombie, Melzar the Mad (43, hits up to 5) in melee, the lesser demon from the safespot.

Quest stage lines: 0.1, 1.0, 2.0, 3.0.

Assumptions:

- The demon is fought with Water Strike from the safespot, where it cannot reach you: no melee estimate is shown for it.

Evidence:

- Step fields; Salmon ×10 required; combatFoes.json; danger zone for the demon.

In-game danger zones: melzar-lesser-demon.

## S5-08 The battle with the dragon Elvarg

**Retain.** Kill Elvarg (83, 80 health) with the Anti-dragon shield worn.

Quest stage lines: 1.2.

Assumptions:

- With the shield her fire hits up to 10; without it up to 70.

Alternatives:

- A Rune sword on Stab if owned.

Evidence:

- Lobster 20+ required; the shield is a safety rule (readiness blocks without it, and a two-handed weapon is flagged).
- Danger zones on the boat and in the lair.

In-game danger zones: crandor-boarding, elvarg-lair.

## S6-01 Ranged to 50 with a prepared ranged loadout

**Revised.** Optional Ranged to 50 using a level-appropriate F2P bow, one equipped arrow stack and the current trainer.

Assumptions:

- The starter seagull must be the level-3 variant; generic name highlights cannot distinguish it.
- Rapid after Ranged 5; do not use Longrange when preserving Defence.

Problems:

- Ranged DPS, whole-goal ammunition consumption and food are not simulated; 100 arrows and the later food quantity are starter supplies, not a survival guarantee.
- Crossbows, thrown weapons and Members loadouts are not covered by this F2P bow planner.

Alternatives:

- Monks provide healing between fights; Giant frogs require food.
- Flesh crawlers retain their Defence 40 guard and written directions only.
- Compare ogresses as a later income option, not the level-1 default.

Changed:

- Unreleased 2.74.3: canonical trainer, equipped bow/ammunition and supply projection replace the fixed ogress route.

Evidence:

- https://oldschool.runescape.wiki/w/Free-to-play_Ranged_training
- https://oldschool.runescape.wiki/w/Ranged_bows
- tests/rangedPreparation.test.ts

## S6-04 Magic to 55 (High Level Alchemy)

**Revised.** Optional Magic55 using spell-dependent supplies: budget Strikes or an actually usable Superheat iron batch.

Assumptions:

- Select the named spell; equipped elemental staff substitution is explicit.
- Remove metal armour and verify actual combat damage/XP; no full Magic attack/weakness simulation is claimed.

Problems:

- Full-goal costs, complete magic equipment/weakness modelling and measured combat rates remain open.
- Alchemy targets and splash setup are not automatically verified; those methods remain manual alternatives.

Alternatives:

- Prepared Superheat iron needs Magic43 and Smithing15.
- Known higher Strike ingredients can replace the Wind Strike fallback.

Changed:

- Unreleased2.74.3: canonical method projection replaces the Nature-only fallback and unverified automatic alchemy/splash selection.

Evidence:

- https://oldschool.runescape.wiki/w/Free-to-play_Magic_training
- https://oldschool.runescape.wiki/w/Superheat_Item
- tests/magicRouteSupplies.test.ts

## S7-02 Fight Arena

**Retain.** Fight Arena: the Khazard Ogre (63), the scorpion (44) and Bouncer (137), each from behind a skeleton with Fire Bolt.

Quest stage lines: 1.1, 1.2, 1.5, 1.6.

Assumptions:

- All of them fight only up close, so the safespot holds.

Problems:

- No melee estimate applies; the food (Lobster 10) is recommended only.

Alternatives:

- A bow from the same cover.

Evidence:

- Step field "Magic from a safespot" and the safespot text (wiki quick guide).

## S7-03 Tree Gnome Village

**Retain.** Defeat the Khazard warlord (112, 170 hit points, hits up to 10) from the safespot by the dead tree with Fire Bolt.

Quest stage lines: 2.2, 2.3.

Assumptions:

- He gets caught between the wall and the tree; about 31 casts, 50 brought.

Evidence:

- Step field "Magic from a safespot" (wiki quick guide).

## S7-05 The Grand Tree

**Retain.** Kill the Black demon (172, 157 hit points, hits up to 16) from the spot north of the entrance ladder.

Quest stage lines: 2.0, 3.1, 5.0, 5.1.

Assumptions:

- The safespot holds for the whole fight; Water Bolt hits it harder.

Alternatives:

- Ranged or a halberd from the same spot.

Evidence:

- Step field "Magic from a safespot"; lines 2.0 and 3.1 are dialogue and an optional choice.

## S8-01 Priest in Peril

**Revised.** Kill the Temple Guardian (30, 45 hit points, hits up to 3; immune to magic) and a Monk of Zamorak (30) for the key.

Quest stage lines: 1.1, 2.1.

Assumptions:

- Melee or Ranged; the monk can be safespotted with the pews.

Problems:

- The step named no threat and no food: readiness said Ready with nothing to check, and the app had no numbers for the Guardian.

Alternatives:

- Ranged.

Changed:

- 2.66.0: the Temple Guardian is in combatFoes.json (wiki infobox) and is the step's threat; Trout ×5 is a required item.

Evidence:

- Quest stage lines 1.1 and 2.1; OSRS Wiki infobox Temple Guardian, read 2026-10-18.

## S8-02 Nature Spirit

**Revised.** Kill three ghasts (30, 45 hit points, hits up to 3) in Mort Myre; they rot food in the bag.

Quest stage lines: 2.1.

Assumptions:

- Spare food covers what the ghasts rot.

Problems:

- The 15 lobsters the step text asks for were not in the item list.
- The app had no numbers for the Ghast, a members-only opponent.

Changed:

- 2.66.0: the Ghast is in combatFoes.json (members versions are used when there is no free one) and Lobster ×15 is a required item.

Evidence:

- Step field "Combat"; OSRS Wiki infobox Ghast, read 2026-10-18.

## S9-01 Lost City

**Revised.** Kill zombies (25) with Fire Strike until one drops an axe, then the Tree Spirit (101, 85 hit points, hits up to 10) with Fire Strike from between the mushrooms to the south-west.

Quest stage lines: 2.2, 2.4.

Assumptions:

- The safespot between the south-west mushrooms holds.

Problems:

- No weapons or armour are allowed on Entrana, so the fight is magic only, but no runes were in the kit; the instant teleport the wiki asks for to leave the dungeon was missing; no food in the item list and no numbers for the Tree Spirit in the app.

Alternatives:

- Melee with a Ring of recoil and a Prayer potion (wiki quick guide); the bronze axe is too weak.

Changed:

- 2.74.6: Fire Strike runes for about 65 casts (195 Fire, 130 Air, 65 Mind) and a Lumbridge teleport are required items and are checked on the Entrana line; the lines name the south-west mushroom safespot, the greater demons to run past and the Wilderness door.

Evidence:

- OSRS Wiki Lost City, Lost City/Quick guide and Tree spirit (Lost City), read 2026-10-24; quest stage lines 2.2 and 2.4.

## S9-02 Fairytale I - Growing Pains

**Deferred.** Kill the large Tanglefoot (111) with the Magic secateurs, the only thing that damages it.

Quest stage lines: 4.0, 4.2.

Assumptions:

- It can be flinched on a corner.

Problems:

- The 10 lobsters the step asks for are recommended only; no estimate (the secateurs are not in the gear data as a weapon).

Evidence:

- Step field "Combat"; quest stage lines 4.0 and 4.2.

## S9-04 Monkey Madness I

**Revised.** Monkey Madness I: monkeys for bones (optional), and the Jungle Demon (195, hits up to 32) with Protect from Magic from three squares away.

Quest stage lines: 7.0, 8.1, 8.2, 8.3, 8.4, 11.0, 11.1.

Assumptions:

- Prayer 43 and the loadouts' lobsters (15, 15, 10).

Problems:

- The step said to hit the demon with Ranged, but no bow or arrows were in the kit or the final loadout.

Alternatives:

- The gnome method without Protect from Magic (wiki strategy); a Dwarf multicannon.

Changed:

- 2.74.6: a bow (Maple shortbow or the best one the player can wield) and 100 arrows are required items, in the final loadout and checked before the fight; the fight line follows the wiki strategy (stand still, Protect from Magic, three squares away, last hit yourself).

Evidence:

- Step fields "Requirements" and "Dangers"; safespot text; loadouts karamja, atoll, final; OSRS Wiki Jungle demon (ranged defence +0, magic +50, slash +50), read 2026-10-24.

