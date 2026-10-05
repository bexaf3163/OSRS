"""Skill guide content: gathering, artisan and support skills. See content_combat.py for the format and the sources."""

from dsl import s

STEPS = []
A = STEPS.append

# ---------------------------------------------------------------- Woodcutting
A(s('woodcutting', 1, 26, 'QUEST', "Monk's Friend (XP skip)", 'A short quest with a Woodcutting reward: no chopping needed.', 'wiki:Brother Omad', 'fast', True, quest="Monk's Friend", npc='Brother Omad'))
A(s('woodcutting', 26, 30, 'QUEST', 'Enlightened Journey (XP skip)', 'A balloon quest with a Woodcutting reward.', 'wiki:Auguste', 'fast', True, quest='Enlightened Journey', npc='Auguste'))
A(s('woodcutting', 1, 15, 'GATHER', 'Regular trees', 'Chop ordinary trees by Lumbridge Castle. Use the best axe you can wield.', 'Lumbridge', 'both', False, obj='Tree', rate='~12k xp/hr'))
A(s('woodcutting', 15, 30, 'GATHER', 'Oak trees', 'Chop oak trees: by the Draynor bank, west of Varrock, or at Port Sarim.', 'Draynor Bank', 'both', False, obj='Oak tree'))
A(s('woodcutting', 30, 60, 'GATHER', 'Willow trees', 'Chop willows by Draynor Village and bank or drop the logs. Dark wizards wander nearby: stay alert.', 'Draynor Village', 'both', False, obj='Willow tree', rate='~20-35k xp/hr'))
A(s('woodcutting', 60, 99, 'GATHER', 'Yew trees', 'Chop yews south of the Edgeville bank: free to play and good money.', 'Edgeville Bank', 'both', False, obj='Yew tree'))
A(s('woodcutting', 35, 60, 'GATHER', 'Teak trees', 'Teak trees give the best Woodcutting XP of the accessible trees: chop them and bank or drop the logs.', 'wiki:Teak tree', 'fast', True, obj='Teak tree'))
A(s('woodcutting', 60, 99, 'GATHER', 'Woodcutting Guild', 'Chop yews and magic trees in the Woodcutting Guild (Woodcutting 60): a bank is next to the trees.', 'Woodcutting Guild', 'fast', True, obj='Yew tree'))

# ---------------------------------------------------------------- Firemaking
A(s('firemaking', 1, 15, 'GATHER', 'Burn regular logs', 'Light fires on a line of free tiles with a tinderbox. Buy the logs on the Grand Exchange or chop them yourself.', 'Grand Exchange', 'both', False))
A(s('firemaking', 15, 30, 'GATHER', 'Burn oak logs', 'Light a line of fires with oak logs.', 'Grand Exchange', 'both', False))
A(s('firemaking', 30, 45, 'GATHER', 'Burn willow logs', 'Light a line of fires with willow logs.', 'Grand Exchange', 'both', False))
A(s('firemaking', 45, 60, 'GATHER', 'Burn maple logs', 'Light a line of fires with maple logs.', 'Grand Exchange', 'both', False))
A(s('firemaking', 60, 99, 'GATHER', 'Burn yew logs', 'Light a line of fires with yew logs.', 'Grand Exchange', 'both', False))
A(s('firemaking', 50, 99, 'MINIGAME', 'Wintertodt', 'Wintertodt is the best members Firemaking method: fletch kindling, feed the brazier and fight the cold. Bring food and a knife.', 'wiki:Wintertodt', 'fast', True, npc='Wintertodt', rate='~100k xp/hr'))

# ---------------------------------------------------------------- Fishing
A(s('fishing', 1, 24, 'QUEST', 'Sea Slug (XP skip)', 'A short quest with a big Fishing reward: it takes you to level 24 without catching a fish.', 'wiki:Caroline', 'fast', True, quest='Sea Slug', npc='Caroline'))
A(s('fishing', 24, 27, 'QUEST', 'Fishing Contest (XP skip)', 'A short quest with a Fishing reward. You catch one fish in the contest.', 'wiki:Bonzo', 'fast', True, quest='Fishing Contest', npc='Bonzo'))
A(s('fishing', 1, 20, 'GATHER', 'Shrimps and anchovies', 'Net-fish shrimps and anchovies at the Draynor Village fishing spots.', 'Draynor Village fishing spots', 'both', False, npc='Fishing spot'))
A(s('fishing', 20, 40, 'GATHER', 'Trout and salmon', 'Fly-fish trout and salmon at the Barbarian Village spots. You need a fly fishing rod and feathers.', 'Barbarian Village fishing spots', 'both', False, npc='Fishing spot'))
A(s('fishing', 40, 50, 'GATHER', 'Lobsters', 'Catch lobsters with a lobster pot at Musa Point on Karamja.', 'Musa Point fishing spots', 'both', False, npc='Fishing spot'))
A(s('fishing', 50, 99, 'GATHER', 'Tuna and swordfish', 'Harpoon tuna and swordfish at Musa Point on Karamja: free to play.', 'Musa Point fishing spots', 'both', False, npc='Fishing spot'))
A(s('fishing', 35, 99, 'MINIGAME', 'Tempoross', 'Fight the Tempoross on a busy world: fast, low effort and it rewards extra XP at the end.', 'wiki:Tempoross', 'fast', True, npc='Tempoross'))
A(s('fishing', 58, 99, 'GATHER', 'Barbarian fishing', 'Catch leaping fish at the Barbarian Outpost: it also trains Strength and Agility.', 'wiki:Otto Godblessed', 'afk', True, npc='Fishing spot'))

# ---------------------------------------------------------------- Cooking
A(s('cooking', 1, 20, 'GATHER', 'Raw beef and chicken', 'Cook raw beef and chicken on the range in the Lumbridge Castle kitchen (after Cook\'s Assistant) or on a fire.', 'Lumbridge Castle', 'both', False, obj='Range'))
A(s('cooking', 20, 30, 'GATHER', 'Trout', 'Cook trout on a fire or range by the fishing spots at Barbarian Village.', 'Barbarian Village', 'both', False, obj='Fire'))
A(s('cooking', 30, 35, 'GATHER', 'Tuna', 'Cook tuna on a range at Musa Point or after a trip to the bank.', 'Musa Point', 'both', False, obj='Range'))
A(s('cooking', 35, 99, 'GATHER', 'Jugs of wine', 'Make wine in the Cooks\' Guild: use grapes on a jug of water, then the range. It trains Cooking fast and costs little (free to play).', "Cooks' Guild", 'both', False, obj='Range'))
A(s('cooking', 30, 99, 'GATHER', 'Cooked karambwan', 'Buy raw karambwan on the Grand Exchange and cook them on the Hosidius range: the fastest low-effort Cooking method.', 'wiki:Hosidius', 'fast', True, obj='Range'))

# ---------------------------------------------------------------- Mining
A(s('mining', 1, 13, 'QUEST', "Doric's Quest (XP skip)", 'A free quest with a small Mining reward; it also gives you the right to use the north anvil.', 'wiki:Doric', 'fast', False, quest="Doric's Quest", npc='Doric'))
A(s('mining', 13, 37, 'QUEST', 'The Dig Site (XP skip)', 'A members quest with a very large Mining reward: a single quest that skips most of the early levels.', 'wiki:Examiner', 'fast', True, quest='The Dig Site', npc='Examiner'))
A(s('mining', 1, 15, 'GATHER', 'Copper and tin', 'Mine copper and tin at the Lumbridge Swamp mine: quiet, with no aggressive monsters.', 'East Lumbridge Swamp mine', 'both', False, obj='Copper rocks'))
A(s('mining', 15, 99, 'GATHER', 'Iron ore (powermining)', 'Mine iron at the Al Kharid mine and drop the ore: the standard free-to-play method.', 'Al Kharid mine', 'both', False, obj='Iron rocks', rate='~25-45k xp/hr'))
A(s('mining', 30, 99, 'MINIGAME', 'Motherlode Mine', 'Mine pay-dirt, clean it in the hopper and empty the sack: a profitable low-effort members method.', 'wiki:Motherlode Mine', 'afk', True, obj='Ore vein'))
A(s('mining', 45, 99, 'GATHER', 'Granite', 'Mine granite at the quarry: the fastest members method from level 45, with a bit of effort to learn.', 'wiki:Quarry', 'fast', True, obj='Granite rocks'))

# ---------------------------------------------------------------- Smithing
A(s('smithing', 1, 29, 'QUEST', "The Knight's Sword (XP skip)", 'A free quest that gives a huge block of Smithing XP in one go: it skips most of the early smithing. You need to mine blurite ore (Mining 10).', 'wiki:Squire', 'fast', False, quest="The Knight's Sword", npc='Squire'))
A(s('smithing', 29, 40, 'GATHER', 'Smith at the Varrock anvil', 'Smith the best item you can make at the anvil just south of the Varrock west bank. It loses a little money but takes under an hour.', 'Varrock West Bank', 'fast', False, obj='Anvil'))
A(s('smithing', 1, 40, 'GATHER', 'Anvil smithing', 'Smelt bars in a furnace and smith the best item at the anvil south of the Varrock west bank. Pick items that use several bars per action.', 'Varrock West Bank', 'both', False, obj='Anvil'))
A(s('smithing', 40, 99, 'GATHER', 'Smith the best armour', 'Smith armour at the Varrock anvil with mithril or adamantite bars (free to play): slower, but works everywhere.', 'Varrock West Bank', 'both', False, obj='Anvil'))
A(s('smithing', 15, 99, 'MINIGAME', "Giants' Foundry", "Forge swords at Giants' Foundry: low effort, and it pays you. Needs Sleeping Giants.", "wiki:Giants' Foundry", 'afk', True, quest='Sleeping Giants', npc='Kovac'))
A(s('smithing', 40, 99, 'GATHER', 'Blast Furnace gold bars', 'Smelt gold bars at the Blast Furnace: the fastest viable members method from level 40 (it costs money).', 'wiki:Blast Furnace', 'fast', True, obj='Bar dispenser'))

# ---------------------------------------------------------------- Crafting (free to play up to cutting diamonds)
A(s('crafting', 1, 20, 'CRAFT', 'Leather items', 'Craft the best leather item you can with a needle and thread: gloves, boots, then the first body items.', 'Al Kharid Bank', 'both', False, items=[{'id': 1733, 'name': 'Needle', 'quantity': 1}, {'id': 1734, 'name': 'Thread', 'quantity': 50}]))
A(s('crafting', 20, 43, 'CRAFT', 'Cutting gems', 'Cut sapphires, emeralds, rubies and diamonds with a chisel: the fastest free-to-play method and safe.', 'Grand Exchange', 'both', False, items=[{'id': 1755, 'name': 'Chisel', 'quantity': 1}]))
A(s('crafting', 43, 62, 'CRAFT', 'Cutting diamonds', 'Keep cutting diamonds with a chisel until level 62.', 'Grand Exchange', 'fast', True, items=[{'id': 1755, 'name': 'Chisel', 'quantity': 1}]))
A(s('crafting', 62, 99, 'CRAFT', "Dragonhide bodies", "Craft green, blue and red dragonhide bodies: cheap bodies at the level where gem cutting gets expensive.", 'Grand Exchange', 'fast', True))
A(s('crafting', 5, 99, 'CRAFT', 'Molten glass', 'Make molten glass and craft glass items: low effort, steady XP.', 'Edgeville', 'afk', True))

# ---------------------------------------------------------------- Fletching (members only)
A(s('fletching', 1, 20, 'QUEST', 'The Tourist Trap (XP skip)', 'A members quest with a big Fletching reward. Put the reward on Fletching when the quest lets you choose.', 'wiki:Irena', 'fast', True, quest='The Tourist Trap', npc='Irena'))
A(s('fletching', 1, 5, 'CRAFT', 'Arrow shafts', 'Cut logs into arrow shafts with a knife for the first levels.', 'Grand Exchange', 'both', True))
A(s('fletching', 5, 20, 'CRAFT', 'Shortbows', 'Cut logs into unstrung shortbows and string them.', 'Grand Exchange', 'both', True))
A(s('fletching', 20, 40, 'CRAFT', 'Oak bows', 'Cut oak logs into unstrung bows and string them.', 'Grand Exchange', 'both', True))
A(s('fletching', 40, 55, 'CRAFT', 'Willow bows', 'Cut willow logs into unstrung longbows and string them.', 'Grand Exchange', 'both', True))
A(s('fletching', 55, 70, 'CRAFT', 'Maple bows', 'Cut maple logs into unstrung longbows and string them.', 'Grand Exchange', 'both', True))
A(s('fletching', 70, 85, 'CRAFT', 'Yew bows', 'Cut yew logs into unstrung longbows and string them.', 'Grand Exchange', 'both', True))
A(s('fletching', 85, 99, 'CRAFT', 'Magic bows', 'Cut magic logs into unstrung longbows and string them.', 'Grand Exchange', 'both', True))

# ---------------------------------------------------------------- Herblore (members only)
A(s('herblore', 1, 3, 'QUEST', 'Druidic Ritual (XP skip)', 'A members quest that gives your first Herblore levels and unlocks the skill.', 'wiki:Kaqemeex', 'both', True, quest='Druidic Ritual', npc='Kaqemeex'))
A(s('herblore', 3, 10, 'QUEST', 'Jungle Potion (XP skip)', 'A members quest with a Herblore reward (it needs level 3 first).', 'wiki:Trufitus', 'fast', True, quest='Jungle Potion', npc='Trufitus'))
A(s('herblore', 3, 99, 'CRAFT', 'Make potions', 'Buy herbs and secondaries on the Grand Exchange and make the best potion you can: the standard Herblore method.', 'Grand Exchange', 'both', True))
A(s('herblore', 60, 99, 'MINIGAME', 'Mastering Mixology', 'Brew potions in the Mastering Mixology minigame in Varlamore: a fast low-effort method from level 60.', 'wiki:Mastering Mixology', 'fast', True))

# ---------------------------------------------------------------- Thieving (members only)
A(s('thieving', 1, 5, 'GATHER', 'Pickpocket men and women', 'Pickpocket men and women in Lumbridge or Varrock for your first levels.', 'Lumbridge', 'both', True, npc='Man'))
A(s('thieving', 5, 25, 'GATHER', 'Bakery stalls', 'Steal from the bakery stall in East Ardougne: bring food, the guard is nearby.', 'East Ardougne', 'both', True, obj='Baker\'s stall'))
A(s('thieving', 25, 45, 'GATHER', 'Fruit stalls', 'Steal from the fruit stalls in Hosidius.', 'wiki:Hosidius', 'both', True, obj='Fruit stall'))
A(s('thieving', 45, 55, 'GATHER', 'Blackjack bandits', 'Blackjack bandits in Pollnivneach: needs The Feud.', 'Pollnivneach', 'both', True, quest='The Feud', npc='Bandit'))
A(s('thieving', 55, 99, 'GATHER', 'Knights of Ardougne', 'Pickpocket the Knights of Ardougne in East Ardougne: the classic mid-to-high level method. Bring food.', 'East Ardougne', 'both', True, npc='Knight of Ardougne'))

# ---------------------------------------------------------------- Agility (members only)
A(s('agility', 1, 20, 'QUEST', 'The Tourist Trap (XP skip)', 'A members quest with a big Agility reward. Put the reward on Agility when the quest lets you choose.', 'wiki:Irena', 'fast', True, quest='The Tourist Trap', npc='Irena'))
A(s('agility', 20, 33, 'QUEST', 'The Grand Tree (XP skip)', 'A members quest with a large Agility reward.', 'Tree Gnome Stronghold', 'fast', True, quest='The Grand Tree', npc='King Narnode Shareen'))
A(s('agility', 1, 10, 'GATHER', 'Gnome Stronghold course', 'Run the gnome agility course in the Tree Gnome Stronghold for your first levels.', 'wiki:Gnome Stronghold Agility Course', 'both', True, obj='Log balance'))
A(s('agility', 10, 20, 'GATHER', 'Draynor Village rooftop', 'Run the Draynor Village rooftop course.', 'wiki:Draynor Village Rooftop Course', 'both', True, obj='Rough wall'))
A(s('agility', 20, 30, 'GATHER', 'Al Kharid rooftop', 'Run the Al Kharid rooftop course.', 'wiki:Al Kharid Rooftop Course', 'both', True, obj='Rough wall'))
A(s('agility', 30, 40, 'GATHER', 'Varrock rooftop', 'Run the Varrock rooftop course.', 'wiki:Varrock Rooftop Course', 'both', True, obj='Rough wall'))
A(s('agility', 40, 50, 'GATHER', 'Canifis rooftop', 'Run the Canifis rooftop course.', 'wiki:Canifis Rooftop Course', 'both', True, obj='Tall tree'))
A(s('agility', 50, 60, 'GATHER', 'Falador rooftop', 'Run the Falador rooftop course.', 'wiki:Falador Rooftop Course', 'both', True, obj='Rough wall'))
A(s('agility', 60, 70, 'GATHER', "Seers' Village rooftop", "Run the Seers' Village rooftop course: it has marks of grace and a good rate.", "wiki:Seers' Village Rooftop Course", 'both', True, obj='Wall'))
A(s('agility', 70, 80, 'GATHER', 'Pollnivneach rooftop', 'Run the Pollnivneach rooftop course.', 'wiki:Pollnivneach Rooftop Course', 'both', True, obj='Basket'))
A(s('agility', 80, 90, 'GATHER', 'Rellekka rooftop', 'Run the Rellekka rooftop course.', 'wiki:Rellekka Rooftop Course', 'both', True, obj='Rough wall'))
A(s('agility', 90, 99, 'GATHER', 'Ardougne rooftop', 'Run the Ardougne rooftop course: the best rooftop course of all.', 'wiki:Ardougne Rooftop Course', 'both', True, obj='Wooden Beams'))
A(s('agility', 33, 47, 'MINIGAME', 'Brimhaven Agility Arena', 'Brimhaven Agility Arena gives the fastest XP from level 20 to 47: pay the entry fee and use the floor spikes trap. Bring food.', 'wiki:Brimhaven Agility Arena', 'fast', True))
A(s('agility', 62, 99, 'MINIGAME', 'Hallowed Sepulchre', 'The Hallowed Sepulchre gives the fastest Agility XP from level 62: run the floors as high as you can.', 'wiki:Hallowed Sepulchre', 'fast', True, obj='Coffin'))

# ---------------------------------------------------------------- Construction (members only)
A(s('construction', 1, 99, 'MINIGAME', 'Mahogany Homes', 'Repair houses for the carpenters: a low-effort way that works from level 1 and pays you in XP and points.', 'wiki:Mahogany Homes', 'both', True))
A(s('construction', 33, 52, 'CRAFT', 'Oak larders', 'Build and remove oak larders in your house with planks bought on the Grand Exchange.', 'Rimmington', 'fast', True))
A(s('construction', 52, 99, 'CRAFT', 'Mahogany furniture', 'Build and remove mahogany tables in your house: fast, and the cost is mostly planks.', 'Rimmington', 'fast', True))

# ---------------------------------------------------------------- Farming (members only)
A(s('farming', 1, 15, 'GATHER', 'Farming allotments', 'Plant seeds in the allotment patches near Falador: your first levels, with a few trips.', 'Falador', 'both', True, obj='Allotment'))
A(s('farming', 15, 99, 'GATHER', 'Tree runs', 'Plant tree seeds in the tree patches around Gielinor and come back when they are grown: the standard long-term method.', 'Falador', 'both', True, obj='Tree patch'))
A(s('farming', 34, 99, 'MINIGAME', 'Tithe Farm', 'Plant and water seeds at the Tithe Farm in Hosidius: a steady low-effort method that also rewards the Farmer\'s outfit.', 'wiki:Tithe Farm', 'afk', True))

# ---------------------------------------------------------------- Hunter (members only)
A(s('hunter', 1, 9, 'MINIGAME', 'Natural History Quiz', 'Do the Natural History Quiz at the Varrock museum for your first Hunter levels.', 'Varrock', 'both', True, npc='Orlando Smith'))
A(s('hunter', 9, 15, 'GATHER', 'Feldip weasels', 'Catch Feldip weasels in the Feldip Hills.', 'wiki:Feldip weasel', 'fast', True, npc='Feldip weasel'))
A(s('hunter', 15, 21, 'GATHER', 'Ruby harvests', 'Catch ruby harvests: a quick low-level Hunter method.', 'wiki:Ruby harvest', 'fast', True, npc='Ruby harvest'))
A(s('hunter', 21, 39, 'GATHER', 'Red crabs', 'Catch red crabs.', 'wiki:Red crab (Hunter)', 'fast', True, npc='Red crab'))
A(s('hunter', 39, 43, 'GATHER', 'Embertailed jerboas', 'Catch embertailed jerboas.', 'wiki:Embertailed jerboa', 'fast', True, npc='Embertailed jerboa'))
A(s('hunter', 43, 49, 'GATHER', 'Falconry', 'Hunt kebbits with a falcon at the Piscatoris Falconry.', 'wiki:Piscatoris Hunter area', 'fast', True, npc='Falconer'))
A(s('hunter', 49, 73, 'GATHER', 'Razor-backed kebbits', 'Hunt razor-backed kebbits.', 'wiki:Razor-backed kebbit', 'fast', True, npc='Razor-backed kebbit'))
A(s('hunter', 73, 99, 'GATHER', 'Black chinchompas', 'Catch black chinchompas in the Wilderness: the fastest Hunter method (and dangerous: bring only what you can lose).', 'wiki:Black chinchompa (Hunter)', 'fast', True, npc='Black chinchompa'))
A(s('hunter', 9, 44, 'GATHER', 'Bird houses', 'Build bird houses on Fossil Island and come back to collect: a very low-effort way, and it pays.', 'wiki:Bird house', 'afk', True))
A(s('hunter', 44, 99, 'GATHER', 'Drift net fishing', 'Catch fish with drift nets in the Fossil Island waters: a calm way that also trains Fishing.', 'wiki:Fossil Island', 'afk', True))
