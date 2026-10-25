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
A(s('attack', 20, 40, 'COMBAT', 'Giant frogs', 'Level 13 frogs in the Lumbridge Swamp: about 90 XP a kill, Big bones on every kill (sell or bury them), and they hit at most 2.', 'Lumbridge Swamp', 'both', False, npc='Giant frog'))
A(s('attack', 40, 60, 'COMBAT', 'Hill giants', 'Hill giants in the Edgeville Dungeon: good XP, and big bones for Prayer. Bring food and bank often.', 'Edgeville Dungeon', 'both', False, npc='Hill Giant'))
A(s('attack', 60, 99, 'COMBAT', 'Moss giants', 'Moss giants in the Varrock Sewers (free to play). Bring food.', 'Varrock', 'both', False, npc='Moss giant'))
A(s('attack', 45, 60, 'COMBAT', 'Gemstone Crab', 'Fight the Gemstone Crab in the Tlati Rainforest: very low effort, good XP from combat level 30 and up. It resets, so you can leave it running.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('attack', 30, 99, 'COMBAT', 'Gemstone Crab (AFK)', 'Stand by the Gemstone Crab and keep attacking: it is the low-effort option all the way up.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('attack', 60, 99, 'MINIGAME', 'Nightmare Zone', 'Fight bosses inside your own dream in the Nightmare Zone: a steady high-level members method.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Strength
A(s('strength', 1, 30, 'QUEST', 'Waterfall Quest (XP skip)', 'Do the quest: its reward is a large block of Strength XP (and the same for Attack).', 'wiki:Almera', 'fast', True, quest='Waterfall Quest', npc='Almera'))
A(s('strength', 30, 50, 'QUEST', 'Dragon Slayer I (XP skip)', 'The free-to-play finale quest: a large Strength and Defence reward. Follow the Dragon Slayer I steps of the route.', "Champions' Guild", 'fast', False, quest='Dragon Slayer I', npc='Guildmaster'))
A(s('strength', 1, 20, 'COMBAT', 'Cows near Lumbridge', 'Kill cows on the Strength style.', 'Lumbridge', 'both', False, npc='Cow'))
A(s('strength', 20, 40, 'COMBAT', 'Giant frogs', 'Level 13 frogs in the Lumbridge Swamp: about 90 XP a kill, Big bones on every kill (sell or bury them), and they hit at most 2.', 'Lumbridge Swamp', 'both', False, npc='Giant frog'))
A(s('strength', 40, 60, 'COMBAT', 'Hill giants', 'Hill giants in the Edgeville Dungeon on the Aggressive style.', 'Edgeville Dungeon', 'both', False, npc='Hill Giant'))
A(s('strength', 60, 99, 'COMBAT', 'Moss giants', 'Moss giants in the Varrock Sewers (free to play).', 'Varrock', 'both', False, npc='Moss giant'))
A(s('strength', 50, 60, 'COMBAT', 'Gemstone Crab', 'Fight the Gemstone Crab in the Tlati Rainforest on the Strength style.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('strength', 30, 99, 'COMBAT', 'Gemstone Crab (AFK)', 'Stand by the Gemstone Crab and keep attacking: the low-effort option all the way up.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('strength', 60, 99, 'MINIGAME', 'Nightmare Zone', 'Fight bosses inside your own dream in the Nightmare Zone.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Defence
A(s('defence', 1, 20, 'COMBAT', 'Cows near Lumbridge (Defence style)', 'Kill cows on the Defence style: they hit weakly, and the hides sell.', 'Lumbridge', 'both', False, npc='Cow'))
A(s('defence', 30, 50, 'QUEST', 'Dragon Slayer I (XP skip)', 'The free-to-play finale quest: a large Defence and Strength reward. Follow the Dragon Slayer I steps of the route.', "Champions' Guild", 'fast', False, quest='Dragon Slayer I', npc='Guildmaster'))
A(s('defence', 20, 40, 'COMBAT', 'Giant frogs', 'Level 13 frogs in the Lumbridge Swamp: about 90 XP a kill, Big bones on every kill (sell or bury them), and they hit at most 2.', 'Lumbridge Swamp', 'both', False, npc='Giant frog'))
A(s('defence', 60, 99, 'COMBAT', 'Moss giants', 'Moss giants in the Varrock Sewers on the Defence style (free to play).', 'Varrock', 'both', False, npc='Moss giant'))
A(s('defence', 50, 60, 'COMBAT', 'Gemstone Crab', 'Fight the Gemstone Crab in the Tlati Rainforest on the Defence style.', 'wiki:Gemstone Crab', 'fast', True, npc='Gemstone Crab'))
A(s('defence', 30, 99, 'COMBAT', 'Gemstone Crab (AFK)', 'Stand by the Gemstone Crab and keep attacking: the low-effort option all the way up.', 'wiki:Gemstone Crab', 'afk', True, npc='Gemstone Crab'))
A(s('defence', 60, 99, 'MINIGAME', 'Nightmare Zone', 'Fight bosses inside your own dream in the Nightmare Zone.', 'wiki:Nightmare Zone', 'fast', True, npc='Dominic Onion'))

# ---------------------------------------------------------------- Hitpoints (starts at 10)
A(s('hitpoints', 10, 36, 'QUEST', "Witch's House (XP skip)", "A free quest with a large Hitpoints reward. Bring food: the experiment fights back.", "wiki:Witch's House", 'fast', False, quest="Witch's House", npc='Boy'))
A(s('hitpoints', 10, 99, 'COMBAT', 'Hitpoints grow with combat', 'Hitpoints rise with every combat style you train. Follow the Attack, Strength, Defence and Ranged guides: there is no separate method.', 'Lumbridge', 'both', False, npc='Cow'))

# ---------------------------------------------------------------- Ranged
A(s('ranged', 1, 20, 'COMBAT', 'Seagulls at Port Sarim', 'Shoot the level 3 seagulls on the Port Sarim docks: they never hit back, so no food is needed. Pick up your arrows.', 'Port Sarim', 'both', False, npc='Seagull'))
A(s('ranged', 20, 57, 'COMBAT', 'Giant frogs', 'Giant frogs in the Lumbridge Swamp: the fastest free XP to the high 50s, and Big bones on every kill. Pick up your arrows.', 'Lumbridge Swamp', 'both', False, npc='Giant frog'))
A(s('ranged', 57, 99, 'COMBAT', 'Moss giants from a safespot', 'Shoot moss giants from a safespot on the south side of Crandor or at the far end of the Varrock Sewers: the best free XP after Brutus. Bring adamant arrows.', 'Crandor', 'both', False, npc='Moss giant'))
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
A(s('magic', 7, 27, 'GATHER', 'Enchant sapphire amulets', 'Cast Lvl-1 Enchant on sapphire amulets by a bank: a cosmic rune and a Staff of water each cast, and the Amulets of magic usually sell for a little more.', 'Grand Exchange', 'fast', False))
A(s('magic', 1, 21, 'COMBAT', 'Strike spells on cows', 'Cast the best Strike spell on cows near Lumbridge. Buy mind, air and fire runes (or use a staff).', 'Lumbridge', 'both', False, npc='Cow'))
A(s('magic', 21, 55, 'GATHER', 'Low Level Alchemy', 'Convert cheap items into coins with Low Level Alchemy: the spell can be cast while you do other things.', 'Grand Exchange', 'both', False))
A(s('magic', 55, 99, 'GATHER', 'High Level Alchemy', 'Alchemise items you buy on the Grand Exchange: very low effort, a small cost. Put the spell where you can click it fast.', 'Grand Exchange', 'both', False))

# ---------------------------------------------------------------- Runecraft (free to play up to the body altar)
A(s('runecraft', 1, 9, 'GATHER', 'Air runes', 'Mine rune essence with Aubury in Varrock, then craft it on the air altar.', 'wiki:Air altar', 'both', False, npc='Aubury', obj='Altar'))
A(s('runecraft', 9, 14, 'GATHER', 'Earth runes', 'Craft earth runes on the earth altar.', 'wiki:Earth altar', 'both', False, obj='Altar'))
A(s('runecraft', 14, 20, 'GATHER', 'Fire runes', 'Craft fire runes on the fire altar.', 'wiki:Fire altar', 'both', False, obj='Altar'))
A(s('runecraft', 20, 99, 'GATHER', 'Body runes', 'Body runes give the best free XP per essence and the only profit at high levels. Craft them on the body altar; Falador Teleport back to the bank.', 'wiki:Body altar', 'both', False, obj='Altar'))
A(s('runecraft', 44, 99, 'GATHER', 'Nature runes', 'Craft nature runes: steady XP and money, mostly clicking the altar.', 'wiki:Nature altar', 'afk', True, obj='Altar'))
A(s('runecraft', 27, 99, 'MINIGAME', 'Guardians of the Rift', 'The strongest members Runecraft method: help the Great Guardian, mine fragments, craft guardian essence and spend points on runes. Needs Temple of the Eye and Runecraft 27.', 'wiki:Guardians of the Rift', 'fast', True, npc='Apprentice Cordelia', quest='Temple of the Eye'))
A(s('runecraft', 44, 99, 'MINIGAME', 'Guardians of the Rift', 'The same minigame is also the calm option: it needs Temple of the Eye and Runecraft 27.', 'wiki:Guardians of the Rift', 'afk', True, npc='Apprentice Cordelia', quest='Temple of the Eye'))

# ---------------------------------------------------------------- Slayer (members only)
A(s('slayer', 1, 20, 'COMBAT', 'Turael tasks', 'Take easy tasks from Turael in Burthorpe: the safe start. Bring food and what the task needs.', 'Burthorpe', 'both', True, npc='Turael'))
A(s('slayer', 20, 50, 'COMBAT', 'Vannaka tasks', 'Take tasks from Vannaka in the Edgeville Dungeon (Combat 40). Skip what you dislike with the task block and skip points.', 'Edgeville Dungeon', 'both', True, npc='Vannaka'))
A(s('slayer', 50, 99, 'COMBAT', 'Nieve tasks', 'Take tasks from Nieve in the Tree Gnome Stronghold (Combat 85) for better XP. Bring a Slayer helmet when you can.', 'Tree Gnome Stronghold', 'both', True, npc='Nieve'))

# ---------------------------------------------------------------- Other options ('alt': never on a path, listed under the step they overlap)
# From the OSRS Wiki free-to-play guides (melee, ranged, magic, prayer, runecraft training). Appended last so the ids of the path steps stay.
MELEE_ALTS = [(1, 20, 'Monks of Edgeville', 'Level 5 monks: talk to a non-combat monk and he heals you for free, so no food is needed. Bones only.', 'Edgeville Monastery', 'Monk'), (1, 20, 'Giant rats', 'Lumbridge Swamp rats: every kill drops raw rat meat to cook for food.', 'Lumbridge Swamp', 'Giant rat'), (10, 20, 'Minotaurs', 'On the first floor of the Stronghold of Security (Defence 15+): iron arrows, essence and ore drops.', 'Barbarian Village', 'Minotaur'), (20, 40, 'Brutus', 'After The Ides of Milk: double combat XP in his own pen by the Lumbridge cows, bull bones every kill. His charges hurt at low levels.', 'Lumbridge', 'Brutus'), (20, 40, 'Barbarians', 'Barbarian Village: runes, arrows and gems, cooked meat in the long hall, close to the Grand Exchange.', 'Barbarian Village', 'Barbarian'), (20, 30, 'Al Kharid warriors', 'The palace warriors: a bank next door and 1-coin kebabs, but the whole room joins in when you attack one.', 'Al Kharid', 'Al Kharid warrior'), (30, 50, 'Hobgoblins', 'Edgeville Dungeon or west of the Crafting Guild: when the hill giants are crowded. Limpwurt roots.', 'Edgeville Dungeon', 'Hobgoblin'), (40, 60, 'Flesh Crawlers', 'The second floor of the Stronghold of Security: always aggressive, so they can be left running. No bones or money.', 'Barbarian Village', 'Flesh Crawler'), (50, 70, 'Ice giants', 'The Asgarnian Ice Dungeon: big bones and adamant arrows, a long walk from a bank.', 'Asgarnian Ice Dungeon', 'Ice giant'), (50, 99, 'Body golems', 'The Ruins of Camdozaal after Below Ice Mountain: close to a bank; a Barronite mace hits them hardest.', 'wiki:Ruins of Camdozaal', 'Body golem'), (60, 99, 'Giant spiders', 'The third floor of the Stronghold of Security: the AFK way to 99, nothing to pick up.', 'Barbarian Village', 'Giant spider'), (80, 99, 'Ogresses', 'The Corsair Cove dungeon: the best free drops (rune helms), but they need Protect from Magic and Protect from Melee.', 'Corsair Cove', 'Ogress Warrior')]
for _sk in ('attack', 'strength', 'defence'):
    for _lo, _hi, _title, _text, _place, _npc in MELEE_ALTS:
        A(s(_sk, _lo, _hi, 'COMBAT', _title, _text, _place, 'alt', False, npc=_npc))
A(s('defence', 40, 60, 'COMBAT', 'Hill giants', 'Hill giants in the Edgeville Dungeon on the Defence style: big bones and limpwurt roots.', 'Edgeville Dungeon', 'both', False, npc='Hill Giant'))
A(s('ranged', 1, 20, 'COMBAT', 'Cows across the fence', 'Shoot the Lumbridge cows from behind the fence: safe, and the hides sell.', 'Lumbridge', 'alt', False, npc='Cow'))
A(s('ranged', 20, 26, 'COMBAT', 'Monks or barbarians', 'The Edgeville monks heal you for free; the level 10 barbarians are faster from the safespot by the rocks and the torch.', 'Edgeville Monastery', 'alt', False, npc='Monk'))
A(s('ranged', 9, 69, 'COMBAT', "Wizards at the Wizards' Tower", 'The level 9 wizards stand still, so your arrows land in one spot, and they drop runes.', "Wizards' Tower", 'alt', False, npc='Wizard'))
A(s('ranged', 15, 99, 'COMBAT', 'Brutus', 'After The Ides of Milk: the best free XP thanks to the double multiplier, but many clicks. Bring a stock of arrows.', 'Lumbridge', 'alt', False, npc='Brutus'))
A(s('ranged', 40, 57, 'COMBAT', 'Flesh Crawlers', 'The Stronghold of Security: about the XP of giant frogs and they can be left running. Defence 40+ helps.', 'Barbarian Village', 'alt', False, npc='Flesh Crawler'))
A(s('ranged', 57, 99, 'COMBAT', 'Hill giants', 'Edgeville Dungeon from a safespot: slower than moss giants, good drops and giant keys.', 'Edgeville Dungeon', 'alt', False, npc='Hill Giant'))
A(s('ranged', 65, 99, 'COMBAT', 'Lesser demons', 'The Karamja volcano or Crandor from a safespot: AFK after the first ten minutes, vile ashes.', 'Crandor', 'alt', False, npc='Lesser demon'))
A(s('ranged', 60, 99, 'COMBAT', 'Ogress shamans', 'The Corsair Cove dungeon: the best drops and XP from 70; safespot them with a shortbow.', 'Corsair Cove', 'alt', False, npc='Ogress Shaman'))
A(s('magic', 27, 49, 'GATHER', 'Enchant emerald amulets', 'Cast Lvl-2 Enchant on emerald amulets by a bank: a cosmic rune and a Staff of air each cast.', 'Grand Exchange', 'fast', False))
A(s('magic', 49, 57, 'GATHER', 'Enchant ruby amulets', 'Cast Lvl-3 Enchant on ruby amulets by a bank: a cosmic rune and a Staff of fire each cast.', 'Grand Exchange', 'fast', False))
A(s('magic', 19, 59, 'COMBAT', 'Splash Curse', 'Cast Curse on a weak monster while wearing armour that blocks your magic: about 34 thousand XP an hour, almost AFK.', 'Varrock', 'alt', False))
A(s('magic', 25, 43, 'GATHER', 'Teleports', 'Varrock (25), Lumbridge (31) and Falador (37) Teleport: fast, about 3 coins an XP, and they double as travel.', 'Varrock', 'alt', False))
A(s('magic', 43, 99, 'GATHER', 'Superheat Item', 'Superheat iron ore with a Staff of fire: it never fails on iron and trains Smithing too.', 'Grand Exchange', 'alt', False))
A(s('magic', 33, 99, 'GATHER', 'Telekinetic Grab', 'Grab the Wine of Zamorak in the Asgarnian Chaos Temple (it hurts; the monks attack), or nature runes in the Wilderness (dangerous).', 'wiki:Chaos Temple (Asgarnia)', 'alt', False))
A(s('magic', 59, 99, 'COMBAT', 'Fire Blast on ice giants', 'From a safespot in the Asgarnian Ice Dungeon; cast High Level Alchemy between the casts.', 'Asgarnian Ice Dungeon', 'alt', False, npc='Ice giant'))
A(s('prayer', 20, 99, 'COMBAT', 'Big bones from giant frogs', 'Giant frogs in the Lumbridge Swamp are the fastest Big bones to kill (15 XP each), and you train combat too.', 'Lumbridge Swamp', 'alt', False, npc='Giant frog'))
A(s('prayer', 30, 99, 'COMBAT', 'Bull bones from Brutus', 'After The Ides of Milk: 40 XP a kill (bury only).', 'Lumbridge', 'alt', False, npc='Brutus'))
A(s('prayer', 40, 99, 'COMBAT', 'Vile ashes from lesser demons', 'Scatter vile ashes for 25 XP each: Karamja volcano or Crandor.', 'Crandor', 'alt', False, npc='Lesser demon'))
A(s('prayer', 1, 99, 'GATHER', 'Bones left on the ground', 'Other players leave plenty of bones at the cows, chickens and the Lumbridge Swamp.', 'Lumbridge', 'alt', False))
A(s('runecraft', 20, 99, 'GATHER', 'Tiaras', 'Earth, water or body tiaras from a plain tiara and a talisman: 25 to 47 thousand XP an hour, but every tiara loses money.', 'wiki:Body altar', 'alt', False, obj='Altar'))
