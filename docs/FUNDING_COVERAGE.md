# Funding coverage

Generated from `src/data/fundingCoverage.json` (2026-10-18) against https://oldschool.runescape.wiki/w/Money_making_guide/Free-to-play. Do not edit by hand: change the data and run `npm run funding-coverage`.

91 guides were read. **12 are planned by the engine**, 79 are not, each for a stated reason.

## Planned methods

| Method | Guide | Pace basis | Units an hour (published, typical) | Attention |
|---|---|---|---|---|
| Kill Hill Giants | [Money making guide/Killing hill giants](https://oldschool.runescape.wiki/w/Money_making_guide/Killing_hill_giants) (rev 14931407) | combat-model | 90 | moderate |
| Kill cows for cowhide | [Money making guide/Killing cows and tanning cowhide](https://oldschool.runescape.wiki/w/Money_making_guide/Killing_cows_and_tanning_cowhide) (rev 15235891) | combat-model | 260 | low |
| Mine iron ore | [Money making guide/Mining iron ore (free-to-play)](https://oldschool.runescape.wiki/w/Money_making_guide/Mining_iron_ore_(free-to-play)) (rev 14444202) | wiki-guide | 448 | low |
| Mine coal | [Money making guide/Mining coal (free-to-play)](https://oldschool.runescape.wiki/w/Money_making_guide/Mining_coal_(free-to-play)) (rev 14997913) | wiki-guide | 184 | low |
| Chop oak logs | [Money making guide/Cutting oak logs](https://oldschool.runescape.wiki/w/Money_making_guide/Cutting_oak_logs) (rev 14917558) | wiki-guide | 640 | low |
| Chop yew logs | [Money making guide/Cutting yew logs (free-to-play)](https://oldschool.runescape.wiki/w/Money_making_guide/Cutting_yew_logs_(free-to-play)) (rev 14925409) | wiki-guide | 120 | low |
| Catch lobsters at Musa Point | [Money making guide/Catching lobsters](https://oldschool.runescape.wiki/w/Money_making_guide/Catching_lobsters) (rev 14355587) | wiki-guide | 178 | low |
| Collect dropped iron ore | [Money making guide/Collecting iron ore](https://oldschool.runescape.wiki/w/Money_making_guide/Collecting_iron_ore) (rev 14719651) | wiki-guide | 400 | moderate |
| Buy anti-dragon shields from Oziach | [Money making guide/Collecting anti-dragon shields (free-to-play)](https://oldschool.runescape.wiki/w/Money_making_guide/Collecting_anti-dragon_shields_(free-to-play)) (rev 14286022) | wiki-guide | 2,720 | high |
| Smelt steel bars | [Money making guide/Smelting steel bars](https://oldschool.runescape.wiki/w/Money_making_guide/Smelting_steel_bars) (rev 15094948) | wiki-guide | 620 | high |
| Make pie shells | [Money making guide/Making pie shells](https://oldschool.runescape.wiki/w/Money_making_guide/Making_pie_shells) (rev 14221361) | wiki-guide | 1,960 | high |
| Buy feather packs | [Money making guide/Buying feather packs](https://oldschool.runescape.wiki/w/Money_making_guide/Buying_feather_packs) (rev 14368997) | wiki-guide | 2,070 | high |

A method is offered only when the account can do it now (levels, quests, membership, tool, sale restrictions), its first batch is affordable, and its product can be sold. Income counted is dependable income only (a drop chance of 1/16 or better); rare drops are upside and never a plan.

## Not planned, and why

- **Needs a large bankroll for a thin margin; the engine can model it, but it is not curated yet** (27): smelting-runite-bars-superheat-item, smelting-adamantite-bars-superheat-item, smithing-rune-items, high-alching-profitable-free-to-play-items, stringing-amulets, crafting-diamond-jewellery, smelting-runite-bars, crafting-ruby-jewellery, grinding-chocolate-bars, crafting-emerald-jewellery, crafting-sapphire-jewellery, making-pastry-dough, cooking-plain-pizzas, crafting-gold-jewellery, making-uncooked-apple-pies, making-dyes, making-uncooked-berry-pies, making-anchovy-pizzas, making-pizza-bases, mining-coal-and-superheating-runite-bars, making-chocolate-cake, mining-coal-and-superheating-adamantite-bars, smelting-silver-bars, mining-coal-and-superheating-mithril-bars, mining-iron-and-superheating-iron-bars, making-uncooked-meat-pies, filling-water-containers
- **Wilderness: not offered as a default plan** (11): mining-runite-ore-free-to-play, collecting-steel-platebodies-high-alchemy, collecting-steel-platebodies, buying-team-capes, collecting-nature-runes, collecting-cosmic-runes, collecting-chaos-runes, collecting-wine-of-zamorak-free-to-play, killing-chaos-dwarves, collecting-big-bones-from-the-bone-yard, mining-clay
- **World spawn: respawn timers and other players are not modelled** (7): collecting-ruby-rings, collecting-tinderboxes, collecting-fish-food, firecycling, collecting-spades, collecting-beer-glasses, collecting-garlic
- **Needs quest state or an area the catalogue does not check yet** (7): collecting-bronze-pickaxes, making-dough-at-cooks-guild, stealing-wydin-s-bananas, making-flour, catching-tuna-swordfish-free-to-play, taking-from-the-infinite-money-bag-while-picking-up-coin-spawns-in-varrock-west-bank, catching-lobsters-free-to-play
- **High-level combat or a boss: the combat model is not asked for it** (6): killing-ogress-shamans, killing-ogress-warriors, killing-bryophyta-free-to-play, killing-elemental-wizards, killing-ankou-free-to-play, killing-zamorak-monks
- **Skill training first, money second: belongs to the Skills plan** (4): casting-bones-to-bananas, collecting-monk-s-robes, blessing-unblessed-symbols, collecting-ashes
- **Shop run: same model as the supported shop methods, not curated yet** (3): buying-jug-packs, buying-ale-from-the-rising-sun-inn, buying-kebabs-in-al-kharid
- **The place is not precise enough to guide an arrow** (3): killing-monkeys, killing-wizards, killing-bears
- **Player-to-player trading or a market gamble** (2): smithing-rune-items-player-to-player-trading, selling-archery-supplies
- **Tanning is not modelled; raw hides are supported by cows-cowhide** (2): tanning-cowhide, collecting-and-tanning-cowhide
- **Needs a cooking success model that is not built** (2): catching-sardines-herring, cooking-raw-chicken
- **Iron bars smelt with a 50% failure without a ring of forging: the failure model is not built** (1): smelting-iron-bars
- **Level 70 mining: not curated for a low-level default** (1): mining-adamantite-ore-free-to-play
- **Drop trick: depends on a quest stage the route moves past** (1): collecting-air-talismans
- **Needs Telekinetic Grab timing that cannot be guided** (1): collecting-red-spiders-eggs-free-to-play
- **Income is mostly rare drops: shown as upside only, never as a plan** (1): killing-imps

## Other ways the engine can close a shortage

- **sell-surplus** (supported): Built from the bag: only items the cleanup advice marks as surplus, never protected ones.
- **self-gather** (supported): A gathering method used to fill a shortage from the shopping list; it saves coins, it does not earn them.
- **quest-rewards** (unsupported): one-time
