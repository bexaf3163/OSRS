"""Skill guide content: attack, strength, defence, hitpoints, ranged, prayer, magic, runecraft, slayer.

One call per step: s(skill, lo, hi, type, title, text, place, lane, members, **extra).
 lane: 'fast' (quest skips and the fastest accessible methods), 'afk' (AFK / budget) or 'both'.
 place: a key of src/data/majorLocations.json, 'wiki:Article' (the article's {{Map}} point) or 'tile:x,y,plane'.
 For QUEST steps lo/hi are recomputed by build.py from the quest's real XP reward on the wiki (a chain: each starts where the previous quest step ended).
The method brackets follow the OSRS Wiki training guides (Fastest experience / Other methods); the step order in a lane is the order of preference.
"""

from dsl import s

STEPS = []
A = STEPS.append

# ---------------------------------------------------------------- Attack
A(s('attack', 1, 30, 'QUEST', 'Waterfall Quest (XP skip)', 'Do the quest: its reward is a large block of Attack XP (and the same for Strength). No combat levels are needed, but food helps.',
    'wiki:Almera', 'fast', True, quest='Waterfall Quest', npc='Almera'))
A(s('attack', 30, 40, 'QUEST', 'Fight Arena (XP skip)', 'A short quest with a large Attack reward. You fight a few guards and a scorpion: bring food.', 'wiki:Lady Servil', 'fast', True, quest='Fight Arena', npc='Lady Servil'))
A(s('attack', 40, 45, 'QUEST', 'Tree Gnome Village (XP skip)', 'Another Attack reward: the gnome quest ends with a fight against the warlord.', 'wiki:Commander Montai', 'fast', True, quest='Tree Gnome Village', npc='Commander Montai'))
A(s('attack', 1, 20, 'COMBAT', 'Cows near Lumbridge', 'Kill cows with your best weapon on the Attack style. Bones can be buried for Prayer.', 'Lumbridge', 'both', False, npc='Cow'))
A(s('attack', 20, 40, 'COMBAT', 'Al Kharid warriors', 'The warriors in the Al Kharid palace hit weakly and give steady XP. Bring food.', 'Al Kharid', 'both', False, npc='Al Kharid warrior'))
A(s('attack', 40, 60, 'COMBAT', 'Hill giants', 'Hill giants in the Edgeville Dungeon: good XP, and big bones for Prayer. Bring food and bank often.', 'Edgeville Dungeon', 'both', False, npc='Hill Giant'))
A(s('attack', 60, 99, 'COMBAT', 'Moss giants', 'Moss giants in the Varrock Sewers (free to play). Bring food.', 'Varrock', 'both', False, npc='Moss giant'))
A(s('attack', 45, 60, 'COMBAT', 'Gemstone Crab', 'Fight the Gemstone Crab in the Tlati Rainforest: very low effort, good XP from combat level 30 and up. It resets, so you can leave it running.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('attack', 30, 99, 'COMBAT', 'Gemstone Crab (AFK)', 'Stand by the Gemstone Crab and keep attacking: it is the low-effort option all the way up.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('attack', 60, 99, 'MINIGAME', 'Nightmare Zone', 'Fight bosses inside your own dream in the Nightmare Zone: a steady high-level members method.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Strength
A(s('strength', 1, 30, 'QUEST', 'Waterfall Quest (XP skip)', 'Do the quest: its reward is a large block of Strength XP (and the same for Attack).', 'wiki:Almera', 'fast', True, quest='Waterfall Quest', npc='Almera'))
A(s('strength', 30, 50, 'QUEST', 'Dragon Slayer I (XP skip)', 'The free-to-play finale quest: a large Strength and Defence reward. Follow the Dragon Slayer I steps of the route.', "Champions' Guild", 'fast', False, quest='Dragon Slayer I', npc='Guildmaster'))
A(s('strength', 1, 20, 'COMBAT', 'Cows near Lumbridge', 'Kill cows on the Strength style.', 'Lumbridge', 'both', False, npc='Cow'))
A(s('strength', 20, 40, 'COMBAT', 'Al Kharid warriors', 'The warriors in the Al Kharid palace on the Aggressive style. Bring food.', 'Al Kharid', 'both', False, npc='Al Kharid warrior'))
A(s('strength', 40, 60, 'COMBAT', 'Hill giants', 'Hill giants in the Edgeville Dungeon on the Aggressive style.', 'Edgeville Dungeon', 'both', False, npc='Hill Giant'))
A(s('strength', 60, 99, 'COMBAT', 'Moss giants', 'Moss giants in the Varrock Sewers (free to play).', 'Varrock', 'both', False, npc='Moss giant'))
A(s('strength', 50, 60, 'COMBAT', 'Gemstone Crab', 'Fight the Gemstone Crab in the Tlati Rainforest on the Strength style.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('strength', 30, 99, 'COMBAT', 'Gemstone Crab (AFK)', 'Stand by the Gemstone Crab and keep attacking: the low-effort option all the way up.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('strength', 60, 99, 'MINIGAME', 'Nightmare Zone', 'Fight bosses inside your own dream in the Nightmare Zone.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Defence
A(s('defence', 1, 30, 'COMBAT', 'Cows near Lumbridge (Defence style)', 'Kill cows on the Defence style. Slow, but the free way at the start.', 'Lumbridge', 'both', False, npc='Cow'))
A(s('defence', 30, 50, 'QUEST', 'Dragon Slayer I (XP skip)', 'The free-to-play finale quest: a large Defence and Strength reward. Follow the Dragon Slayer I steps of the route.', "Champions' Guild", 'fast', False, quest='Dragon Slayer I', npc='Guildmaster'))
A(s('defence', 30, 60, 'COMBAT', 'Hill giants', 'Hill giants in the Edgeville Dungeon on the Defence style.', 'Edgeville Dungeon', 'both', False, npc='Hill Giant'))
A(s('defence', 60, 99, 'COMBAT', 'Moss giants', 'Moss giants in the Varrock Sewers on the Defence style (free to play).', 'Varrock', 'both', False, npc='Moss giant'))
A(s('defence', 50, 60, 'COMBAT', 'Gemstone Crab', 'Fight the Gemstone Crab in the Tlati Rainforest on the Defence style.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('defence', 30, 99, 'COMBAT', 'Gemstone Crab (AFK)', 'Stand by the Gemstone Crab and keep attacking: the low-effort option all the way up.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('defence', 60, 99, 'MINIGAME', 'Nightmare Zone', 'Fight bosses inside your own dream in the Nightmare Zone.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Hitpoints (starts at 10)
A(s('hitpoints', 10, 36, 'QUEST', "Witch's House (XP skip)", "A free quest with a large Hitpoints reward. Bring food: the experiment fights back.", "wiki:Witch's House", 'fast', False, quest="Witch's House", npc='Boy'))
A(s('hitpoints', 10, 99, 'COMBAT', 'Hitpoints grow with combat', 'Hitpoints rise with every combat style you train. Follow the Attack, Strength, Defence and Ranged guides: there is no separate method.', 'Lumbridge', 'both', False, npc='Cow'))

# ---------------------------------------------------------------- Ranged
A(s('ranged', 1, 20, 'COMBAT', 'Cows with a shortbow', 'Shoot cows near Lumbridge with a shortbow and bronze arrows. Pick up the arrows after the fight.', 'Lumbridge', 'both', False, npc='Cow'))
A(s('ranged', 20, 40, 'COMBAT', 'Giant frogs', 'Giant frogs in the Lumbridge Swamp: easy targets. Pick up your arrows.', 'Lumbridge Swamp', 'both', False, npc='Giant frog'))
A(s('ranged', 40, 99, 'COMBAT', 'Flesh crawlers', 'Flesh crawlers in the Stronghold of Security (free to play). Bring arrows and food.', 'wiki:Flesh Crawler', 'both', False, npc='Flesh Crawler'))
A(s('ranged', 1, 99, 'COMBAT', 'Gemstone Crab', 'Shoot the Gemstone Crab in the Tlati Rainforest: a low-effort method that works from level 1 to 99.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('ranged', 1, 70, 'COMBAT', 'Gemstone Crab', 'Shoot the Gemstone Crab in the Tlati Rainforest: very low effort, and fast enough at these levels.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('ranged', 70, 99, 'MINIGAME', 'Nightmare Zone', 'Shoot bosses inside your own dream in the Nightmare Zone.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Prayer
A(s('prayer', 1, 9, 'QUEST', 'The Restless Ghost (XP skip)', 'A short free quest with a Prayer reward: your first levels without bones.', 'wiki:Father Aereck', 'both', False, quest='The Restless Ghost', npc='Father Aereck'))
A(s('prayer', 1, 99, 'GATHER', 'Offer bones at a gilded altar', 'The fastest way: offer bought bones on a gilded altar in your own house, with both incense burners lit. It costs money.', 'Rimmington', 'fast', True))
A(s('prayer', 1, 99, 'GATHER', 'Bury bones from combat', 'Bury every bone you get from combat: free, slow, and passive next to your combat training.', 'Lumbridge', 'afk', False))
A(s('prayer', 7, 99, 'MINIGAME', 'Camdozaal fish offerings', 'Offer raw fish on the altar in the Ruins of Camdozaal: a free way after Below Ice Mountain, and it trains Fishing and Cooking too.', 'wiki:Ruins of Camdozaal', 'afk', False, quest='Below Ice Mountain'))
A(s('prayer', 1, 99, 'GATHER', 'Bury bones bought on the Grand Exchange', 'Buy bones on the Grand Exchange and bury them: a simple free-to-play fallback.', 'Grand Exchange', 'fast', False))

# ---------------------------------------------------------------- Magic
A(s('magic', 1, 10, 'QUEST', "Witch's Potion (XP skip)", 'A very short free quest with a Magic reward. Both Magic quests together take you to level 10.', 'wiki:Hetty', 'both', False, quest="Witch's Potion", npc='Hetty'))
A(s('magic', 10, 15, 'QUEST', 'Imp Catcher (XP skip)', 'Another short free quest with a Magic reward.', 'wiki:Wizard Mizgog', 'both', False, quest='Imp Catcher', npc='Wizard Mizgog'))
A(s('magic', 7, 21, 'GATHER', 'Lvl-1 Enchant', 'Enchant sapphire or opal jewellery with the Lvl-1 Enchant spell: around 250 casts take you from level 7 to 21.', 'Grand Exchange', 'fast', True))
A(s('magic', 1, 21, 'COMBAT', 'Strike spells on cows', 'Cast the best Strike spell on cows near Lumbridge. Buy mind, air and fire runes (or use a staff).', 'Lumbridge', 'both', False, npc='Cow'))
A(s('magic', 21, 55, 'GATHER', 'Low Level Alchemy', 'Convert cheap items into coins with Low Level Alchemy: the spell can be cast while you do other things.', 'Grand Exchange', 'both', False))
A(s('magic', 55, 99, 'GATHER', 'High Level Alchemy', 'Alchemise items you buy on the Grand Exchange: very low effort, a small cost. Put the spell where you can click it fast.', 'Grand Exchange', 'both', False))

# ---------------------------------------------------------------- Runecraft (free to play up to the body altar)
A(s('runecraft', 1, 9, 'GATHER', 'Air runes', 'Mine rune essence with Aubury in Varrock, then craft it on the air altar.', 'wiki:Air altar', 'both', False, npc='Aubury', obj='Altar'))
A(s('runecraft', 9, 14, 'GATHER', 'Earth runes', 'Craft earth runes on the earth altar.', 'wiki:Earth altar', 'both', False, obj='Altar'))
A(s('runecraft', 14, 20, 'GATHER', 'Fire runes', 'Craft fire runes on the fire altar.', 'wiki:Fire altar', 'both', False, obj='Altar'))
A(s('runecraft', 20, 44, 'GATHER', 'Body runes', 'Body runes give the best XP per essence in the early game. Craft them on the body altar.', 'wiki:Body altar', 'both', False, obj='Altar'))
A(s('runecraft', 44, 99, 'GATHER', 'Nature runes', 'Craft nature runes: steady XP and money, mostly clicking the altar.', 'wiki:Nature altar', 'afk', True, obj='Altar'))
A(s('runecraft', 27, 99, 'MINIGAME', 'Guardians of the Rift', 'The strongest members Runecraft method: help the Great Guardian, mine fragments, craft guardian essence and spend points on runes. Needs Temple of the Eye and Runecraft 27.', 'wiki:Guardians of the Rift', 'fast', True, npc='Apprentice Cordelia', quest='Temple of the Eye'))
A(s('runecraft', 44, 99, 'MINIGAME', 'Guardians of the Rift', 'The same minigame is also the calm option: it needs Temple of the Eye and Runecraft 27.', 'wiki:Guardians of the Rift', 'afk', True, npc='Apprentice Cordelia', quest='Temple of the Eye'))

# ---------------------------------------------------------------- Slayer (members only)
A(s('slayer', 1, 20, 'COMBAT', 'Turael tasks', 'Take easy tasks from Turael in Burthorpe: the safe start. Bring food and what the task needs.', 'Burthorpe', 'both', True, npc='Turael'))
A(s('slayer', 20, 50, 'COMBAT', 'Vannaka tasks', 'Take tasks from Vannaka in the Edgeville Dungeon (Combat 40). Skip what you dislike with the task block and skip points.', 'Edgeville Dungeon', 'both', True, npc='Vannaka'))
A(s('slayer', 50, 99, 'COMBAT', 'Nieve tasks', 'Take tasks from Nieve in the Tree Gnome Stronghold (Combat 85) for better XP. Bring a Slayer helmet when you can.', 'Tree Gnome Stronghold', 'both', True, npc='Nieve'))
