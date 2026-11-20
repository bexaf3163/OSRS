# Combat audit

Written by `tests/combatAudit.test.ts` from `src/data/authored/combatAudit.json` (revision 2026-11-10) and the route data. Do not edit by hand: change the ledger or the route and run `UPDATE_FIXTURES=1 npx vitest run tests/combatAudit.test.ts`.

Every stage of the route where the player fights or can be attacked, checked against the route text, the quest stage lines (Quest Helper), the OSRS Wiki infoboxes in combatFoes.json and the danger zones. The rule for a fight the quest cannot go on without: its food is a required item (readiness and the game check it before leaving), the app estimates it with the player's kit where it has the opponent's numbers, and an unread kit or bag is reported as not checked, never as ready.

82 stages: 54 retained, 27 revised, 0 with a branch, 1 deferred.

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
| S7-11 Monk's Friend | avoid | yes | Thief (14), Thief (26) | run | - | - | Revised |
| S7-14 Jungle Potion | incidental | yes | Jogre (53), Harpie Bug Swarm (46) | melee | Jogre, Harpie Bug Swarm | Trout 5 | Revised |
| S7-16 Observatory Quest | incidental | yes | Goblin guard (42) | melee | Goblin guard | Trout 5 | Revised |
| S7-17 Merlin's Crystal | quest-fight | yes | Sir Mordred (39) | melee | Sir Mordred | Trout 5 | Revised |
| S7-19 Holy Grail | quest-fight | yes | Black Knight Titan (120) | melee | Black Knight Titan | Lobster 10 | Revised |
| S8-01 Priest in Peril | quest-fight | yes | Temple Guardian (30), Monk of Zamorak (30) | melee | Temple Guardian | Trout 5 | Revised |
| S8-02 Nature Spirit | quest-fight | yes | Ghast (30) | melee | Ghast | Lobster 15 | Revised |
| S8-07 Creature of Fenkenstrain | quest-fight | yes | Experiment (51) | melee | Experiment | Lobster 5 | Revised |
| S8-08 Shades of Mort'ton | quest-fight | yes | Loar Shade (40) | melee | Loar Shade | Lobster 10 | Revised |
| S8-09 In Search of the Myreque | quest-fight | yes | Skeleton Hellhound (97) | melee | Skeleton Hellhound | Lobster 10 | Revised |
| S9-01 Lost City | quest-fight | yes | Zombie (25), Tree spirit (Lost City) (101) | safespot | Tree spirit (Lost City) | - | Revised |
| S9-02 Fairytale I - Growing Pains | quest-fight | yes | Tanglefoot (111) | other | Tanglefoot | Lobster 10 | Revised |
| S9-04 Monkey Madness I | quest-fight | yes | Jungle Demon (195), Monkey zombie, Gorilla | safespot | Jungle Demon | - | Revised |
| S9-06 Clock Tower | avoid | yes | Ogre (53) | run | Ogre | - | Retain |
| S9-08 Death Plateau | not-combat | yes | - | none | - | Trout 10 | Retain |
| S9-09 The Depths of Despair | quest-fight | yes | Sand Snake (36) | melee | Sand Snake | Trout 3 | Retain |
| S9-11 Elemental Workshop I | quest-fight | yes | Earth elemental (35) | melee | Earth elemental | Trout 3 | Retain |
| S9-12 Big Chompy Bird Hunting | quest-fight | yes | Chompy bird (6), Wolf (64), Ogre (53) | other | Wolf, Ogre | Trout 5 | Retain |
| S9-17 The Tourist Trap | quest-fight | yes | Mercenary Captain (47) | melee | Mercenary Captain | Trout 5 | Retain |
| S9-19 Tale of the Righteous | quest-fight | yes | Corrupt Lizardman (46) | melee | Corrupt Lizardman | Trout 5 | Retain |
| S9-20 The Lost Tribe | not-combat | no | - | none | - | - | Retain |
| S9-21 Mountain Daughter | quest-fight | yes | The Kendal (70) | melee | The Kendal | Lobster 10 | Retain |
| S9-22 Getting Ahead | quest-fight | yes | Headless Beast (82) | melee | Headless Beast | Lobster 10 | Retain |
| S9-24 Scorpion Catcher | quest-fight | yes | Jailer (47), Black demon (172), Poison spider (64) | melee | Jailer | Lobster 10 | Retain |
| S9-25 Icthlarin's Little Helper | quest-fight | yes | Possessed Priest (91), Apparition (81) | melee | Possessed Priest, Apparition | Lobster 10 | Retain |
| S9-27 Hazeel Cult | quest-fight | yes | Alomone (13) | melee | Alomone | Trout 5 | Retain |
| S9-28 Troll Stronghold | quest-fight | yes | Dad (101), Troll General (113) | safespot | Dad, Troll General | - | Retain |
| S9-30 Eadgar's Ruse | not-combat | no | - | none | - | - | Retain |
| S9-33 Ghosts Ahoy | quest-fight | yes | Giant lobster (Ghosts Ahoy) (32) | melee | Giant lobster (Ghosts Ahoy) | Trout 5 | Retain |
| S9-38 Death to the Dorgeshuun | quest-fight | yes | H.A.M. Guard (22), Sigmund (50) | melee | Sigmund, H.A.M. Guard | Trout 5 | Retain |
| S9-39 Watchtower | quest-fight | yes | Gorad (68), Blue dragon (111) | melee | Gorad | Trout 5 | Retain |
| S9-41 Elemental Workshop II | quest-fight | yes | Earth elemental (35) | melee | Earth elemental | Trout 3 | Retain |
| S9-42 The Feud | quest-fight | yes | Tough Guy (75), Bandit champion (70) | melee | Bandit champion, Tough Guy | Trout 10 | Retain |
| S9-43 The Eyes of Glouphrie | quest-fight | yes | Evil creature (1) | melee | Evil creature | Trout 2 | Retain |
| S9-44 Shilo Village | quest-fight | yes | Nazastarool (91), Nazastarool (68), Nazastarool (93), Undead one (73) | safespot | Nazastarool | Trout 10 | Retain |
| S9-45 Biohazard | quest-fight | yes | Mourner (boss) (13) | melee | Mourner (boss) | Trout 2 | Retain |
| S9-46 Haunted Mine | quest-fight | yes | Treus Dayth (95) | melee | Treus Dayth | Lobster 15 | Retain |
| S9-48 Tower of Life | not-combat | no | - | none | - | - | Retain |
| S9-49 The Ribbiting Tale of a Lily Pad Labour Dispute | incidental | yes | Cuthbert, Lord of Dread (1) | melee | Cuthbert, Lord of Dread | - | Retain |
| S9-50 Death on the Isle | incidental | yes | - | melee | - | - | Retain |
| S9-53 What Lies Below | quest-fight | yes | Outlaw (32), King Roald (47) | melee | Outlaw, King Roald | Trout 2 | Retain |
| S9-54 Scrambled! | quest-fight | yes | Large chicken (16), Black jaguar (Scrambled!) (88), Red dragon (Scrambled!) (106) | safespot | Large chicken, Black jaguar (Scrambled!), Red dragon (Scrambled!) | Trout 3 | Retain |
| S9-55 The Fremennik Trials | quest-fight | yes | Draugen (69), Lanzig (48) | melee | Draugen, Lanzig | Lobster 20 | Retain |
| S9-56 Olaf's Quest | quest-fight | yes | Skeleton fremennik (40), Ulfric (100) | safespot | Skeleton fremennik, Ulfric | Trout 3 | Retain |
| S9-57 In Aid of the Myreque | quest-fight | yes | Gadderanks (35), Vampyre Juvinate (50) | melee | Gadderanks, Vampyre Juvinate | Salmon 15 | Retain |
| S9-59 Recipe for Disaster/Freeing the Mountain Dwarf | quest-fight | no | Icefiend (13) | melee | Icefiend | Trout 2 | Retain |
| S9-60 Recipe for Disaster/Freeing Pirate Pete | quest-fight | yes | Mudskipper (31), Crab (23) | melee | Mudskipper, Crab | Trout 5 | Retain |
| S9-61 Recipe for Disaster/Freeing Skrach Uglogwee | incidental | yes | - | other | - | - | Retain |
| S9-62 A Porcine of Interest | quest-fight | yes | Sourhog (37) | melee | Sourhog | Trout 4 | Retain |
| S9-63 Tai Bwo Wannai Trio | incidental | yes | - | other | - | - | Retain |
| S9-64 Shadow of the Storm | quest-fight | yes | Agrith Naar (100) | melee | Agrith Naar | Lobster 10 | Retain |
| S9-65 Troll Romance | quest-fight | yes | Arrg (113) | safespot | Arrg | Lobster 6 | Retain |
| S9-66 Underground Pass | quest-fight | yes | Sir Jerro (62), Sir Carl (62), Sir Harry (62), Doomion (91), Holthion (91), Othainian (91), Kalrag (89), Disciple of Iban (13) | melee | Sir Jerro, Sir Carl, Sir Harry, Doomion, Holthion, Othainian, Kalrag, Disciple of Iban | Lobster 20 | Retain |
| S9-68 Regicide | quest-fight | yes | Tyras guard (110) | safespot | Tyras guard | Lobster 10 | Retain |
| S9-69 Roving Elves | quest-fight | yes | Moss Guardian (84) | melee | Moss Guardian | Lobster 12 | Retain |
| S9-70 Recruitment Drive | quest-fight | yes | Sir Leye (20) | melee | Sir Leye | - | Retain |
| S9-71 Wanted! | quest-fight | yes | Black Knight (Wanted!) (32) | melee | Black Knight (Wanted!) | Lobster 4 | Retain |
| S9-75 The Ascent of Arceuus | quest-fight | yes | Tormented Soul (16), Trapped Soul (30) | melee | Tormented Soul, Trapped Soul | Lobster 3 | Retain |
| S9-77 Contact! | quest-fight | yes | Giant Scarab (191) | melee | Giant Scarab | Lobster 15 | Retain |
| S9-79 Heroes' Quest | quest-fight | yes | Ice Queen (111), Jailer (47), Entrana firebird (2) | melee | Ice Queen, Entrana firebird, Jailer | Lobster 10 | Retain |
| S9-81 Lunar Diplomacy | quest-fight | yes | Suqah (111), Me (79) | melee | Suqah, Me | Lobster 15 | Retain |

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

## S7-11 Monk's Friend

**Revised.** Monk's Friend: run past the thieves in the hideout under the stone circle to pick up the Child's blanket.

Quest stage lines: 0.2.

Assumptions:

- Running past is the requirement itself (OSRS Wiki: the ability to run past two level 14 thieves and one level 26); no kill estimate drives preparation.

Problems:

- New quest: the route did not name the thieves, so the evasion requirement could never be shown met.

Alternatives:

- Fight them: not needed and not suggested.

Changed:

- 2.105.0: the route line says to avoid the thieves; this run-past proves the evasion requirement.

Evidence:

- Quest stage route 0.2; OSRS Wiki Monk's Friend requirements, revision 15240952.

## S7-14 Jungle Potion

**Revised.** Jungle Potion: aggressive level 53 Jogres and level 46 Harpie Bug Swarms roam the jungle around Tai Bwo Wannai; the quest asks for the ability to defend yourself against them.

Assumptions:

- The Jogre is its normal version (level 53, 60 hit points); the GWD version is not in the jungle (combatFoes.json, Wiki infobox).

Problems:

- New quest: no stage of the route met these monsters before.

Alternatives:

- Run past them: the herbs do not need them dead.

Changed:

- 2.106.0: the step's foes name the Jogre and the Harpie Bug Swarm, so the defend requirement is estimated with the player's kit; Trout x5 (or similar food) is a required item.

Evidence:

- OSRS Wiki Jungle Potion requirements, revision 15390159; Jogre and Harpie Bug Swarm infoboxes.

## S7-16 Observatory Quest

**Revised.** Observatory Quest: the level 42 goblin guard at the kitchen gate has to be killed or trapped for the kitchen key.

Quest stage lines: 0.5.

Assumptions:

- The Goblin guard is the level 42 version with 43 hit points (Wiki infobox).

Problems:

- New quest: no stage of the route met this monster before.

Alternatives:

- Trap the guard by luring it onto the prison cell door.

Changed:

- 2.107.0: the step's foes name the Goblin guard, so the fight is estimated with the player's kit; Trout x5 (or similar food) is a required item.

Evidence:

- OSRS Wiki Observatory Quest and Goblin guard infobox.

## S7-17 Merlin's Crystal

**Revised.** Merlin's Crystal: defeat Sir Mordred (level 39, 38 hit points, hits up to 5) on the top floor of Keep Le Faye so Morgan le Faye appears.

Quest stage lines: 1.0, 1.1, 1.2, 5.1.

Assumptions:

- Sir Mordred is his only Wiki infobox version; the giant bat for bat bones is avoided by buying the bones.

Problems:

- New quest: no stage of the route met this monster before.

Alternatives:

- Flinch him with the stairs (Wiki strategy); he cannot be safespotted. The Renegade Knights on the way up can be run past.

Changed:

- 2.108.0: the step's threats name Sir Mordred, so the fight is estimated with the player's kit; Trout x5 (or similar food) is a required item and Bat bones are bought.

Evidence:

- OSRS Wiki Merlin's Crystal requirements and Sir Mordred infobox.

## S7-19 Holy Grail

**Revised.** Holy Grail: defeat the Black Knight Titan (level 120, 142 hit points, hits up to 15) on the Fisher Realm bridge; the killing blow must be dealt with Excalibur.

Quest stage lines: 2.0, 2.3, 2.5, 2.6, 3.4.

Assumptions:

- Magic and Ranged cannot hurt it (defence 1,000 on the Wiki infobox), so only melee is estimated; the switch to Excalibur for the last hit is not timed.

Problems:

- New quest: no stage of the route met this monster before.

Alternatives:

- Safespot or flinch it (Wiki requirements).

Changed:

- 2.109.0: the step's threats name the Black Knight Titan, so the fight is estimated with the player's kit; Lobster x10 (or similar food) is a required item.

Evidence:

- OSRS Wiki Holy Grail requirements and Black Knight Titan infobox.

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

## S8-07 Creature of Fenkenstrain

**Revised.** Creature of Fenkenstrain: kill the level 51 experiment (40 hit points, hits up to 6) in the caves under the castle for the key, and run past the level 72 monsters.

Quest stage lines: 0.8.

Assumptions:

- The Experiment is its level 51 Wiki infobox version; the level 72 monsters are run past, not fought.

Problems:

- New quest: no stage of the route met these monsters before.

Alternatives:

- None for the key: the level 51 experiment drops it.

Changed:

- 2.110.0: the step's foes name the Experiment, so the kill is estimated with the player's kit and the run-past proves evasion; Lobster x5 (or similar food) is a required item.

Evidence:

- OSRS Wiki Creature of Fenkenstrain requirements and Experiment infobox.

## S8-08 Shades of Mort'ton

**Revised.** Shades of Mort'ton: kill five level 40 Loar Shades (38 hit points, hit up to 4) for their remains, and survive the shades while repairing the temple.

Quest stage lines: 1.2.

Assumptions:

- The Loar Shade is its level 40 Wiki infobox version; the temple onslaught is the same shades and uses the same food.

Problems:

- New quest: no stage of the route met this monster before.

Alternatives:

- Repair the temple on a busy world so the shades spread out (Wiki requirements).

Changed:

- 2.111.0: the step's foes name the Loar Shade, so the kills are estimated with the player's kit; Lobster x10 (or similar food) is a required item.

Evidence:

- OSRS Wiki Shades of Mort'ton requirements and Loar Shade infobox.

## S8-09 In Search of the Myreque

**Revised.** In Search of the Myreque: defeat the level 97 Skeleton Hellhound (55 hit points, hits up to 12) in the hidden room under Canifis.

Quest stage lines: 0.13.

Assumptions:

- The Skeleton Hellhound is its only Wiki infobox version; a Magic safespot is not modelled, so the melee estimate is the cautious one.

Problems:

- New quest: no stage of the route met this monster before.

Alternatives:

- Safespot it with Magic by luring it beside the chair (Wiki strategy).

Changed:

- 2.112.0: the step's threats name the Skeleton Hellhound, so the fight is estimated with the player's kit; Lobster x10 (or similar food) is a required item.

Evidence:

- OSRS Wiki In Search of the Myreque requirements and Skeleton Hellhound infobox.

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

## S9-06 Clock Tower

**Retain.** Clock Tower: collect the four cogs in the tower and its dungeon; the level 53 ogres in the dungeon are run past, not fought.

Assumptions:

- The quest needs only the ability to run past the level 53 ogres; no cog step asks for a kill.

Problems:

- Running past is planned, so no food is sized to the ogres.

Alternatives:

- None: every cog can be reached without a fight.

Changed:

- 2.122.0: new quest; the source prerequisite is run past.

Evidence:

- OSRS Wiki Clock Tower requirements: The ability to run past level 53 Ogres.

## S9-08 Death Plateau

**Retain.** Death Plateau: the quest goes up by Tenzing's secret path; the trolls that attack on the main path are never met.

Quest stage lines: 1.8.

Evidence:

- Quest stage line 1.8: the trolls "only attack you on the main path".

## S9-09 The Depths of Despair

**Retain.** The Depths of Despair: kill the Sand Snake (level 36, 60 hitpoints, hits up to 3) in the Crabclaw Caves; the sandcrab on the way is only an optional diary task.

Quest stage lines: 0.5, 0.8.

Assumptions:

- A max hit of 3 needs no food at the route's Members combat levels.

Alternatives:

- The wiki safespot along the west wall.

Changed:

- 2.126.0: new quest; the Sand Snake is in combatFoes.json.

Evidence:

- OSRS Wiki Sand Snake infobox: level 36, 60 hitpoints, max hit 3, crush, read 2026-11-16.

## S9-11 Elemental Workshop I

**Retain.** Elemental Workshop I: mining an elemental rock in the west room wakes an earth elemental (level 35, 35 hitpoints, hits up to 4); it must be killed for the ore.

Quest stage lines: 1.4, 2.1.

Assumptions:

- A max hit of 4 needs only a few fish at the route's Members combat levels.

Alternatives:

- Another player mining the rock (wiki note); not planned.

Changed:

- 2.128.0: new quest; the Earth elemental is in combatFoes.json.

Evidence:

- OSRS Wiki Earth elemental infobox: level 35, 35 hitpoints, max hit 4, crush, read 2026-11-16.

## S9-12 Big Chompy Bird Hunting

**Retain.** Big Chompy Bird Hunting: the chompy bird (level 6) is shot with the ogre bow and ogre arrows made in the quest; it does not fight back. The level 64 wolves and level 53 ogres of Feldip Hills are walked past, not fought; the wolf bones are bought.

Quest stage lines: 3.4.

Assumptions:

- Only the ogre bow and ogre arrows hurt a chompy, so no other kit or food is planned for it.
- Wolves and ogres are threats on the way, not objectives.

Alternatives:

- Killing the wolves for the 4 wolf bones (wiki: optional).

Changed:

- 2.129.0: new quest; Wolf level 64 and Ogre level 53 are in combatFoes.json; the chompy has no attack data.

Evidence:

- OSRS Wiki Big Chompy Bird Hunting requirements: the ability to defend against level 64 wolves and level 53 ogres, read 2026-11-16.

## S9-17 The Tourist Trap

**Retain.** The Tourist Trap: kill the Mercenary Captain (level 47, 80 hitpoints, hits up to 5) outside the Desert Mining Camp for the gate key.

Quest stage lines: 1.1, 1.2, 5.7.

Assumptions:

- Fletching 10 and Smithing 20 come with the route's Members combat levels; 5 trout cover a hit of 5 at most.

Alternatives:

- The wiki safespot near the camp.

Changed:

- 2.130.0: new quest; the Mercenary Captain is in combatFoes.json.

Evidence:

- OSRS Wiki Mercenary Captain infobox: level 47, 80 hitpoints, max hit 5, slash, read 2026-11-17.

## S9-19 Tale of the Righteous

**Retain.** Tale of the Righteous: kill the Corrupt Lizardman (level 46, 50 hitpoints, hits up to 6) past the magic gate.

Quest stage lines: 0.2, 0.5, 0.6, 0.7, 0.16.

Assumptions:

- 5 trout cover a hit of 6 at most at the route's Members combat levels.

Alternatives:

- Ranged with the bronze darts the quest already asks for.

Changed:

- 2.130.0: new quest; the Corrupt Lizardman is in combatFoes.json.

Evidence:

- OSRS Wiki Corrupt Lizardman infobox: level 46, 50 hitpoints, max hit 6, crush, read 2026-11-17.

## S9-20 The Lost Tribe

**Retain.** The Lost Tribe: the goblin generals refused to fight in the dialogue; nothing in the quest is fought.

Quest stage lines: 0.11.

Assumptions:

- The fight word is in a dialogue option, not an action.

Changed:

- 2.131.0: new quest; no fight.

Evidence:

- OSRS Wiki The Lost Tribe: no kills, read 2026-11-17.

## S9-21 Mountain Daughter

**Retain.** Mountain Daughter: kill the Kendal (level 70, 50 hitpoints, hits up to 9) in its cave north-east of the Mountain Camp lake.

Quest stage lines: 4.5, 4.6.

Assumptions:

- 10 lobsters cover a hit of 9 at most at the route's Members combat levels.

Alternatives:

- The wiki safespot in the cave.

Changed:

- 2.131.0: new quest; the Kendal is in combatFoes.json.

Evidence:

- OSRS Wiki The Kendal infobox: level 70, 50 hitpoints, max hit 9, crush, read 2026-11-17.

## S9-22 Getting Ahead

**Retain.** Getting Ahead: kill the Headless Beast (level 82, 100 hitpoints, hits up to 10) in the Kebos Lowlands mine cave.

Quest stage lines: 1.2.

Assumptions:

- 10 lobsters cover a hit of 10 at most at the route's Members combat levels.

Alternatives:

- The safespot from the south-west corner of the pond.

Changed:

- 2.131.0: new quest; the Headless Beast is in combatFoes.json.

Evidence:

- OSRS Wiki Headless Beast infobox: level 82, 100 hitpoints, max hit 10, slash, read 2026-11-17.

## S9-24 Scorpion Catcher

**Retain.** Scorpion Catcher: kill the Jailer (level 47, 47 hitpoints, hits up to 5) in the Black Knights' Base for the jail key; the black demons (level 172) and poison spiders (level 64) of Taverley Dungeon are walked past.

Assumptions:

- 10 lobsters cover the Jailer at the route's Members combat levels. The black demons and poison spiders are walked past, not step threats: threats are planned as fights, and a level 172 demon is not one to plan.

Alternatives:

- The Legends Guild sells the dusty key, which skips the Jailer.

Changed:

- 2.132.0: new quest; the Jailer, black demon and poison spider are in combatFoes.json.

Evidence:

- OSRS Wiki Scorpion Catcher requirements and Jailer infobox (level 47, max hit 5), read 2026-11-17.

## S9-25 Icthlarin's Little Helper

**Retain.** Icthlarin's Little Helper: kill the Possessed Priest (level 91, 90 hitpoints, hits up to 6 with magic) and one Apparition guardian (level 75 to 81, hits up to 9).

Quest stage lines: 1.0, 3.2, 5.4.

Assumptions:

- 10 lobsters cover a hit of 9 at most; the guardian is chosen by the player's stats, so the strongest (Het, level 81) is planned.

Alternatives:

- The guardians can be safespotted on the central table.

Changed:

- 2.132.0: new quest; the Possessed Priest and the Apparitions are in combatFoes.json.

Evidence:

- OSRS Wiki Icthlarin's Little Helper kills: Possessed Priest level 91, Apparitions 75 to 81, read 2026-11-17.

## S9-27 Hazeel Cult

**Retain.** Hazeel Cult: on Ceril's side, kill Alomone (level 13, 25 hitpoints, hits up to 2) in the cult's hideout.

Quest stage lines: 0.10.

Assumptions:

- 5 trout are a margin; Alomone hits 2 at most.

Alternatives:

- Hazeel's side has no fight.

Changed:

- 2.133.0: new quest; Alomone is in combatFoes.json.

Evidence:

- OSRS Wiki Alomone infobox: level 13, 25 hitpoints, max hit 2, read 2026-11-17.

## S9-28 Troll Stronghold

**Retain.** Troll Stronghold: beat Dad (level 101, 120 hitpoints, hits up to 27) and kill a Troll General (level 113, 140 hitpoints, hits up to 38), both with Fire Bolt from a safespot.

Quest stage lines: 0.0, 0.1, 0.2, 1.0, 1.2.

Assumptions:

- Both fight only up close, so the safespot holds; the staff of fire pays the fire runes.

Alternatives:

- Ranged from the same spots.

Changed:

- 2.133.0: new quest; Dad and the Troll General are in combatFoes.json and fightMechanics.json.

Evidence:

- OSRS Wiki Troll Stronghold kills: Dad and the Troll General can be safespotted; infoboxes read 2026-11-17.

## S9-30 Eadgar's Ruse

**Retain.** Eadgar's Ruse: killing Berry is only the way to free Eadgar if Troll Stronghold has not; the route finishes Troll Stronghold first, and the other line warns against drinking the vodka.

Quest stage lines: 0.2, 1.0.

Assumptions:

- Troll Stronghold (S9-28) is a prerequisite, so Eadgar is already free.

Changed:

- 2.134.0: new quest; no fight on the route.

Evidence:

- OSRS Wiki Eadgar's Ruse: no kills, read 2026-11-17.

## S9-33 Ghosts Ahoy

**Retain.** Ghosts Ahoy: kill the level 32 giant lobster (32 hitpoints, hits up to 4) that comes out of the chest in the wrecked ship west of Port Phasmatys.

Quest stage lines: 2.7.

Assumptions:

- It can despawn mid-fight; searching the chest again restarts it.

Changed:

- 2.137.0: new quest; the lobster is in combatFoes.json.

Evidence:

- OSRS Wiki Giant lobster (Ghosts Ahoy): level 32, 32 hitpoints, max hit 4, read 2026-11-17.

## S9-38 Death to the Dorgeshuun

**Retain.** Death to the Dorgeshuun: kill the three level 22 H.A.M. guards (30 hitpoints, hit up to 3) beside Zanik, then Sigmund (level 50, 60 hitpoints, hits up to 5) in the mill.

Quest stage lines: 0.17, 0.27, 0.31.

Assumptions:

- Zanik hits Sigmund first; he mostly prays against missiles, so melee lands.

Alternatives:

- Magic also works (the wiki names melee or magic).

Changed:

- 2.138.0: new quest; Sigmund and the guards are in combatFoes.json.

Evidence:

- OSRS Wiki Sigmund (level 50, 60 hitpoints, max hit 5) and H.A.M. Guard level 22, read 2026-11-18.

## S9-39 Watchtower

**Retain.** Watchtower: kill Gorad (level 68, 80 hitpoints, hits up to 7) on the island west of Yanille for his tooth; the level 111 blue dragons of the Ogre Enclave are walked past.

Quest stage lines: 1.4.

Assumptions:

- Gorad can be safespotted; the route fights him in melee with food.
- The blue dragons are not fought: the route walks past them to the Rock of Dalgroth.

Alternatives:

- Safespot Gorad with Ranged or Magic (wiki).

Changed:

- 2.139.0: new quest; Gorad is in combatFoes.json.

Evidence:

- OSRS Wiki Gorad: level 68, 80 hitpoints, max hit 7, read 2026-11-18.

## S9-41 Elemental Workshop II

**Retain.** Elemental Workshop II: mining an elemental rock wakes an earth elemental (level 35, 35 hitpoints, hits up to 4); two are killed for the ore.

Assumptions:

- Three fish cover two earth elementals at the route's Members combat levels.

Alternatives:

- Two elemental bars from an earlier visit skip the fights.

Changed:

- 2.139.0: new quest; the Earth elemental is in combatFoes.json.

Evidence:

- OSRS Wiki Elemental Workshop II: kill 2 earth elementals for the ore, read 2026-11-18.

## S9-42 The Feud

**Retain.** The Feud: kill the Tough Guy (level 75, 75 hitpoints, hits up to 7) and the Bandit champion (level 70, 50 hitpoints, hits up to 10) in Pollnivneach.

Quest stage lines: 6.1, 6.4.

Assumptions:

- Both can be safespotted (a bush for the Tough Guy, a chair for the champion); the route fights them in melee with food.

Alternatives:

- Safespot both with Ranged or Magic (wiki).

Changed:

- 2.140.0: new quest; both are in combatFoes.json.

Evidence:

- OSRS Wiki Tough Guy (level 75, max hit 7) and Bandit champion (level 70, max hit 10), read 2026-11-18.

## S9-43 The Eyes of Glouphrie

**Retain.** The Eyes of Glouphrie: kill six evil creatures (1 hitpoint each) around the Tree Gnome Stronghold.

Quest stage lines: 7.1.

Assumptions:

- One hit each; two fish are a margin, not a need.

Changed:

- 2.140.0: new quest; the evil creature is in combatFoes.json.

Evidence:

- OSRS Wiki The Eyes of Glouphrie: six evil creatures with 1 hitpoint, read 2026-11-18.

## S9-44 Shilo Village

**Retain.** Shilo Village: defeat Nazastarool's three forms (zombie 91, skeleton 68, ghost 93; 70 to 80 hitpoints, hits up to 9) with Fire Bolt from behind the dolmen; the undead ones (levels 61 to 73) in the tomb tunnels are walked past.

Quest stage lines: 3.0, 3.8, 3.9.

Assumptions:

- The dolmen safespot holds for all three forms; sixty Fire Bolts cover them.
- The undead ones are not fought; ten fish cover the tunnels.

Alternatives:

- Crumble Undead hits harder, but the spell is not in the spell data yet.

Changed:

- 2.140.0: new quest; the three forms are in combatFoes.json and fightMechanics.json.

Evidence:

- OSRS Wiki Nazastarool: three forms, safespot around the dolmen, read 2026-11-18.

## S9-45 Biohazard

**Retain.** Biohazard: kill the mourner (level 13, 19 hitpoints, hits up to 2) upstairs in the Mourners' Headquarters for the key to the caged area.

Quest stage lines: 1.8.

Assumptions:

- Two fish are a margin at the route's combat levels.

Changed:

- 2.141.0: new quest; the mourner is in combatFoes.json.

Evidence:

- OSRS Wiki Mourner (boss): level 13, 19 hitpoints, max hit 2, read 2026-11-18.

## S9-46 Haunted Mine

**Retain.** Haunted Mine: kill Treus Dayth (level 95, 100 hitpoints, hits up to 15 with ranged and 8 with crush) in the north of the mine; he has no safespot.

Quest stage lines: 3.0, 6.7, 6.8.

Assumptions:

- Fifteen lobsters cover the fight; his cranes and carts are avoided by not standing next to them.

Problems:

- The crane and cart hits are not modelled.

Alternatives:

- Crumble Undead or air spells hit his weakness (wiki).

Changed:

- 2.141.0: new quest; Treus Dayth is in combatFoes.json.

Evidence:

- OSRS Wiki Treus Dayth: level 95, 100 hitpoints, max hit 15, read 2026-11-18.

## S9-48 Tower of Life

**Retain.** Tower of Life: the swordchick is an optional Ardougne Diary kill after the quest; the route does not make one.

Quest stage lines: 4.6.

Assumptions:

- The quest completes before the optional diary task.

Changed:

- 2.142.0: new quest; no fight on the route.

Evidence:

- OSRS Wiki Tower of Life: no required kills, read 2026-11-18.

## S9-49 The Ribbiting Tale of a Lily Pad Labour Dispute

**Retain.** The Ribbiting Tale: defeat Cuthbert, Lord of Dread (level 1, 1 hitpoint) at the Locus Oasis.

Quest stage lines: 0.12.

Assumptions:

- Level 1 with 1 hitpoint is no danger at this point of the route.

Changed:

- 2.142.0: new quest; Cuthbert is in combatFoes.json.

Evidence:

- OSRS Wiki Cuthbert, Lord of Dread: level 1, 1 hitpoint, read 2026-11-18.

## S9-50 Death on the Isle

**Retain.** Death on the Isle: fight Adala (level 49) after the accusation, then Naiatli and Clodius in the theatre, all with no equipment; the quest says you cannot die to them.

Quest stage lines: 0.18, 0.26.

Assumptions:

- The wiki says the two fights are fought with no equipment and cannot kill the player.

Changed:

- 2.142.0: new quest; scripted fights that cannot be lost.

Evidence:

- OSRS Wiki Death on the Isle: kills field, read 2026-11-18.

## S9-53 What Lies Below

**Retain.** What Lies Below: kill 5 outlaws (level 32, 20 hitpoints, hits up to 3) west of the Grand Exchange, then fight King Roald (level 47, 75 hitpoints, hits up to 3) until the beacon ring stops him.

Quest stage lines: 0.1.

Assumptions:

- Two trout cover both fights; King Roald cannot die, the beacon ring ends the fight at 1 hitpoint.

Changed:

- 2.144.0: new quest; Outlaw and King Roald are in combatFoes.json.

Evidence:

- OSRS Wiki Outlaw and King Roald: levels 32 and 47, max hit 3, read 2026-11-18.

## S9-54 Scrambled!

**Retain.** Scrambled!: kill the large chicken (level 16, hits up to 2) up close, then the jaguar (level 88, 85 hitpoints, hits up to 8) and the red dragon (level 106, 100 hitpoints, hits up to 10) with Fire Bolt from their safespots.

Assumptions:

- Sixty Fire Bolts cover both safespot fights; three trout cover the chicken.

Alternatives:

- Ranged from the same safespots works too (wiki).

Changed:

- 2.144.0: new quest; the three foes are in combatFoes.json and the two safespots in fightMechanics.json.

Evidence:

- OSRS Wiki Scrambled!: kills field with safespots, read 2026-11-18.

## S9-55 The Fremennik Trials

**Retain.** The Fremennik Trials: kill Lanzig (level 48, 50 hitpoints, hits up to 6) until a lyre drops (about 1 in 17), kill the Draugen (level 69, 60 hitpoints, hits up to 7) found with the hunter's talisman, and fight Koschei the Deathless without weapons, armour or runes; dying to Koschei is safe.

Quest stage lines: 1.6, 3.0, 3.4, 5.1, 5.4, 5.5.

Assumptions:

- Twenty lobsters cover the Draugen and the Lanzig kills; Koschei cannot kill the player, so he needs no food.
- The lyre comes from Lanzig, Borrokar, Lensa or Freidir; crafting one needs Woodcutting 40, Fletching 25 and Crafting 40.

Alternatives:

- Craft the lyre instead (Woodcutting 40, Fletching 25, Crafting 40).

Changed:

- 2.145.0: new quest; Draugen and Lanzig are in combatFoes.json.

Evidence:

- OSRS Wiki Draugen: level 69, 60 hitpoints, max hit 7; Lanzig: level 48, 50 hitpoints, lyre 30/512; read 2026-11-18.

## S9-56 Olaf's Quest

**Retain.** Olaf's Quest: kill a skeleton fremennik (level 40, 25 hitpoints, hits up to 5) up close for the key, then Ulfric (level 100, 60 hitpoints, hits up to 11) with Fire Bolt from a safespot; the brine rat is an optional diary kill.

Quest stage lines: 2.2, 2.3, 3.0.

Assumptions:

- Twenty Fire Bolts cover Ulfric from the safespot; three trout cover the skeleton.

Alternatives:

- Ranged from the same safespot works too (wiki).

Changed:

- 2.146.0: new quest; the skeleton and Ulfric are in combatFoes.json and the safespot in fightMechanics.json.

Evidence:

- OSRS Wiki Olaf's Quest: kills field, Ulfric safespottable, read 2026-11-18.

## S9-57 In Aid of the Myreque

**Retain.** In Aid of the Myreque: kill two vampyre juvinates (level 50, 60 hitpoints, hits up to 5) and Gadderanks (level 35, 20 hitpoints, hits up to 3) in the shop, then the juvinates that attack Ivan Strom on the trek; the juvinates take damage only from the blessed silver sickle.

Quest stage lines: 2.5, 3.3.

Assumptions:

- The blessed silver sickle from Nature Spirit is wielded for the juvinates (fightMechanics.json); fourteen salmon cover both fights.

Problems:

- The trek juvinates are level 75 or four level 50s depending on the route Ivan takes; the estimate uses level 50.

Alternatives:

- Efaritay's aid with any weapon, a Wolfbane dagger or Silverlight also damage juvinates.

Changed:

- 2.147.0: new quest; Gadderanks and the juvinates are in combatFoes.json and the sickle rule in fightMechanics.json.

Evidence:

- OSRS Wiki In Aid of the Myreque: kills and items fields, read 2026-11-18.

## S9-59 Recipe for Disaster/Freeing the Mountain Dwarf

**Retain.** Recipe for Disaster, Freeing the Mountain Dwarf: without ice gloves, kill an icefiend (level 13, hits up to 2) on Ice Mountain to cool the rock cake.

Assumptions:

- Two trout (heals 7) cover the fight; ice gloves skip it.

Alternatives:

- Ice gloves from the Fremennik Isles let you pick up the hot cake and skip the fight.

Changed:

- 2.148.0: new quest; Icefiend is in combatFoes.json.

Evidence:

- OSRS Wiki Recipe for Disaster/Freeing the Mountain Dwarf: requirements, read 2026-11-18.

## S9-60 Recipe for Disaster/Freeing Pirate Pete

**Retain.** Recipe for Disaster, Freeing Pirate Pete: underwater, kill 5 mudskippers (level 30/31, hits up to 4) for their hides and a crab (level 21/23, hits up to 3) for its meat.

Quest stage lines: 1.4, 1.6.

Assumptions:

- Five trout (heals 7) cover the dives; the estimate uses the level-31 mudskipper and level-23 crab.

Alternatives:

- Any weapon works; the fights are short and the diving helmet keeps you breathing.

Changed:

- 2.148.0: new quest; mudskippers and crabs are in combatFoes.json.

Evidence:

- OSRS Wiki Recipe for Disaster/Freeing Pirate Pete: kills and items fields, read 2026-11-18.

## S9-61 Recipe for Disaster/Freeing Skrach Uglogwee

**Retain.** Recipe for Disaster, Freeing Skrach Uglogwee: kill the level-9 Jubbly that lands by the balloon toad, with the ogre bow and ogre arrows; it does not fight back.

Quest stage lines: 2.3.

Assumptions:

- The Jubbly only lands to eat the toad and has no attack; the Wiki gives it no combat stats, so nothing is estimated.

Alternatives:

- Another balloon toad brings another Jubbly if the first is lost or burnt.

Changed:

- 2.148.0: new quest; the ogre bow is kept from Big Chompy Bird Hunting.

Evidence:

- OSRS Wiki Recipe for Disaster/Freeing Skrach Uglogwee quick guide, read 2026-11-18.

## S9-62 A Porcine of Interest

**Retain.** A Porcine of Interest: kill Sourhog (level 37, 40 hitpoints, hits up to 6) in the cave under the Strange Hole east of Draynor Manor, wearing the reinforced goggles from Spria.

Quest stage lines: 0.7.

Assumptions:

- The reinforced goggles are worn, which keeps its hits at 6; four trout (heals 7) cover the fight.

Problems:

- Without the goggles its saliva hits 20-30 and drains Attack and Defence; the route tells you to equip them first.

Alternatives:

- Any weapon works; a knife or slash weapon cuts off the foot afterwards.

Changed:

- 2.149.0: new quest; Sourhog is in combatFoes.json.

Evidence:

- OSRS Wiki Sourhog infobox and A Porcine of Interest quick guide, read 2026-11-19.

## S9-63 Tai Bwo Wannai Trio

**Retain.** Tai Bwo Wannai Trio: kill a level-3 monkey with Wind Strike for its corpse; Tamayu fights the Shaikahan himself.

Quest stage lines: 2.4, 2.5, 3.1.

Assumptions:

- Melee does no damage to the monkey, so the route plans air and mind runes for Wind Strike; a level-3 monkey cannot threaten the player.

Alternatives:

- A bow or a halberd also kills the monkey.

Changed:

- 2.149.0: new quest.

Evidence:

- OSRS Wiki Tai Bwo Wannai Trio quick guide, read 2026-11-19.

## S9-64 Shadow of the Storm

**Retain.** Shadow of the Storm: kill Agrith Naar (level 100, 95 hitpoints, hits up to 10) in the Uzer temple; the final blow must be dealt with Silverlight.

Quest stage lines: 3.1.

Assumptions:

- The estimate fights him with Silverlight throughout (fightMechanics.json); ten lobsters (heals 12) are a margin.

Problems:

- He also casts magic for up to 10; the estimate uses his crush attack, the first style the Wiki lists.

Alternatives:

- He can be flinched by standing behind the north-western torch.

Changed:

- 2.149.0: new quest; Agrith Naar is in combatFoes.json and fights with Silverlight.

Evidence:

- OSRS Wiki Agrith Naar infobox and Shadow of the Storm quick guide, read 2026-11-19.

## S9-65 Troll Romance

**Retain.** Troll Romance: kill Arrg (level 113, 140 hitpoints) in the arena with Fire Bolt from the safespot behind the mountain wall to the west, by the fence.

Quest stage lines: 3.1, 3.2.

Assumptions:

- From the safespot he cannot reach you; six lobsters cover the hits taken while leading him there (up to 38 melee, 30 ranged).

Problems:

- His Magic defence is 200, so many Fire Bolts miss: about 35 casts by the estimate (up to 51); the step plans runes for 60.

Alternatives:

- Protection prayers against his switching melee and ranged attacks, as the Wiki describes, instead of the safespot.

Changed:

- 2.150.0: new quest; Arrg is in combatFoes.json and fought from the safespot (fightMechanics.json).

Evidence:

- OSRS Wiki Arrg infobox and Troll Romance quick guide, read 2026-11-19.

## S9-66 Underground Pass

**Retain.** Underground Pass: kill the three paladins (Sir Jerro, Sir Carl, Sir Harry, level 62), the three demons (Doomion, Holthion, Othainian, level 91), Kalrag (level 89) and a disciple of Iban (level 13).

Quest stage lines: 1.13, 2.4, 3.7, 4.0, 5.1, 5.3.

Assumptions:

- Every foe hits for at most 9; twenty lobsters (heals 12) cover the fights and the agility traps.

Problems:

- Kalrag stops hitting under Protect from Melee, which the estimate does not count.

Alternatives:

- The Wiki marks the paladins and demons as easy to safespot.

Changed:

- 2.150.0: new quest; all eight foes are in combatFoes.json.

Evidence:

- OSRS Wiki Underground Pass kills field and the foes' infoboxes, read 2026-11-19.

## S9-68 Regicide

**Retain.** Regicide: kill the Tyras guard (level 110) that spawns in the second forest, with Fire Bolt from a safespot.

Quest stage lines: 1.9, 4.1.

Assumptions:

- The Wiki says the guard can be safespotted with Ranged, Magic or a halberd; from the safespot it cannot reach you, and ten lobsters cover the traps and the walk to it.

Problems:

- Its Magic defence is -10, so most Fire Bolts land; the step plans a staff of fire and runes for 30 casts.

Alternatives:

- Melee with food, as the Wiki allows, instead of the safespot.

Changed:

- 2.151.0: new quest; the Tyras guard is in combatFoes.json and fought from the safespot (fightMechanics.json).

Evidence:

- OSRS Wiki Tyras guard infobox and Regicide requirements, read 2026-11-19.

## S9-69 Roving Elves

**Retain.** Roving Elves: kill a Moss Guardian (level 84, 120 hitpoints) in Glarial's Tomb bare-handed for the consecration seed.

Quest stage lines: 1.2.

Assumptions:

- Glarial's Tomb lets in no weapons, armour or runes, so the estimate fights it with no weapon and no armour (fightMechanics.json bare); twelve lobsters cover the hits.

Problems:

- Unarmed melee with no Strength bonus makes it a long fight against 120 hitpoints.

Alternatives:

- Protect from Melee (Prayer 43), a ring of recoil or flinching by the south-eastern pillar, as the Wiki describes.

Changed:

- 2.151.0: new quest; the Moss Guardian is fought bare-handed (fightMechanics.json bare).

Evidence:

- OSRS Wiki Moss Guardian infobox, Glarial's Tomb restricted items and Roving Elves walkthrough, read 2026-11-19.

## S9-70 Recruitment Drive

**Retain.** Recruitment Drive: defeat Sir Leye (level 20, 20 hitpoints) in Sir Kuam's test room, with no armour, food or potions.

Quest stage lines: 0.3, 0.4.

Assumptions:

- The test rooms allow no items, so the estimate fights him unarmed with no armour and no food (fightMechanics.json bare, noFood); the steel warhammer in the room only makes it faster.

Problems:

- If the fight needed food it could not be planned: the estimate flags that as unmodelled.

Alternatives:

- Prayer is allowed; the Wiki advises 25 Attack, Defence, Strength and Hitpoints.

Changed:

- 2.152.0: new quest; Sir Leye is fought bare-handed without food (fightMechanics.json).

Evidence:

- OSRS Wiki Sir Leye infobox and Recruitment Drive quick guide, read 2026-11-19.

## S9-71 Wanted!

**Retain.** Wanted!: kill a level 32 Black Knight in Taverley Dungeon for Lord Daquarius, then Solus Dellagar (40 hitpoints, max hit 4) in the Rune Essence mine.

Quest stage lines: 1.3, 4.1.

Assumptions:

- Four lobsters cover both fights; the Black Knight sets the kit.

Problems:

- Solus has no combat level and a blank attack bonus on the Wiki, so he is not estimated: 40 hitpoints and a max hit of 4 make him weaker than the knight.

Alternatives:

- Any melee kit that beats the knight.

Changed:

- 2.152.0: new quest; the Black Knight is in combatFoes.json.

Evidence:

- OSRS Wiki Black Knight (Wanted!) and Solus Dellagar infoboxes, Wanted! walkthrough, read 2026-11-19.

## S9-75 The Ascent of Arceuus

**Retain.** The Ascent of Arceuus: kill five Tormented Souls (level 16, max hit 2) and then the Trapped Soul (level 30, max hit 4) for Mori.

Quest stage lines: 0.4, 0.5, 0.12.

Assumptions:

- Three lobsters cover the souls; the Trapped Soul sets the kit.

Alternatives:

- Any melee kit that beats the Trapped Soul; it is weak to air spells.

Changed:

- 2.153.0: new quest; both souls are in combatFoes.json.

Evidence:

- OSRS Wiki Tormented Soul and Trapped Soul infoboxes, The Ascent of Arceuus quick guide, read 2026-11-19.

## S9-77 Contact!

**Retain.** Contact!: kill the level 191 Giant Scarab (130 hitpoints, max hit 20) by the chasm under Sophanem; it summons level 68 scarab mages, locust rangers and locust lancers in turn.

Quest stage lines: 0.14.

Assumptions:

- Fifteen lobsters cover the scarab; Protect from Melee up close cuts its own hits.
- The dungeon's locust riders and scarab mages are passed under protection prayers, not fought.

Problems:

- The summoned minions add hits the estimate does not count: mages up to 17, rangers up to 22, lancers up to 15 (OSRS Wiki).

Alternatives:

- Ranged or Magic from the south-west corner with Protect from Missiles, where the melee lancers cannot reach (OSRS Wiki).

Changed:

- 2.154.0: new quest; the Giant Scarab is in combatFoes.json.

Evidence:

- OSRS Wiki Giant scarab and Contact! quick guide, read 2026-11-20.

## S9-79 Heroes' Quest

**Retain.** Heroes' Quest: kill the level 47 Jailer in the Black Knights' base for the jail key, the level 111 Ice Queen under White Wolf Mountain for the ice gloves, and the level 2 Entrana firebird bare-handed for the fire feather.

Quest stage lines: 3.3.

Assumptions:

- Ten lobsters cover the Jailer and the Ice Queen; the Ice Queen sets the kit.
- Entrana allows no weapons or armour, so the firebird is fought bare-handed (fightMechanics.json bare).

Problems:

- Phoenix Gang members also kill Grip (level 26, max hit 3) with Ranged or Magic; the step leaves him out because Black Arm members never fight him.

Alternatives:

- Black Arm Gang members skip Grip; their partner kills him.

Changed:

- 2.155.0: new quest; the Jailer, Ice Queen and Entrana firebird are in combatFoes.json.

Evidence:

- OSRS Wiki Heroes' Quest quick guide, Ice Queen, Jailer, Entrana firebird and Grip infoboxes, read 2026-11-20.

## S9-81 Lunar Diplomacy

**Retain.** Lunar Diplomacy: kill level 111 Suqahs outside the Lunar Isle town for a tooth, a special tiara and 4 hides, then defeat Me (level 79) in the Dream World.

Quest stage lines: 3.2, 5.7, 13.0, 13.1.

Assumptions:

- Fifteen lobsters cover several Suqahs and Me; the Suqahs set the kit.
- Me can be safespotted, and gear cannot be changed once the fight starts (OSRS Wiki).

Problems:

- How many Suqahs drop the tooth, the tiara and 4 hides is random, so the food is an estimate.

Alternatives:

- Safespot Me with Ranged or Magic, equipped before entering the Dream World.

Changed:

- 2.155.0: new quest; the Suqah and Me are in combatFoes.json.

Evidence:

- OSRS Wiki Lunar Diplomacy quick guide, Suqah and Me infoboxes, read 2026-11-20.

