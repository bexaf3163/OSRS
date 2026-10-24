"""The route quests: route step -> (the Quest Helper class, the variable kind, the variable number)."""

QUESTS = {
    'S1-03': ('CooksAssistant', 'varp', 29), 'S1-04': ('SheepShearer', 'varp', 179), 'S1-05': ('XMarksTheSpot', 'varbit', 8063),
    'S1-06': ('TheRestlessGhost', 'varp', 107), 'S1-07': ('MisthalinMystery', 'varbit', 3468), 'S2-02': ('ImpCatcher', 'varp', 160),
    'S2-03': ('WitchsPotion', 'varp', 67), 'S2-05': ('RomeoAndJuliet', 'varp', 144), 'S2-06': ('RuneMysteries', 'varp', 63),
    'S2-07': ('TheKnightsSword', 'varp', 122), 'S2-08': ('VampyreSlayer', 'varp', 178), 'S2-09': ('PiratesTreasure', 'varp', 71),
    'S2-10': ('PrinceAliRescue', 'varp', 273), 'S2-11': ('ErnestTheChicken', 'varp', 32), 'S2-12': ('GoblinDiplomacy', 'varbit', 2378),
    'S3-01': ('DoricsQuest', 'varp', 31), 'S3-02': ('BlackKnightFortress', 'varp', 130), 'S3-03': ('DemonSlayer', 'varbit', 2561),
    'S3-04': ('BelowIceMountain', 'varbit', 12063), 'S4-01': ('TheCorsairCurse', 'varbit', 6071), 'S4-02': ('TheIdesOfMilk', 'varbit', 20106),
    'S5-01': ('DragonSlayer', 'varp', 176), 'S5-03': ('DragonSlayer', 'varp', 176), 'S5-04': ('DragonSlayer', 'varp', 176), 'S5-06': ('DragonSlayer', 'varp', 176),
    'S5-07': ('DragonSlayer', 'varp', 176),
    'S7-01': ('WaterfallQuest', 'varp', 65), 'S7-02': ('FightArena', 'varp', 17), 'S7-03': ('TreeGnomeVillage', 'varp', 111),
    'S7-05': ('TheGrandTree', 'varp', 150), 'S8-01': ('PriestInPeril', 'varp', 302), 'S8-02': ('NatureSpirit', 'varp', 307),
    'S8-05': ('AnimalMagnetism', 'varbit', 3185), 'S9-01': ('LostCity', 'varp', 147), 'S9-02': ('FairytaleI', 'varbit', 1803),
    'S9-03': ('FairytaleII', 'varbit', 2326), 'S9-04': ('MonkeyMadnessI', 'varp', 365),
}

# Route steps that cover only part of a quest (build.take_part): the variable values the step's lines cover, or the Quest Helper step that is
# the root of the step's part. Dragon Slayer I is split over S5-01...S5-09; S5-03 is Melzar's Maze, whose lines follow Quest Helper's
# room-and-key logic: the nearest tile alone cannot tell the maze's rooms apart through a wall.
PARTS = {
    'S5-01': 'askQuestions', 'S5-03': 'getMelzarPiece', 'S5-04': 'getThalzarPiece', 'S5-06': 'getBoat', 'S5-07': 'getCaptain',
}

# Machines kept as they are in questMachines.json instead of regenerated: S9-03 was cut by hand to the part of Fairytale II the route leads
# (d30e570, partial route milestones), and the Quest Helper revision it came from gives another goInvestigate.
KEPT = {'S9-03'}
