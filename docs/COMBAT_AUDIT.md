# Combat audit

Written by `tests/combatAudit.test.ts` from `src/data/authored/combatAudit.json` (revision 2026-11-10) and the route data. Do not edit by hand: change the ledger or the route and run `UPDATE_FIXTURES=1 npx vitest run tests/combatAudit.test.ts`.

Every stage of the route where the player fights or can be attacked, checked against the route text, the quest stage lines (Quest Helper), the OSRS Wiki infoboxes in combatFoes.json and the danger zones. The rule for a fight the quest cannot go on without: its food is a required item (readiness and the game check it before leaving), the app estimates it with the player's kit where it has the opponent's numbers, and an unread kit or bag is reported as not checked, never as ready.

26 stages: 6 retained, 19 revised, 0 with a branch, 1 deferred.

| Step | Kind | Mandatory | Opponents | Method | Estimate | Food in the item list | Decision |
|---|---|---|---|---|---|---|---|
| S1-06 The Restless Ghost | avoid | no | Skeleton (13) | run | - | - | Retain |
| S1-07 Misthalin Mystery | not-combat | yes | - | none | - | - | Retain |
| S2-03 Witch's Potion | incidental | yes | Rat (1), Giant rat (3) | melee | - | - | Retain |
| S2-07 The Knight's Sword | avoid | yes | Ice giant (53), Ice warrior (57) | run | - | Trout 10 | Deferred |
| S2-08 Vampyre Slayer | quest-fight | yes | Count Draynor (34) | melee | Count Draynor | Trout 10 | Revised |
| S2-09 Pirate's Treasure | incidental | yes | Gardener (4) | melee | Gardener | - | Retain |
| S2-10 Prince Ali Rescue | avoid | yes | Jail guard (26) | run | - | - | Revised |
| S2-11 Ernest the Chicken | incidental | yes | Skeleton (22) | melee | Skeleton | - | Retain |
| S3-02 Black Knights' Fortress | avoid | yes | Black Knight (33) | run | - | Trout 5 | Revised |
| S3-03 Demon Slayer | quest-fight | yes | Delrith (27), Dark wizard (20) | melee | Delrith | Trout 5 | Revised |
| S3-04 Below Ice Mountain | quest-fight | yes | Ancient Guardian (25) | melee | Ancient Guardian | Trout 10 | Revised |
| S3-05 Shield of Arrav | incidental | yes | Jonny the Beard (2), Weaponsmaster (23) | melee | - | - | Retain |
| S4-01 The Corsair Curse | quest-fight | yes | Ithoi the Navigator (35) | melee | Ithoi the Navigator | Salmon 10 | Revised |
| S4-02 The Ides of Milk | quest-fight | yes | Brutus (30) | melee | Brutus | Trout 5 | Revised |
| S5-03 Map piece 1: Melzar's Maze | quest-fight | yes | Melzar the Mad (43), Lesser demon (82) | melee | Melzar the Mad, Lesser demon | Salmon 10 | Revised |
| S5-08 The battle with the dragon Elvarg | quest-fight | yes | Elvarg (83) | melee | Elvarg | Lobster 20+ | Revised |
| S7-01 Waterfall Quest | avoid | yes | Fire giant (86), Moss Guardian (84) | run | - | - | Revised |
| S7-02 Fight Arena | quest-fight | yes | Khazard Ogre (63), Khazard Scorpion (44), Bouncer (137) | safespot | Khazard Ogre, Khazard Scorpion, Bouncer | Lobster 10 | Revised |
| S7-03 Tree Gnome Village | quest-fight | yes | Khazard warlord (112) | safespot | Khazard warlord | Lobster 10 | Revised |
| S7-05 The Grand Tree | quest-fight | yes | Black demon (The Grand Tree) (172) | safespot | Black demon (The Grand Tree) | Lobster 10 | Revised |
| S7-07 Witch's House | quest-fight | yes | Witch's experiment (53) | melee | Witch's experiment | Trout 5 | Revised |
| S8-01 Priest in Peril | quest-fight | yes | Temple Guardian (30), Monk of Zamorak (30) | melee | Temple Guardian | Trout 5 | Revised |
| S8-02 Nature Spirit | quest-fight | yes | Ghast (30) | melee | Ghast | Lobster 15 | Revised |
| S9-01 Lost City | quest-fight | yes | Zombie (25), Tree spirit (Lost City) (101) | safespot | Tree spirit (Lost City) | - | Revised |
| S9-02 Fairytale I - Growing Pains | quest-fight | yes | Tanglefoot (111) | other | Tanglefoot | Lobster 10 | Revised |
| S9-04 Monkey Madness I | quest-fight | yes | Jungle Demon (195), Monkey zombie, Gorilla | safespot | Jungle Demon | - | Revised |

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

Changed:

- 2.74.8: Trout ×10 (or Salmon) is a required item: the dungeon entry line already checks it in the bag.

Evidence:

- Step field "Dangerous" and quest stage line 3.0.
- dangerZones.json has no entry for the Asgarnian Ice Dungeon.

## S2-08 Vampyre Slayer

**Revised.** Kill Count Draynor (34, 35 hit points, hits up to 3) with the stake and the hammer.

Quest stage lines: 3.0, 3.2.

Assumptions:

- Melee with the stake, the hammer and the garlic in the inventory, as the step requires them. Estimated from the OSRS Wiki (fightMechanics.json): he restores 1 hit point and 1 drained level every 5 ticks; garlic at full health deals 10 damage, lowers his Attack and Strength by 10 and his Defence by 40, and adds 1 to your damage; hits that do not outpace the regeneration never finish the fight. A Fire Strike safespot behind the chair is the other way.

Problems:

- The Trout was only recommended, so readiness and the game's departure check never looked at it.

Alternatives:

- Safespot behind the chair with Fire Strike (route safespot text).

Changed:

- 2.66.0: Trout (10, or Salmon, Tuna, Lobster, Swordfish) is a required item: checked before leaving and sized up by the fight estimate when the kit needs more.
- 2.86.0: regeneration, the garlic and the stake-and-hammer finish are modelled from the Wiki; a kit that cannot outpace his regeneration is trained or upgraded first instead of ending in a review.

Evidence:

- Step field "Combat"; combatFoes.json (wiki infobox).
- Danger zones warn about the stake, the hammer and the garlic.
- OSRS Wiki Count Draynor (Strategy, Stat restoration), read 2026-11-10; src/data/authored/fightMechanics.json.

In-game danger zones: draynor-manor-stake, draynor-manor-hammer, draynor-manor-garlic.

## S2-09 Pirate's Treasure

**Retain.** The Gardener (level 4) appears when you dig in Falador Park; kill him and dig again.

Quest stage lines: 3.3.

Assumptions:

- Level 4 is no danger at this point of the route.

Evidence:

- Quest stage line 3.3.
- Step field "threats" since 2.86.1: the app estimates the fight with the player's kit, which proves the quest's "survival" requirement (OSRS Wiki, Gardener: level 4, 7 hit points, hits up to 1).

## S2-10 Prince Ali Rescue

**Revised.** Aggressive level 26 jail guards (hits up to 3) attack inside the Draynor jail while you give Joe the beer, tie up Lady Keli and free Prince Ali; the quest needs them only avoided.

Quest stage lines: 6.0.

Assumptions:

- Walking past is the route's method (OSRS Wiki, Prince Ali Rescue: "avoiding the aggressive level 26 jail guards"); no kill estimate drives preparation.

Problems:

- The route said nothing about the guards, so the quest's "evasion" requirement could never be shown met and the planner stopped at a check.

Alternatives:

- Fight them: not needed and not suggested.

Changed:

- 2.86.1: the walkthrough names the guards and says to walk past them; this run-past proves the evasion requirement.

Evidence:

- Quest stage route line 6.0; OSRS Wiki Jail guard (level 26, 32 hit points, hits up to 3), Prince Ali Rescue requirements, read 2026-11-11.

## S2-11 Ernest the Chicken

**Retain.** A level 22 skeleton attacks in Draynor Manor: the quest asks for the ability to defend yourself from it. Kill it, or take what you came for and leave.

Assumptions:

- The free Skeleton in combatFoes.json is level 21 (24 hit points, hits up to 3). The wiki article lists no level 22 version, so the estimate uses it.

Alternatives:

- Run past it: the quest does not need it dead.

Evidence:

- Quest requirement: the ability to defend from a level 22 Skeleton (OSRS Wiki, Ernest the Chicken).
- Step field "foes" since 2.85.0, so the app estimates the fight with the player's kit.

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

**Revised.** Kill Delrith (27, 7 hit points, hits up to 3) with Silverlight while the dark wizards (7 and 20, magic up to 6) attack on sight.

Quest stage lines: 0.0, 1.0, 4.1.

Assumptions:

- Silverlight is the weapon: all damage dealt to Delrith is doubled while it is equipped (OSRS Wiki, Delrith). The circle is single-way combat, so the estimate fights the level 20 and the two level 7 dark wizards first with the same sword, then Delrith; the worst hit is the level 20 wizard's 6.

Problems:

- The Trout (5) was only recommended: the 25 Bones for Traiborn and the food do not fit the bag together, and the food was not tied to the fight's loadout.
- The app had no numbers for Delrith (the generator read an empty infobox field as the next line, fixed in v14) or the dark wizards, and Silverlight's doubled damage was not modelled, so the fight was not estimated.

Changed:

- 2.86.0: Delrith is a threat of the step, estimated with Silverlight's doubled damage after the three dark wizards (fightMechanics.json, combatFoes.json); the Trout is a required item of the fight loadout, taken after the bones.

Evidence:

- Step field "Combat"; quest stage line 4.1 (lines 0.0 and 1.0 are dialogue).
- Danger zone dark-wizards-varrock warns on the way.
- OSRS Wiki Delrith (Silverlight doubles all damage dealt), Demon Slayer (two level 7 and one level 20 dark wizard, single-way combat), read 2026-11-10.

In-game danger zones: dark-wizards-varrock.

## S3-04 Below Ice Mountain

**Revised.** Beat the Ancient Guardian (25, 40 hit points, hits up to 7) by mining the four Structural pillars while it keeps attacking.

Quest stage lines: 4.4.

Assumptions:

- The Wiki says it can be defeated in standard combat or by mining the four pillars. The pillars' mining time is not on the Wiki, so only the melee fight is estimated; the pillars stay the route's other way.

Problems:

- The 10 to 15 Trout or Salmon the step asks for were only recommended, and there is no bank before the fight.
- The step did not name the Guardian, so the method line never showed.
- With no estimate the planner stopped at "Review the combat strategy" for every account.

Alternatives:

- Mine the four Structural pillars (Mining 10, any pickaxe) while it keeps attacking.
- Fallback in the route: lure it to the east side and safespot it from the entrance passage with Ranged or Magic.

Changed:

- 2.66.0: Trout ×10 (or better food) is a required item; the Guardian is the step's threat, which shows the pillar method in the food card.
- 2.87.0: the melee fight is estimated and prepared like the other quest fights; the pillars are the other way in the route text.

Evidence:

- Step fields "Combat", "Two ways", "Bring", "Fallback: safespot"; combatFoes.json (Ancient Guardian, golem); OSRS Wiki Ancient Guardian and Structural pillar (no mining time), read 2026-11-11.

## S3-05 Shield of Arrav

**Retain.** Kill Jonny the Beard (2) for the report and the Weaponsmaster (23, 20 hit points, hits up to 3) for the crossbows.

Quest stage lines: 2.2, 3.2.

Assumptions:

- A max hit of 3 against a character with Attack 30 or more is no real danger.

Evidence:

- Quest stage lines 2.2 and 3.2; OSRS Wiki infobox of the Weaponsmaster (20 hit points, max hit 3), read 2026-10-18.

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

- Dodging the specials is the real defence; the estimate still counts one hit of each special (every fifth attack, about 40% of your Hitpoints up to 19, OSRS Wiki Brutus/Strategies), so food and health cover a special that lands.

Problems:

- The step had no food at all.
- The estimate counted only his plain hits, so the food it gave was a lower bound.

Changed:

- 2.66.0: Trout ×5 is a required item, with the special's 19 in its note.
- 2.86.0: the specials are part of the estimate (fightMechanics.json): food, the health kept above a special and the training or kit that makes the fight safe all include them.

Evidence:

- Step field "Combat"; threats.json (melee 3, special 19).

## S5-03 Map piece 1: Melzar's Maze

**Revised.** Melzar's Maze: the marked rat, ghost, skeleton and zombie, Melzar the Mad (43, hits up to 5) in melee, the lesser demon from the safespot.

Quest stage lines: 0.1, 1.0, 2.0, 3.0.

Assumptions:

- The demon is fought with Water Strike from the safespot, where it cannot reach you: its estimate is the casts at your Magic level and worn magic bonus, with its 40% water weakness (Wiki), and the 50 casts of runes the step carries.

Problems:

- The demon had no estimate, so the planner ended Dragon Slayer in "Review the combat strategy".

Changed:

- 2.87.0: the safespot fight is estimated (fightMechanics.json safespot); Magic 5 for Water Strike is a during-quest requirement.

Evidence:

- Step fields; Salmon ×10 and 50 Water, Air and Mind runes required; combatFoes.json (elemental weakness from the infobox); danger zone for the demon.

In-game danger zones: melzar-lesser-demon.

## S5-08 The battle with the dragon Elvarg

**Revised.** Kill Elvarg (83, 80 health) with the Anti-dragon shield worn.

Quest stage lines: 1.2.

Assumptions:

- With the shield her fire hits up to 10; without it up to 70 (OSRS Wiki Dragonfire/Elvarg). The Wiki gives no share for her slash, magic and fire, so the estimate takes the worse attack for every swing; the shield's slot is never offered to another item.

Problems:

- The estimate counted only her slash (up to 8), so the fight was named partial and never assessed.

Alternatives:

- A Rune shortsword on Stab if owned.

Changed:

- 2.86.0: dragonfire is counted for every attack, 10 behind the worn Anti-dragon shield and 70 without; encounter preparation keeps the shield on and compares training, weapons and armour around it.

Evidence:

- Lobster 20+ required; the shield is a safety rule (readiness blocks without it, and a two-handed weapon is flagged).
- Danger zones on the boat and in the lair.

In-game danger zones: crandor-boarding, elvarg-lair.

## S7-01 Waterfall Quest

**Revised.** Walk past the fire giants (86) in the Waterfall dungeon to the west door; no weapons or armour are allowed in Glarial's tomb.

Quest stage lines: 4.7.

Assumptions:

- Walking past is the route's method (OSRS Wiki, Waterfall Quest quick guide: "avoid the fire giants"); no kill estimate drives preparation.

Problems:

- The route did not name the fire giants, so the quest's "evasion" requirement could never be shown met and the planner stopped at a check.

Alternatives:

- Fight them: not needed and not suggested.

Changed:

- 2.99.0: the route line says to avoid the fire giants; this run-past proves the evasion requirement.

Evidence:

- Quest stage route 4.7; OSRS Wiki Waterfall Quest/Quick guide, revision 15126652.

## S7-02 Fight Arena

**Revised.** Fight Arena: the Khazard Ogre (63), the scorpion (44) and Bouncer (137), each from behind a skeleton with Fire Bolt.

Quest stage lines: 1.1, 1.2, 1.5, 1.6.

Assumptions:

- All of them fight only up close, so the safespot holds.

Problems:

- No melee estimate applies.
- The in-game line before the fight checks 10 lobsters, but the food was recommended only: readiness could say ready while the arrow stopped for food.

Alternatives:

- A bow from the same cover.

Changed:

- 2.74.7: Lobster ×10 (or similar food) is a required item, as the fight line's bag check already demanded.
- 2.99.0: the step's threats name the opponent (combatFoes.json, Wiki infobox) and fightMechanics.json has the safespot with Fire Bolt: the fight is estimated.

Evidence:

- Step field "Magic from a safespot" and the safespot text (wiki quick guide).

## S7-03 Tree Gnome Village

**Revised.** Defeat the Khazard warlord (112, 170 hit points, hits up to 10) from the safespot by the dead tree with Fire Bolt.

Quest stage lines: 2.2, 2.3.

Assumptions:

- He gets caught between the wall and the tree; about 31 casts, 50 brought.

Problems:

- The in-game line before the fight checks 10 lobsters, but the food was not in the kit: readiness could say ready while the arrow stopped for food.

Changed:

- 2.74.7: Lobster ×10 (or similar food) is a required item, as the fight line's bag check already demanded.
- 2.99.0: the step's threats name the opponent (combatFoes.json, Wiki infobox) and fightMechanics.json has the safespot with Fire Bolt: the fight is estimated.

Evidence:

- Step field "Magic from a safespot" (wiki quick guide).

## S7-05 The Grand Tree

**Revised.** Kill the Black demon (172, 157 hit points, hits up to 16) from the spot north of the entrance ladder.

Quest stage lines: 2.0, 3.1, 5.0, 5.1.

Assumptions:

- The safespot holds for the whole fight; Water Bolt hits it harder.

Problems:

- The in-game line before the fight checks 10 lobsters, but the food was not in the kit: readiness could say ready while the arrow stopped for food.

Alternatives:

- Ranged or a halberd from the same spot.

Changed:

- 2.74.7: Lobster ×10 (or similar food) is a required item, as the fight line's bag check already demanded.
- 2.99.0: the step's threats name the opponent (combatFoes.json, Wiki infobox) and fightMechanics.json has the safespot with Fire Bolt, the spell of the step's kit: the fight is estimated.

Evidence:

- Step field "Magic from a safespot"; lines 2.0 and 3.1 are dialogue and an optional choice.

## S7-07 Witch's House

**Revised.** Witch's House: kill the Witch's experiment in all four forms without a break (levels 19, 30, 42 and 53, hits up to 5).

Quest stage lines: 1.3.

Assumptions:

- All four forms attack with melee and come one after another; the estimate adds the four fights (combatFoes.json, Wiki infobox versions).

Problems:

- New quest: no stage of the route fought the experiment before.

Alternatives:

- Safespot the first two forms with Magic or Ranged (OSRS Wiki strategy).

Changed:

- 2.101.0: the step's threats name the Witch's experiment and fightMechanics.json marks its four forms as fought in a row, so each form is estimated and the food adds up; Trout x5 (or similar food) is a required item.

Evidence:

- Quest stage route 1.3; OSRS Wiki Witch's experiment infobox (four versions) and Witch's House requirements, revision 15386155.

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
- Magic 13 is required by the selected Fire Strike strategy, not by the quest unlock. Four Tuna (40 nominal HP) are a guide setup buffer, not a verified full-fight damage budget; 65 Fire Strike casts are a guide allowance, not the Wiki Crumble Undead estimate.

Problems:

- The chosen magic strategy had no runes in the kit; the instant teleport the wiki asks for to leave the dungeon was missing; no food in the item list and no numbers for the Tree Spirit in the app.

Alternatives:

- Melee with a Ring of recoil and a Prayer potion (wiki quick guide); the bronze axe is too weak.

Changed:

- 2.80.13: chosen-strategy Magic 13 checked; an explicitly labelled four-Tuna entry buffer shares readiness, Shopping and funding protection and returns to optional after the confirmed entry. Physical alternative bank withdrawals are named consistently in the app and plugin.
- 2.74.6: Fire Strike runes for a guide allowance of 65 casts (195 Fire, 130 Air, 65 Mind) and a Lumbridge teleport are required items and are checked on the Entrana line; the lines name the south-west mushroom safespot, the greater demons to run past and the Wilderness door.
- 2.99.0: the step's threats name the opponent (combatFoes.json, Wiki infobox) and fightMechanics.json has the safespot with Fire Strike: the fight is estimated.

Evidence:

- https://oldschool.runescape.wiki/w/Lost_City and https://oldschool.runescape.wiki/w/Entrana_Dungeon checked 2026-10-28 for strategy, food recommendation, axe acquisition and exit; no food quantity is prescribed. Existing boss statistics were not reverified in this batch; quest stage lines 2.2 and 2.4.

## S9-02 Fairytale I - Growing Pains

**Revised.** Kill the large Tanglefoot (111) with the Magic secateurs, the only thing that damages it.

Quest stage lines: 4.0, 4.2.

Assumptions:

- It can be flinched on a corner.

Problems:

- The 10 lobsters the in-game line checks before Zanaris were recommended only; no estimate (the secateurs are not in the gear data as a weapon).

Changed:

- 2.74.8: Lobster ×10 (or similar food) is a required item, as the line's bag check already demanded; the fight estimate stays open.
- 2.99.0: the Magic secateurs are in the gear data as quest kit and fightMechanics.json says only they damage it; the step's threat names it: the fight is estimated.

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
- 2.99.1: the step's threat names the Jungle Demon (combatFoes.json, Wiki infobox) and fightMechanics.json says Protect from Magic (Prayer 37) blocks all it does at three squares: the fight is estimated with the bow.

Evidence:

- Step fields "Requirements" and "Dangers"; safespot text; loadouts karamja, atoll, final; OSRS Wiki Jungle demon (ranged defence +0, magic +50, slash +50), read 2026-10-24.

