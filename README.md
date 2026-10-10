<h1 align="center">OSRS Path</h1>

<p align="center">
  <b>A guided Old School RuneScape account route for your desktop, with a RuneLite plugin that shows you what to do, where to go and what to bring — right in the game.</b>
</p>

<p align="center">
  <a href="https://github.com/bexaf3163/OSRS/releases/latest">Download for Windows</a> ·
  <a href="PROJECT_MAP.md">Project map</a> ·
  <a href="#runelite-bridge">RuneLite bridge</a> ·
  <a href="#version-history-summary">Version history</a>
</p>

---

## What it is

OSRS Path walks a fresh account from the first minute to a solid mid-game character as **69 checked steps in 9 stages** — 54 free-to-play steps
and 15 members steps — with the money for every purchase planned along the way. Everything was cross-checked against the OSRS Wiki, the Grand Exchange
and the Quest Helper sources. It is one portable Windows program plus the **OSRS Path Bridge** plugin for RuneLite; the two talk to each other on your own PC,
so there is no server, no account and nothing to sign up for.

## What it does

| | |
|---|---|
| **A route you can trust** | 69 steps with requirements, rewards, floors, prices and short walkthroughs. 20 skills with training plans (12 free, 8 members), goals by stage, quests, a reference and a built-in OSRS Wiki inspector for 203 items. |
| **Readiness before every step** | A traffic light for levels, quests, items and coins, with one-click fixes: train a skill, go to the bank, add to the shopping list, make up the money. What the program does not know is shown as "not checked", never as "no". |
| **The game shows you the way** | The plugin puts the step in the game: a big arrow that turns with the camera, highlights for NPCs, objects, tiles, dialogue options and items, and a clickable "What you need" list that follows the quest stage like Quest Helper does. |
| **It tracks you** | 62 of the 69 steps close by themselves when the quest is counted, the level is reached or the items are in hand. "Sync with the account" restores a lost progress from what the game knows. |
| **Gear, food and pace** | What to wear and buy to hit faster, food for every fight, health in the HUD, XP per hour and the time to the goal, run energy and weight advice. |
| **Shopping and money** | A bulk Grand Exchange list without double counting, a budget at live prices, "I already have it", earning methods from the wiki and a resource journal that survives between sessions. |
| **Maps and travel** | The OSRS Wiki world map in every step with a place, and "Where am I? How to get there": on foot, teleports, canoes and boats compared for your levels and runes. |
| **Safe by design** | Your progress is stored twice and copied every hour outside the program folder; a fresh install restores itself. Profiles per character. Auto-update from GitHub with a checksum. |

## Principles

- **A companion, not a bot.** It shows, counts and guides. It never clicks for you, never buys or sells, and never moves items — offers, the bank and dialogues stay yours.
- **Honest about what it does not know.** An unavailable value is "unknown", not zero; the program says what was not checked in the live game.
- **Local and private.** No server and no accounts. The plugin answers only the program, on `127.0.0.1`.
- **One build.** A portable Windows exe, no installer, no web or phone version — fewer places for something to break.

## Quick start

1. Download **`OSRS-Put-<version>-portable.exe`** from [Releases](https://github.com/bexaf3163/OSRS/releases/latest) and run it. (The exe is not signed: SmartScreen may ask — "More info" → "Run anyway".)
2. Open RuneLite from the program (Settings → RuneLite) so it starts with the plugin, then log in. The header indicator turns green.
3. Pick your mode (F2P / Members), open the "Path" screen and follow the current step. If you already have progress in the game, press "Sync with the account".

## Desktop app

The ready file is on the [Releases](https://github.com/bexaf3163/OSRS/releases/latest) page:
**`OSRS-Put-<version>-portable.exe`**, no installation. The data lies **next to the exe**, in the `OSRS-Put-data` folder:
the program can be carried on a flash drive together with the progress. A new version is just a new exe next to the old one:
the progress is in the same folder. If an installed version was used earlier (its data is in
`%APPDATA%\OSRS Path`), the portable one takes its progress on the first launch by itself.

The progress is stored twice: inside the program and as the `progress.json` file in the data folder —
the file saves you if the internal storage disappears. Where the folder is, you can see in "Settings".

The exe is not signed with a certificate, so on the first launch Windows SmartScreen may show
"Windows protected your PC" → "More info" → "Run anyway".

**Appearance** (the gear → "Appearance"):

- **Interface scale** — 80–200 %. Keys: Ctrl + "+" / "−", Ctrl + 0 resets, Ctrl + the mouse wheel.
- **Adapt to the window size** — stretch the window wider than 1280 points and everything becomes larger
  (up to 1.5×), narrow it and it becomes smaller (down to 0.9×). A narrow window gets a compact one-column layout.
- **Font size** — separate from the scale: the text only.
- **Always on top** — handy to keep next to the game.

Everything is remembered between launches. Wiki links open in an ordinary browser. The menu is hidden —
it is shown with Alt; reload — Ctrl+R.

## The "Path" screen

On a wide window (from 1080 points) there are three columns: on the left the ribbon of stages with steps, in the centre the chosen step,
on the right the pinned OSRS Wiki dossier (from 1260 points; narrower — it slides over). "Mark as done"
opens the next unclosed step at once. The header has the progress ring and the quest points.
On a narrow window the stages go as a list, the steps expand in place.

In a step card:

- **a map preview** — the start or gathering place with a marker, a floor and a caption; a click opens the world map;
- **points** `📍 Point 1 … 📍 Point 2` — for fishing, ore and X Marks the Spot treasures; the preview, the caption
  and the world map switch together;
- **"🗺️ World map"** — a full-screen map: the markers of all the step's points, a floor switch, zoom
  with the wheel, closed with ✕, a click on the background or Escape;
- **"Required items and food"** — food shows how much it heals (`+3 HP`), every item shows
  where to get it;
- **"🧭 Show in the game"** — if the link with RuneLite is on (below), and under it **"🧳 Departure check"**;
- **"⚡ Quick option for your stats"** — a teleport, a canoe, the Chronicle book, if the level or the item allows.

The **🛒** button in the header (on a narrow window — a link in the "What to do now" card) opens the Grand Exchange bulk list.

In **Zen** mode the card shows the step, its single status ("🟢 Ready to set off" or "🟡 Preparation required (3 items) · Fix · More"), "Done" and only the critical warnings;
in **Inspector** mode every block is expanded (the toggle is in the header and in Settings).

## The map

The map is the OSRS Wiki tiles (`maps.runescape.wiki`, © Weird Gloop, the game © Jagex) in Leaflet.
The wiki map page itself cannot be embedded: `oldschool.runescape.wiki` forbids display in foreign windows
(`X-Frame-Options: DENY`, `frame-ancestors 'none'`), so the map is drawn here from the same tiles.
The render version is `MAP_VERSION` in `src/lib/map.ts`; `npm run check-links` says when the wiki moves to a new one.

Without the internet the preview shows the tile coordinates instead of a picture, and the world map shows a message
and the place as text: there is no empty window. Leaflet itself is in the build and is loaded only when the world map is opened.

## F2P and Members modes

The `🛡️ F2P | 👑 Members` switch in the header. In Members mode stages 7–9 appear,
the members skills with training plans on the "Skills" tab, the members quests and hints for members in the F2P steps.
The members quests go in the order of their requirements: Agility 25 before The Grand Tree, Nature Spirit and Lost City before
Fairytale I, the skills for Animal Magnetism and Lost City — as a separate step.
Marks are not lost when switching.

## RuneLite bridge

The **OSRS Path Bridge** plugin for RuneLite is in the `runelite-bridge/` folder (Java 17, Gradle, RuneLite 1.12.39).
It listens only on `127.0.0.1:38282` — an address inside the computer, unreachable from outside; there is no remote server.

What it does when you press "🧭 Show in the game" in the app:

- the game's **arrow** to the step's place (`Client.setHintArrow`) and the **big arrow** at the top of the screen: it turns
  with the camera like the minimap, writes the distance large, and near the target becomes "✓ Nearby"; the size is
  in the plugin settings, the place is by dragging with Alt;
- the **"What you need" list** on the game screen: the step's items with a status and "where to get it", the quest NPCs and places — a click
  on a row leads the arrow and the route there; the **"OSRS Path" panel** on the RuneLite side bar — the same in more detail;
- a **marker on the game's world map**: where the arrow leads, far away — at the edge of the map;
- an **outline and a caption** over the step's NPCs and objects (a cooking range, a coffin, an altar…) — `ModelOutlineRenderer`;
- **tiles** — "Dig here", fishing spots and so on;
- a **dialogue** — a frame and an arrow at the needed option (the `InterfaceID.Chatmenu.OPTIONS` menu);
- the step's **items** in the inventory and the bank — a pulsing frame along the cell edge (`WidgetItemOverlay`);
- the **auto-mark**: the step is done in the game — the plugin sends an event, the app marks the step, opens the next one
  and shows it in the game at once. A short interface sound and a line in the game chat.

The auto-mark (the `inGame.completionTrigger` field) exists for 62 steps of 69 — everywhere the condition is checked
by the game state and not by a guess:

| Condition | Steps | How the plugin checks |
|---|---|---|
| `QUEST_COMPLETED` — the quest is counted | 34 | `Quest.getState` = FINISHED; the name is exactly the one from `net.runelite.api.Quest` |
| `SKILL_LEVEL` — all the levels from the step title | 16 | the real level from `StatChanged` (without temporary boosts) |
| `ITEM_OWNED` — things in hand | 12 | the bag, banknotes, worn and the bank together (`ItemCounts`); the bank is known once it has been opened |

Items (`items`) can be added to a quest and a level: "Agility 40 and two Graceful pieces" — so for 18 steps.
An item is counted by ID if it is given, otherwise by names. The check runs when something changed and once
every 10 ticks, without polling every frame. There are no chat-message and varbit conditions in the route: varbit numbers are not added
without being checked in the game. 6 steps are left without an auto-mark because they have no reliable sign in the game
(settings, earning, looking around a place, the Fairytale II intro) — you mark them yourself.

### Quest stages and the Quest Helper machines

For the 32 route quests the in-game list knows the quest stage (by the quest variable, as in Quest Helper): it shows only the current stage, its lines in order
(a move by place and a "step done" button), the stage's items, and leads the arrow to the current line. A quest is handed in — "Quest complete" and the departure check list is cleared.
The quest routes are taken from Quest Helper (full assistance), so there are no skipped steps.

Since 2.27 the line is chosen by the same logic as Quest Helper's: chat and dialogue messages, the quest journal, game variables, items and place
(`src/data/questMachines.json`, a plugin resource generated by `tools/qh-machines`). The machine's choice is evidence: when it exists it sets the cursor;
with no evidence the earlier logic (place and items) decides; a condition the plugin cannot check counts as "unknown", not "no". The "Steps like Quest Helper" setting
turns the machine off. The license of Quest Helper is in `THIRD_PARTY_NOTICES.md`.

## The in-game helper

Five parts that complement the bridge and do not replace it. Each one is turned off in the plugin settings
(RuneLite → OSRS Path Bridge → "In-game helper"), and none gets in the way if RuneLite is not running.

| | Where | Is RuneLite needed? |
|---|---|---|
| **Micro HUD** — `[S1-06] The Restless Ghost`, the current goal, `~142 tiles ↗` or `✓ Nearby` | in the game, top left | yes |
| **Departure check** — `✓ Rope 1/1`, `✗ Cooked chicken 2/5 · +3 HP`, `Ready to depart` | in the game at the bank and in the step card | yes |
| **Quick options** — `⚡ Varrock Teleport · you have Magic 25 (from the game)` | in the step card | no: without RuneLite — by the levels entered in "Skills" |
| **GE bulk list** — the total by stages, the budget, copying | the 🛒 page | no; with RuneLite — also "how many you already have" and a hint at the exchange |
| **Route on the ground** — Shortest Path; without it — the arrow and the HUD by stops | in the game | yes |

**Micro HUD** (`OsrsPathHudOverlay`, `OverlayPanel`, the `UNDER_WIDGETS` layer, top left). It is dragged
with Alt held, the transparency and the large text are in the settings. The distance is a straight line between coordinates,
not the number of steps along the road; the arrow is the compass direction from you to the target. "✓ Nearby" is closer than 5 tiles (and holds
up to 7, so as not to blink). Another floor and a dungeon are written in words. The lines are recomputed once per game tick,
only if you moved.

**Departure check.** The app sends the plugin the step's mandatory items, except those obtained
during the step itself (`inStep` in the route: an amulet from an NPC, beer at the bartender). The plugin counts the bag and the worn items
by `ItemContainerChanged` events (banknotes do not count — they cannot be eaten), and the bank — when you open it.
States: `IN_BAG_READY`, `MISSING_FROM_BAG` (it is in the bank — the cell is highlighted green), `NOT_FOUND_IN_BANK`;
everything in hand — "Ready to depart". The plugin does not move items. The same thing is the "🧳 Departure check"
in the step card, updated by itself.

**Quick options** — the `branches` field of a step: a condition (`SKILL_LEVEL`, `QUEST_COMPLETED`, `ITEM_OWNED`),
a text and a point to lead to. The plugin sends the levels on change (`StatChanged`, the `STATS` event), the app
shows the option at once. "🧭 Lead this way in the game" — the option's point goes to the game instead of the usual one.
The main way is not hidden. The route now has: Varrock Teleport (Magic 25) on five steps, the Log canoe (Woodcutting 12)
and the Dugout (27) to the Stronghold of Security, the Chronicle book to the exchange. There are no agility shortcuts yet: the F2P route
does not train Agility, and the members thresholds are not verified yet.

**Grand Exchange bulk list** (the 🛒 page). It takes the mandatory items of the chosen stages and adds up the same ones
by item ID (without an ID — by name). It does not count twice: "From step S2-01" is the same item;
tools and gear (a hammer, a spade, an axe) — one is enough for all steps. Groups: "Buy at the exchange",
"You will get it during the steps", "Recommended", "Not sold at the exchange" (quest ones — by the OSRS Wiki price reference).
The budget is by the same price service as the item inspector. "📋 Copy the list for the exchange" — English
names with the quantity; "📋 Copy the name" — on every item.

**The exchange hint** (`GrandExchangeHelperOverlay`). With the Grand Exchange open — the same list: what you already have
(bag, banknotes, bank), what is in an offer, what is bought and waiting, `▶` at the next one. The name is **not put**
into the exchange search: RuneLite has no public API for that, and writing into the game's input field is already input
automation. The plugin does not place or confirm offers.

**Route on the ground.** If the **Shortest Path** plugin (Plugin Hub) is installed, the bridge gives it the target through its
open API (`PluginMessage("shortestpath", "path", {target})`, clearing — `"clear"`), and it draws the path with walls
and doors in mind; it computes its own path once per target. A foreign target set by hand is not erased by the bridge.
The `pathWaypoints` field is the stops in order: the game arrow and the HUD ("Point 2/5: …") lead to the current one, it is
counted at 3 tiles, and at the end the route is cleared. The stops exist now for The Restless Ghost (the church →
Father Urhney → the coffin → the wizards' tower → the coffin).

## Places, bank, danger, pace and upgrades

Everything below works as one whole: the wiki dossier → a point on the map → the arrow in the game → the HUD; the active step →
the stage items in the bank → the training pace → a danger warning. In the app each part can be turned off
("Settings → Helper: places, bank, pace, upgrades"), in the game — in the plugin settings, the section
"Places, radar, pace". A turned-off feature is not merely hidden: it does not search, send or draw.

**📍 Places from the wiki dossier.** In the item inspector the "Where to get it for free" rows, the shop, the seller and the town
in the shop table, and for an NPC "on the world map" open the world map with a marker and the source caption
("Item source: Small fishing net • Lumbridge Swamp - by the Fishing tutor"). The coordinates are not written
into the items — they are found by the common place search (`src/services/locationResolver.ts`):

1. the "lies free" line — the spawn point from the item page on the OSRS Wiki (`{{ItemSpawnLine}}`);
2. the `src/data/majorLocations.json` dictionary — 126 places: towns, banks, shops, route NPCs, guilds, mines,
   fishing spots, transport. An exact name, a synonym, case-insensitive and without service words ("shop", "by", "south of"…);
3. the `{{Map}}` map in the article of a shop, an NPC or a place on the wiki;
4. the "approximate" dictionary — a place named inside a line, or a similar spelling (marked "approximate" on the map);
5. nothing found — "The exact coordinate could not be determined automatically" and a search on the OSRS Wiki.

The OSRS Wiki no longer has a Cargo API (`action=cargoquery` answers "Unrecognized value"), so the markup of articles is parsed —
the same one the dictionary was built from (`npm run build-locations`, needs the network). Wiki answers are cached in memory
and in localStorage for a week (an error — for a minute), and one place is not requested twice.

**🧭 The arrow to a place in the game.** The "🧭 Point the arrow in the game" button on the map (and 🧭 in a dossier row) sets
a temporary target over the step (`POST /nav-target`): the game arrow, the Shortest Path route and the HUD ("To the place: Port Sarim")
lead there, the seller is highlighted. Arrived (3 tiles) — the target clears by itself and the arrow returns to the step.
Without RuneLite the map works as usual, with "RuneLite offline" next to the button.

**🏦 Stage items in the bank.** While a stage step is shown in the game, the bridge softly outlines in gold, in the main
bank window, all the stage items that are taken from the bank (`POST /bank-tags`; in F2P — without the Members items).
The highlight changes with the stage by itself.

**⚠ Danger radar.** The zones are `src/data/dangerZones.json` (the data is checked against the wiki, the plugin takes the same file):
dark wizards at the stone circle south of Varrock and behind the Draynor bank, the animated trees in the Draynor Manor yard,
the aggressive guards at the Draynor jail. Closer than 20 tiles — a red zone border on the ground; in the warning
zone — "⚠ WARNING" in the HUD, a red outline of the dangerous NPCs and a sound once per entry (leave and enter —
again). The distances are squared, NPCs are searched only near a zone.

**⏱ Training pace.** Training steps with one clear action (chopping to 15, shrimp to 20, ore to 15,
trout to 30) have a `pacing` field: the skill, the goal, the XP per action. The plugin counts by the XP from the game (`StatChanged`):
"34 shrimps to 20 Fishing (~7 min)" in the HUD and the same in the step card. The pace is by the last five XP
gains; until there are three, the time is not invented: "calculating the time…". Fewer than 5 actions —
"✓ Almost done", the goal reached — "✓ Target level reached".

Combat has a pace too (S3-08 — Al Kharid warriors to 30, S4-03 — moss giants to 40): three skills at once
(`skill` and `also`), the XP per opponent is 4 × its health (the warrior 19 → 76, the giant 60 → 240; `check-data`
verifies it). The HUD shows the skill the XP is currently going into, "then Strength and Defence", and when that
skill is ready — "✓ 30 Attack - next Strength: change attack style". Until there are measurements of its own, the first time estimate
comes from the gear analysis (seconds per opponent by the worn weapon and the levels) marked
"approx."; the gear is unknown — no estimate, the time is not invented. The combat measurement is by the last 30 gains.

**⚡ Speed upgrade.** Before chopping and mining the app compares your axe or pickaxe
(gear, bag and coins — from the plugin) with the tiers of `src/data/toolProgression.json` and, if the level already
allows a better one, offers: "Replace Bronze axe → Steel axe · Bob's Brilliant Axes • Lumbridge · ~200 gp".
"🧭 Point to Bob" — the arrow to the shop, Bob is outlined with the caption "[Buy: Steel axe]", the axe is outlined in the shop
window. As soon as the axe is in the bag or in the hand, the target clears by itself and the step returns. Not enough money —
it does not call you there, it shows how to make it up (guides, not a promised income). "✕ Skip" hides the hint
on this step. Prices and sellers — from the item database (OSRS Wiki), the shops — from the place dictionary. It buys nothing.
Weapons, amulets and armour are advised by the gear analysis — below.

**⚔️ Gear.** The `#/gear` page (the ⚔️ icon in the header; on a narrow window — from "What to do now" and from
combat steps) shows the levels, what is worn, how hard it hits ("max hit 2, once every 2.4 s, 71% hits —
≈ 20 s per cow") and what to do to hit faster:

1. **wear** the best you already have in the bag or the bank — free and first;
2. **buy** the weapon and the amulet you can afford — from a trader (the arrow leads to them, 🧭) or at the exchange;
3. **save up** — the best overall, if you cannot afford it: "600 gp short";
4. the armour you can afford — separately and "optional": it does not speed up the fight, and the money is needed for the route's shopping;
5. what unlocks next (the next scimitar and body by level) and the unlocked strength and attack prayers.

Damage is counted by the OSRS Wiki formulas ("Damage per second/Melee"): the max hit, the hit chance, the average
damage per second — for the Accurate and Aggressive styles of the weapon category, against the **step's opponent**
(`foes` in `steps.json`: cows on S1-13, Al Kharid warriors and the Flesh Crawler on S3-08, Count Draynor, the Moss giant…;
their defence is from the monster cards on the wiki, `src/data/monsters.json`). A sword is bought for the whole training, and the
max hit grows in steps, so the gain is the average over the nearest 10 strength levels. Everything that gives at least +3% damage
or +3 defence is advised; of the nearly equal — what the route buys anyway (the scimitars and the strength amulet on S2-01), and a noticeably cheaper one — only for a real saving. A shop slightly pricier than the exchange (up to 100 gp)
goes first: the price is exact and it is usually nearby. The level requirements are from the wiki article text (for warhammers — strength,
not attack); an item with an unverified requirement is not advised. Without RuneLite — advice by the levels from the profile,
without an invented "+%" for an unknown weapon.

On a combat step the card has a "⚔️ Stronger in combat" plate with the main advice and "🧭 Point to Zeke", on "Path" — a
short banner, and in the game (`POST /gear-hint`) — a HUD line "⚡ Stronger: Iron scimitar from Zeke (Al Kharid), 112 gp"
or "⚡ Wear Iron scimitar — it is in the bank", and that item pulses with an amber frame in the bag and the bank.
The plugin also reports how many of these items are in the bank (the `OWNED` event) — this is how the program learns
that something can be worn for free. It buys and wears nothing. It is turned off by the same "⚡ Upgrades and gear" switch
and the plugin setting "Upgrade hints".

### Building and checking the plugin

You need JDK 17 (for example [Temurin 17](https://adoptium.net/temurin/releases/?version=17)), `JAVA_HOME` points to it.

```bash
cd runelite-bridge
./gradlew testClasses
```

`./gradlew test` — the bridge tests: HTTP and the event stream, refusal of any browser, the auto-mark (a quest, levels,
things by ID and by names, their combinations), the departure check (0/1, 1/1, stacks, not in the bank), the distance and the arrow,
waypoints, the shopping progress, a temporary target, the stage items, the gear in `/status`, the danger radar
(entry, exit, the sound once, the circle border), the training pace (remainder, pace, pause, "almost done", combat by three
skills), the Quest Helper machines (a reference answer on thousands of vectors), the in-game text layout: `OverlayLayoutTest` draws
the HUD, the departure check and the exchange with the real RuneLite fonts for all steps, branches, purchases, places, zones and pace lines,
in all the fonts and in the large mode, and looks for points outside the frame; `ConfigNamesTest` measures the setting names by the panel.
Also a check of the route against this RuneLite version — every quest name for the auto-mark is in `net.runelite.api.Quest`.
On Windows use `gradlew.bat` instead of `./gradlew`.

### Starting — in the desktop program nothing needs to be done

You open "OSRS Path" — and RuneLite with the plugin starts by itself (10–20 seconds, the indicator in the header turns
green). It is turned off in "Settings → RuneLite → Start RuneLite together with OSRS Path"; there is also the button
"🎮 Start RuneLite with the bridge". Closing "OSRS Path" does not close the game.

How it works: Java is taken from the installed RuneLite (`%LOCALAPPDATA%\RuneLite\jre`), the client classes —
from its cache `~/.runelite/repository2` (the RuneLite launcher downloads them), the plugin is `osrs-path-bridge.jar` inside the program
(about 90 KB, only our code). Nothing is downloaded. One thing is needed: RuneLite is installed and was started at least once
through the Jagex Launcher. The start log is `runelite-launch.log` in the program's data folder.

An ordinary RuneLite from the launcher does not load third-party plugins (in 1.12.39 the `~/.runelite/sideloaded-plugins` folder
is read only in developer mode, and it is turned on only when the client is started **without** the launcher), so the
program starts the client directly, like the official RuneLite plugin template.

**Signing in with a Jagex Account.** A RuneLite started not from the Jagex Launcher does not know your session. Once:
"Start → RuneLite (configure)" → in the *Client arguments* field enter `--insecure-write-credentials` → Save →
start RuneLite through the Jagex Launcher and close it → make the field empty again. The session is saved in
`%USERPROFILE%\.runelite\credentials.properties` — the file gives access to the account, send it to nobody
(to revoke — "End sessions" in the Jagex Account settings). Old accounts without a Jagex Account sign in with a login
and password in the RuneLite window. The program shows in the settings whether the sign-in is saved.

### Starting from the repository (for development)

```bash
cd runelite-bridge
./gradlew run
```

`./gradlew run -PruneliteHome=C:\rl-dev` — a separate settings folder, the real `~/.runelite` is not touched.
For a Jagex Account sign-in the development client needs saved sign-in data — how to get it through the
launcher is described in the RuneLite wiki, the article "Using Jagex Accounts" (the `--insecure-write-credentials` parameter).

The order:

1. Start RuneLite with the plugin: the desktop program does it itself, from the repository — `./gradlew run`.
2. The OSRS Path Bridge plugin is on by itself (in the RuneLite plugin list — its settings: the port, colour, arrow, sound
   and the "In-game helper" section).
3. Start the "OSRS Path" app (the desktop program or `npm run dev`).
4. In the header — `🟢 RuneLite bridge active`. The link is on at once; it is turned off in "Settings → RuneLite".
5. Open a step, for example S1-03 Cook's Assistant.
6. Press "🧭 Show in the game" — the button becomes "✓ Shown in the game", and "● Active in RuneLite" appears next to it.
7. In the game: an arrow over the kitchen, an outline of the cook, a frame at "What's wrong?".
8. Complete the quest.
9. The step is marked by itself, S1-04 opens and goes to the game at once.

### The "What you need" list in the game and the "OSRS Path" panel

**On the game screen**, top left under the step plate, is the "What you need" list: the step's items with a status ("have",
"in the bank", "none", "during the step" — you will get it in the step itself, "in the bank?" — the bank was not opened yet), under each — where to get it;
what is missing — at the top. Below — "Where to go": the quest NPCs and the step's places. A row with a place is a button: a click sets
a temporary target — the arrow, the tile on the ground and Shortest Path lead there, the NPC is highlighted, on arrival the arrow itself
returns to the step ("← Arrow back to the step" — at once). The mouse over a row shows the full text and what the click will do at the bottom;
a click on the title collapses it. Clicks on the list do not go to the game (as with the RuneLite dungeon map); if a game window is on top
(a bank, a shop), a click goes to it. It is turned off by the "What you need list" setting and is moved with Alt.

**The side panel** — an arrow icon on the RuneLite bar: the same in more detail, with "Go here" on every place.

**Where the places come from.** The step point, the places from the step map (`resourceSpots`), where items come from (the `from` field of an item: an NPC from
`src/data/npcLocations.json` or a place from `majorLocations.json`) and the quest NPCs from `inGame.npcNames` if it is known
where they stand (`npcLocations.json` — from the maps of the OSRS Wiki articles; one name for different NPCs — a record with `steps`, like
the Cook in the Blue Moon Inn for S3-04). One layout — `src/lib/stepPlaces.ts`: the same places are points on the step map in the
program ("🧭 Lead here in the game") and rows in the game. `check-data` verifies that every `from` has a place,
`check-links` — that the NPC articles exist.

**One target in the program and in the game.** A target chosen in the game is reported by the plugin with the `NAV_SET` event and the `navTarget` field
in `/status` — the program marks it "● The arrow leads here" even after its own restart. The "Bag" line in the HUD
names what is missing: "Bag: no Burnt meat", "Bag: Burnt meat — take it from the bank".

**An old plugin.** The program starts RuneLite with the plugin from its folder, but an already running RuneLite keeps the one
it started with. A plugin older than the program (a lower protocol) — on the step card and in the settings "An old plugin is running in
RuneLite — restart RuneLite" and what is missing without it.

If RuneLite is not running, the indicator is `⚪ RuneLite bridge offline`, the button says what to do; the app
reconnects by itself with pauses of up to 30 seconds. The requests go through the program's main process (no CORS
and no console errors). A page from `npm run dev` in a browser works without a link to RuneLite.

### Bridge addresses

| Request | What it does |
|---|---|
| `GET /status` | `{"status":"ok","inGame":true,"activeStepId":"S1-03","stats":{"magic":25,…},"shortestPath":true,"equipment":[…],"inventory":[…],"coins":250,"carriedValue":1200,"navTarget":{"label":"Ned — a house in Draynor Village","x":3099,"y":3259,"plane":0,"npcNames":["Ned"]},"protocol":6,"pluginVersion":"2.46.0"}` — the estimate of items by exchange prices without coins (`carriedValue`, `bankValue`) and the version handshake; protocol 3 — the `guide` list for the side panel; 4 — the "What you need" list on the game screen and `navTarget`, where the temporary target currently leads; 5 — XP, quests, the character name; 6 — the single state snapshot `/prep-plan` |
| `POST /active-step` | The step target (`InGameTarget` + `stepId`, `title`, `goal`, `checklist`, `pathWaypoints`, `watchItems`, `pacing`, `guide`: `{"items":[{"name":"Eye of newt","id":221,"count":1,"where":"Buy from Betty…","inStep":true}],"places":[{"x":3014,"y":3259,"plane":0,"label":"Eye of newt — Betty, Port Sarim","npc":"Betty","items":["Eye of newt"]}]}` — for the "OSRS Path" panel) |
| `POST /prep-plan` | The single state snapshot (protocol 6): the step target, the shopping list, the bank tags, the gear hint and the preparation plan in one request with a sequence number; the plugin answers which parts it rejected |
| `POST /clear` | Remove the arrow, the highlight, the HUD, the path and the temporary target |
| `POST /shopping-plan` | The bulk list for the exchange hint: `{"items":[{"name":"Rope","id":954,"count":2}]}` |
| `POST /nav-target` | A temporary target: `{"label":"Port Sarim","x":3029,"y":3221,"plane":0,"npcNames":["Gerrant"]}`, for a purchase also `itemName`, `itemId`, `stepId`; `{"clear":true}` — remove |
| `POST /bank-tags` | The stage items for the bank highlight: `{"stageId":"stage-1","itemIds":[1351,590]}`; an empty list — remove |
| `POST /gear-hint` | A gear hint: `{"text":"⚡ Stronger: …","watchItems":["Steel scimitar"],"highlightItems":["Iron scimitar"]}` — the HUD line, which items to report the bank count for (`OWNED`), what to highlight; `{"clear":true}` — remove |
| `GET /telemetry` | The summary of the debug journal (the file path, the size, the state) |
| `GET /events` | The event stream: `STATUS`, `STATS` (levels), `OWNED` (how many of the needed items there are), `GEAR` (gear and coins), `PACING` (pace), `NAV_SET` (a temporary target was set — by the program or by the player in the game), `NAV_DONE` (a temporary target was removed: `arrived`, `obtained`, `cleared`), `STEP_AUTO_COMPLETED`, a ping every 15 seconds |

`STATS`, `OWNED`, `GEAR` and `PACING` go only on change and no more than once per game tick; a new
connection gets them again at once. The levels can be left unsent — "Options by levels" in the plugin
settings; the gear and coins — "Upgrade hints". A turned-off feature answers `409`
with an explanation, and the app shows it. Fields that do not exist are not written by the plugin (rather than writing `null`).
Worn items have a slot (`"slot":"weapon"`, `"amulet"`, `"shield"`… — the `EquipmentInventorySlot` names).

Protection against websites in a browser: the `Host` header — only `127.0.0.1`/`localhost` (against DNS rebinding),
any request with an `Origin` header is rejected (`403`) — only a browser sends it, while the desktop program goes
from the main process without it; POST — only with the `X-OSRS-Path: 1` header, the body — up to 64 KB. The bridge does not allow CORS,
so a page in a browser cannot read the answer or send the header.

### What is verified and what is not

Verified on RuneLite 1.12.39: the plugin loads into the client ("Plugin OsrsPathBridgePlugin is now running"),
the bridge answers all the addresses, the app in a browser and the desktop program see it, "Show in the game"
passes a step, the auto-mark (an event from the bridge) marks the step once and opens the next one; the panel, the temporary targets "To the place" and "Buy",
the return to the step and the settings panel were checked in a live game on 2.5.1. The HUD text is drawn with a single RuneLite font and wrapped by the
plate width (and by the one the player set with the mouse), and a number does not detach from its word.
**Not verified in the game**: what was made after 2.16.0 on a live character unless a release note says otherwise (the developer plate, the hotkeys, the screenshots),
the radar borders and outlines, the sound, the seller and shop cell highlight, the gear line and the amber frame.
The code uses only the API found in the RuneLite 1.12.39 jar, and the tests check the route against it.

Checks: `npm test`, `npm run test:ui`, `npm run test:e2e` (a real Electron, locally), `./gradlew test`.
The plugin's compatibility with an installed RuneLite (after its update): `npm run check-runelite`.

## Version history (summary)

- **2.29** — progress copies outside the app folder (every hour, on by default) and an automatic restore into a fresh data folder; the profile list is kept in a file; "Sync with the account" also restores the steps the confirmed ones require.
- **2.27** — the quest stages are chosen by the Quest Helper machines (chat and dialogue messages, the journal, variables, items, place); a more detailed debug journal.
- **2.19** — less text: Zen / Inspector, a single status, a smart reveal in the game (a plugin setting, off by default).
- **2.18** — one readiness engine, auto-preparation (the queue leads the arrow to the bank, the exchange, the training place), "🎯 What to train with" (training methods by level, mode, items and play style), the "calm / efficient" play style, live exchange prices in the resource journal.
- **2.17** — the single player state and the unified requirements; the preparation route; "one trip"; the resource journal; one navigation target with a reason; the data consistency check (`scripts/qa.ts`).
- **2.16** — the in-game "What you need" knows the quest stage; the routes of 32 quests are taken from Quest Helper; a new look of the plates; bridge protocol 5.
- **2.15** — "Food for combat", "Fix everything" (the chain of steps to readiness), "What to wear for magic and ranged", step-by-step guides for S7-05, S9-03, S9-04; `tests/fuzz.test.ts`.
- **2.14** — "Where am I? How to get there": the character position from the plugin, on foot / teleport / canoe / boat options with a check of the level, runes, axe and coins.
- **2.13** — S2-04 in detail, "How to make up the money" (earning methods from the wiki).
- **2.12** — XP, quests, the name and the position from the game; "Sync with the account"; character profiles; a scheduled progress copy; "This session" and "Diagnostics".
- **2.11** — the "What you need" list on the game screen; a marker on the game's world map; places for 43 items and 101 quest NPCs; bridge protocol 4.
- **2.10** — the "OSRS Path" side panel in RuneLite; bridge protocol 3.
- **2.9** — readiness, "I already have it", the big arrow, money, the item estimate.
- **2.7** — members skills with training plans, an auto-mark on 62 steps, the combat pace; one build (the web and phone versions, the installer and the Bank Tags import string were removed).
- **2.6** — the gear analysis. **2.5** — places, the bank, the danger radar, the pace, upgrades. **2.4** — the in-game helper.

## Moving from older route versions

Saved progress is carried over by itself — at program start and when importing a file:

- **V1** (the first version): marks and notes move to the corresponding steps by the
  `V2_FROM_V1` table in `src/lib/progress.ts`, a full copy of the old progress stays inside (`legacy`);
- **V2 (2.0.0)**: in 2.1 some steps got new numbers (money before purchases, members quests by
  requirements) — marks, notes and saved points are renamed by the `V3_FROM_V2` table.

Three steps (S1-03, S1-04, S2-01) got important requirements in V2. If they are already marked,
the "Guide update to V2!" banner appears on "Path": you can look at the changes, return the steps
to active (quest points are not taken away) or hide the warning.

## Running

Node 22.18 or newer is needed (the data scripts are written in TypeScript and run by Node itself).

```bash
npm install
npm run dev
```

`http://localhost:5173` opens — the same program in a browser, but without a link to RuneLite and without the progress
file: handy for editing the interface. The real check is `npm run desktop`.

| Command | What it does |
|---|---|
| `npm run dev` | Local development |
| `npm run build` | Type check and build into `dist/` |
| `npm run preview` | Open the built version (`http://localhost:4173`) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:ui` | The interface in a real browser with a stub bridge: readiness, shopping, gear, the map, the header (after `npm run build`; Chromium — `npx playwright install chromium`) |
| `npm run check-data` | A check of the route, the item database, the texts, the skills and the reference |
| `npm run build-items` | Build the item database from the OSRS Wiki (needs the internet) |
| `npm run build-gear` | Build the gear and monster data from the OSRS Wiki (needs the internet) |
| `npm run check-links` | Check all wiki links and pictures in the route, the item database and the guide, and the map tiles (needs the internet) |
| `npm run icons` | Redraw the icons in `public/` |
| `npm run desktop` | Build and open the desktop program (Electron) |
| `npm run dist:win` | Build the portable exe into `release/` (together with the RuneLite plugin jar) |
| `npm run bridge:jar` | Build only the plugin jar (JDK 17 is needed: `JAVA_HOME` or `~/.jdks`) |
| `cd runelite-bridge && ./gradlew testClasses` | Build the RuneLite plugin and its tests (JDK 17 is needed) |
| `cd runelite-bridge && ./gradlew test` | The plugin tests |
| `cd runelite-bridge && ./gradlew run` | RuneLite with the OSRS Path Bridge plugin |

## Releasing a new version

1. Raise `version` in `package.json` (and `package-lock.json`, two places; it is seen at the bottom of "Settings"), and `PLUGIN_VERSION` in `BridgeServer.java` — the same as the program's: a test checks it.
2. Write `release-notes/vX.Y.Z.md` — it becomes the release description.
3. `npm run check-data`, `npm test`, `npm run build`, `npm run test:ui`, `cd runelite-bridge && ./gradlew test`.
4. Commit and push to `main`. The `Release` workflow (`.github/workflows/release.yml`) sees the changed version in `package.json`, builds the portable exe on Windows together with the plugin jar, sets the tag
   `vX.Y.Z` and publishes the release. A version that already has a release is not built again.

On every push GitHub Actions runs `check-data`, the tests, the build and the browser checks, and separately the RuneLite plugin tests
(the `Checks` workflow, `.github/workflows/checks.yml`).
The networked `build-items` and `check-links` are not run in CI.

## Moving the progress to another computer

The easiest way is to move the `OSRS-Put-data` folder together with the exe. Or with a file:

1. On the old computer: the gear → **Export progress**.
2. On the new one: the gear → **Import progress** → choose the file → **Replace**.

The import replaces the progress entirely; right after the replacement it can be undone in the message that appears.
First-version files are accepted too — they are carried over to V2 the same way as saved progress.

## Data

- **The V2 route** — `src/data/steps.json` and `stages.json`, the source of truth for the steps. They are edited by hand,
  after an edit — `npm run check-data`.
- **Skills, level goals, XP, plugins, the reference** — `src/data/skills.json`, `goals.json`, `xp.json`, `plugins.json`, `reference.json`. The members skills are
  `src/data/members-skills.json`: a skill has a code (`AG`) and a level id as in RuneLite (`agility`); old
  `#/skills/agility` links open the same section. `check-data` verifies that the plans run from level 1 without gaps and the codes are in order.
- **The item database** — `src/data/f2p-items.json`, built by `npm run build-items` from the OSRS Wiki
  (the Bucket API: the description, trader prices, drops; spawn places — from the articles). The script politely
  waits between requests and caches the answers in `node_modules/.cache`; `--fresh` — rebuild. It also sets IDs and icons
  on the items in the steps.
- **Exchange prices** — live, from prices.runescape.wiki; kept in memory for 5 minutes.
- **The place dictionary** — `src/data/majorLocations.json`, built by `npm run build-locations` from the OSRS Wiki: for each
  place — the `{{Map}}` map of its article, for fishing and ore places — the `{{ObjectLocLine}}` rows on the fishing or
  ore page. Only the list of places and the synonyms are by hand in the script. A network failure does not erase the earlier records.
- **Danger zones** — `src/data/dangerZones.json`, each zone has where the data is from (`source`). The plugin takes the same
  file: Gradle puts it into the jar.
- **Tool tiers** — `src/data/toolProgression.json`: axes and pickaxes, IDs, requirements, the seller. Prices are from the item
  database, the shop points are from the place dictionary; the tests verify that the ID, the shop and the point are in place.
- **Gear** — `src/data/gear.json`: 135 free-version melee items (weapons of seven metals, helmets,
  bodies, legs, shields, amulets, leather armour) — attack, defence and strength bonuses, the attack speed, the slot, the level requirement
  from the article text, shops and prices. **Step opponents** — `src/data/monsters.json`: the defence, level and
  health by the `foes` field of the steps. Both files are built by `npm run build-gear` from the OSRS Wiki (Bucket `infobox_bonuses`,
  `infobox_monster`, `storeline`, articles; needs the network, the answers are cached, `--fresh` — anew).
- **Quest stages and machines** — `src/data/questStages.json` (the stage lines of the 32 route quests) and `src/data/questMachines.json`
  (generated, see `tools/qh-machines/README.md`).

Step fields for the map and the game (all optional): `mapLocation` — the start point `{x, y, plane, label, zoom?, note?}`
in game coordinates, `resourceSpots` — gathering places for the switch, `mapPreviewImage` — your own picture instead of tiles,
`warning` — the main warning, `inGame` — the RuneLite highlight and the auto-mark condition, `pacing` — the training
pace (`skill`, `targetLevel`, `targetExp`, `actionName` as the forms "shrimp|shrimps", `expPerAction`,
optionally `secondsPerAction`). A food item has `heals`, how much it heals.

What `check-data` verifies: step numbers and stages, dependencies, quest points (F2P — 46,
with membership — 69) and a match with the "Reward", the reachability of the point thresholds, floors in the UK format
(`Ground floor`, `1st floor`), for step items — a database record with the same icon,
120+ items in the database, the text — a capital letter at the start, known typos, paired brackets
and quotes; map points (coordinates, floor, caption, a match with the "Wiki map" link), the highlight fields
and the auto-mark conditions, for every item — where to get it, for food — how much it heals, no "take food" anywhere without a name
and a quantity; the pace — the skill and level are the same as in the step title, the XP is by the game formula; there are no HTML entities
or `[UK]/[US]` marks in the shop and spawn places; the auto-mark — the quest name as in the game, the levels the same
as in the step title, for items the ID and the quantity are within bounds; the combat pace — XP 4 × the opponent's health; the members
skill plans run from level 1 without gaps; the consistency rules (`scripts/qa.ts`): Coif, amulets, Home Teleport, quest stages,
training methods.

## How it is counted

- **"What to do now"** — the first unclosed step in order whose dependencies are all closed
  and whose quest points are enough.
- **"Mark as done"** in a card collapses it and expands the next unclosed step;
  the page scrolls only if it is not visible.
- **A closed step** — done or skipped. Only the optional S3-05 (Shield of Arrav) can be skipped;
  it then gives no points, and the F2P maximum becomes 45 of 46.
- **Quest points in "Goals"** are counted from the V2 route by stages.
- **The training plan row** — by the entered level: the range "15–30" includes 15 but not 30.
  Melee — by the lowest of attack, strength and defence.
- **Floors** — British, as in the game: Ground floor, 1st floor, 2nd floor.
- **Experience** — the standard OSRS formula.

## Structure

```
scripts/               check-data, build-items, build-gear, build-locations, check-links, qa and other checks, the icons
src/data/              the V2 route, the item database and the JSON of skills, goals and the reference
src/services/          the OSRS Wiki (Bucket API, articles), exchange prices, the RuneLite bridge, place search, tool upgrades,
                       the gear analysis (damage formulas)
src/lib/               progress and the V1 transfer, "what now", points, quests, XP, search, scale, the map,
                       the departure check, quick options, the bulk list, the stage items for the bank, places, pace,
                       the auto-mark conditions, readiness, preparation, training, travel, the feature switches
src/bridge.tsx         the state of the link with RuneLite, the auto-mark, levels and items from the game
src/components/        the step card, the step map and the world map, "Show in the game", the stage, "now", the wiki inspector,
                       search, the mode switch, the progress and the RuneLite indicator in the header
src/pages/             Path (narrow and wide in three columns), Skills, Skill, Goals, Quests, Reference, Settings,
                       the GE bulk list, Gear
tests/                 unit tests
electron/              the desktop program window, the bridge to it (preload), the link with the RuneLite plugin and its launch
runelite-bridge/       the "OSRS Path Bridge" RuneLite plugin: the HTTP/SSE bridge, the highlight, the auto-mark, the HUD,
                       the departure check, the path, the exchange hint, a temporary target, the danger radar, the pace
tools/qh-machines/     generators of the Quest Helper machines (not needed to build)
vite.config.ts         the build
```

Dependencies: React, Vite, TypeScript, Vitest, Leaflet (the world map), for the exe — Electron and electron-builder;
the plugin — the RuneLite client 1.12.39 (only at build time), Lombok, JUnit. The architecture notes by directory are in `PROJECT_MAP.md`.
