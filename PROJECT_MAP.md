# OSRS Path — the project map: what exists, where it lies, how it is connected

> This file is written so that it can be dropped whole into another chat with a request to suggest what to add or fix. Project version: **2.32.0** (bridge protocol 6). Repository: https://github.com/bexaf3163/OSRS. The language of the interface and the texts is English.
> The inventory is compiled from the sources; a note **[not in the game]** means it was not checked in a live game, only by tests, a browser and a plugin imitation.

---

## 1. What it is

A companion program for Old School RuneScape (F2P and Members). It leads the player along a ready route (9 stages, 69 steps: 54 for F2P and 15 for membership), follows the player's progress through a RuneLite plugin and prepares for each step by itself: it checks levels, gear, bag, bank, coins and quests, and leads with an arrow in the game.

It has two parts:

| Part | What it is | Where |
|---|---|---|
| **Desktop program** | React 19 + Vite + TypeScript in an Electron shell; one portable exe `OSRS-Put-<version>-portable.exe`, no installation and no server | `src/`, `electron/` |
| **The "OSRS Path Bridge" RuneLite plugin** | Java 17, Gradle; overlays in the game, an HTTP bridge `127.0.0.1:38282`; the jar goes inside the exe, the program starts RuneLite with the plugin by itself | `runelite-bridge/` |

The progress is kept on the player's disk (the `OSRS-Put-data` folder next to the exe, the `progress.json` file + the window's localStorage). There are no accounts, no server and no web version (removed in 2.7.0 at the owner's request, do not bring back).

---

## 2. Principles (all the logic stands on them)

1. **Unknown ≠ no.** Any value is "have / none / unknown". With no data from the game the program does not claim an item is missing (`Known<T>` in `src/lib/playerState.ts`).
2. **Do not invent data.** Time — only by measurements; prices — from the exchange or "from the project database" with a note; DPS and XP — by the wiki formulas. No value — "unknown".
3. **One source of truth.** Readiness, shopping, preparation and the arrow read one player state and one engine (`readinessEngine.ts`); do not make parallel copies.
4. **Live → manual → unknown.** The priority of the sources of an item's quantity.
5. **Nothing is bought automatically.** The program recommends, leads and highlights — the decision is the player's.
6. **Hide the extra, do not delete it.** "Zen" mode is the default, "Inspector" shows everything.
7. **The game screen is "where to click", the program is analytics.** In the game the "What you need" list and the HUD are always visible (the plugin has a "Smart reveal", but it is off by default — the owner does not want information hidden in the game).
8. **Data from the wiki, not from memory.** The `build-*` scripts collect data from the OSRS Wiki; the quest stages come from the Quest Helper sources.
9. **Do not weaken tests.** On a failure first work out what it protects.
10. Removed at the owner's request and not coming back: the web version and the phone, the NSIS installer, the waypoint markers on the ground, the Bank Tags import string (the highlight of what is needed in the bank stayed).

---

## 3. How it is all connected (the data flow)

```
 RuneLite (the game)
   └─ the OSRS Path Bridge plugin (Java)
        ├─ reads: levels, XP, bag, worn, bank, coins, position, quests, quest variables (varp/varbit)
        ├─ HTTP 127.0.0.1:38282  +  the event stream (SSE) ──────────┐
        └─ draws: the arrow, the HUD, the "What you need" list, the radar, the highlight
                                                                      ▼
 Electron (the main process)  electron/runelite-bridge.cjs  — the only one that goes to localhost (no CORS)
                                                                      │  preload.cjs → the window
                                                                      ▼
 The window (React)   src/bridge.tsx  — the link state, the events, the auto-mark of steps
        ├─ src/store.tsx            progress (localStorage + the progress.json file), profiles, undo
        ├─ src/playerStateContext   the single player state + the resource journal
        ├─ src/readinessContext     the readiness engine (the memory of calculations)
        └─ pages and step cards (src/pages, src/components)
```

Back into the game the program sends one state snapshot (`POST /prep-plan`, protocol 6: the active step, the shopping list, the bank tags, the gear hint, the preparation plan), the temporary arrow target (`/nav-target`) and the reset (`/clear`). For an older plugin (protocol below 6) the separate requests are used: the active step (`POST /active-step`), the bulk list (`/shopping-plan`), the stage items for the bank (`/bank-tags`), the gear hint (`/gear-hint`).

What comes from the plugin in `/status` and the events: `inGame`, `activeStepId`, `stats`, `xp`, `questsDone`, `player`, `pos`, `shortestPath`, `navTarget`, `equipment`, `inventory`, `coins`, `bankCoins`, `carriedValue`, `bankValue`, `inventorySlots`, `weight`, `protocol`, `pluginVersion`. Events: `STATUS`, `STATS`, `XP`, `QUESTS`, `OWNED`, `GEAR`, `PACING`, `STEP_AUTO_COMPLETED`, `NAV_SET`, `NAV_DONE`, `MOVED` (a death or a jump of 20+ tiles).

---

## 4. The program's features (by screen)

The header: search (`/`), the progress ring and the quest points, the F2P/Members switch, the 🧘 Zen / 🔍 Inspector switch (on a narrow screen — in "Settings"), the RuneLite link indicator.

| Screen | What it does | Main files |
|---|---|---|
| **Path** (`#/`) | Stages and steps, "What to do now", the step card, on ≥1080 px three columns (the ribbon, the step, the wiki dossier) | `pages/Path.tsx`, `PathWide.tsx`, `components/StageSection.tsx`, `StepCard.tsx`, `NextStepCard.tsx`, `lib/next-step.ts` |
| **Skills** (`#/skills`) | 12 F2P skills + 8 members skills, plans by ranges, the XP calculator, live XP and pace, "what to train with" | `pages/Skills.tsx`, `SkillDetail.tsx`, `lib/xp.ts`, `xpRate.ts`, `trainingRouter.ts`, `components/TrainingCard.tsx`, `LiveXp.tsx` |
| **Goals** (`#/goals`) | The levels for each stage, 14 skills × 6 stages | `pages/Goals.tsx`, `lib/goals.ts` |
| **Quests** (`#/quests`) | The route quests, the quest points, what they unlock, pulling completed ones from the game | `pages/Quests.tsx`, `lib/quests.ts`, `qp.ts`, `components/AccountSync.tsx` |
| **Reference** (`#/reference`) | 8 sections (setup, F2P/Members, transport, plugins, safety…), a catalogue of 33 RuneLite plugins | `pages/Reference.tsx`, `data/reference.json`, `plugins.json` |
| **Gear** (`#/gear`) | What is worn, the hit strength by the wiki formulas, what to wear / buy / save up for, the "🔒 needs 20 Ranged" lock | `pages/Gear.tsx`, `services/gearAdvisor.ts`, `lib/gearAdvice.ts`, `data/gear.json` |
| **Bulk list** (`#/shopping`) | Shopping for several steps, "I already have it", the budget by exchange prices, the hint at the exchange in the game | `pages/Shopping.tsx`, `lib/shopping.ts`, `services/pricesApi.ts` |
| **Settings** (`#/settings`) | The theme, scale, font, "always on top", helpers, the RuneLite link, character profiles, the scheduled progress copy, "This session" + the resource journal, diagnostics, export/import | `pages/Settings.tsx`, `SettingsExtra.tsx`, `lib/profiles.ts`, `session.ts`, `ui-scale.ts`, `theme.ts` |

### The step card (what is on the "Path" screen)
- **The single status** instead of a stack of plates: "🟢 Ready to set off · Start the step" / "🟡 Preparation required (N items) · Fix · More"; in "More" there are tabs: preparation, gear, food, path and game, training and options. `components/StepStatus.tsx`.
- **Zen / Inspector:** `components/DensityToggle.tsx`, the `inspector` flag in `lib/features.ts`. Zen — the step, the status, what to do, "Done", the critical warnings; the rest is in "More about the step".
- **Readiness:** levels, quests, items, coins, the mode; actions "Catch up Crafting", "To the bank", "Add to shopping". `lib/readiness.ts`, `readinessEngine.ts`, `components/ReadinessPanel.tsx`.
- **The preparation route and the auto-queue:** what to do before leaving, in order (up to 3 nested detours, no cycles), it leads the arrow by itself and returns to the step by itself. `lib/prepRoute.ts`, `prepQueue.ts`, `usePrep.ts`, `components/PrepRoute.tsx`.
- **The "What you need" preparation plan:** one decision — where a thing is (worn/bag/bank/none/unknown), what to do, the importance (critical/important/upgrade), the deadline (now/while at it/during the step/later), why, consumables (enough/low), the readiness in %, the bag space, the weight and running. `lib/prepPlan.ts` (built on top of one trip `lib/oneTrip.ts`), the view — `components/OneTripCard.tsx`.
- **Weight and running:** `lib/weight.ts` (the OSRS Wiki "Run energy" formula), `data/weights.json` (`npm run build-weights`), the weight and the occupied slots from the game — the GEAR events.
- **Recovery mode** after a death or a teleport: `lib/recovery.ts`, `lib/useRecoveryTracker.ts`, the MOVED event, the plugin's `MoveDetector`; the banner in `OneTripCard.tsx` (`RecoveryBanner`).
- **Where to get an item:** the bank → the bag → free nearby → a shop → the exchange. `lib/sourceRouter.ts`.
- **What to train with** (61 methods, by level, mode, items, the calm/efficient play style). `lib/trainingRouter.ts`, `data/trainingMethods.json`, `lib/playStyle.ts`.
- **Quick options by stats** (Varrock Teleport at Magic 25, a canoe at WC 12…): `lib/branching.ts`, `components/BranchSuggestions.tsx`.
- **The tool upgrade:** "⚡ Speed upgrade" (Bronze → Steel axe from Bob). `services/gearUpgradeRouter.ts`, `components/UpgradePrompt.tsx`, `data/toolProgression.json`.
- **Combat:** "Stronger in combat" (`GearPrompt`), "Food for combat" (`FoodAdvice`, `data/threats.json`), "What to wear for magic/ranged" (`StyleGear`, `data/styleGear.json`), the combat pace.
- **Money:** "Step goal" (`MoneyGoal`), "How to make up the money" (`MoneyPlan`, `data/moneyMaking.json`), "Magic to the goal" (`MagicPlan`, `lib/magicPlan.ts`).
- **The map and navigation:** the step map (`StepMap`), the full-screen world map (`WorldMapModal`, Leaflet is loaded as a separate chunk), "How to get there" with the position from the game (`TravelPlan`, `lib/travel.ts`, `data/transport.json`), the single navigation target (`lib/navigation.ts`), places from the wiki dossier (`PlaceMap`, `services/locationResolver.ts`, `data/majorLocations.json`, 126 places).
- **Show in the game:** the step goes to the plugin (`InGamePanel`, `NavigateButton`, `services/runeliteBridge.ts`); the "● Active in RuneLite" badge.
- **The departure check** (`PreflightPanel`, `lib/checklist.ts`) — which of the step's items are in the bag.
- **The wiki inspector** (`WikiDrawer`, `services/wikiService.ts`, `wikiApi.ts`): the dossier of an item/NPC (203 items in the local database `f2p-items.json`), exchange prices are live.
- **The resource journal** (`lib/ledger.ts`, `ledgerStore.ts`): gathering, purchases, sales, rewards; kept between sessions (up to 30 days, per character and profile); the loot estimate by fresh exchange prices (`lib/priceBook.ts`), coins and the estimate are always separate.
- **Character profiles**, a foreign character does not write into the profile (`lib/profiles.ts`, `components/ProfileBanner.tsx`); the auto-mark of steps from the game (a quest, a level, items: `lib/triggers.ts`, `bridge.tsx`).

---

## 5. The RuneLite plugin (the `runelite-bridge/` folder)

**Overlays in the game:**
- The arrow to the target (big, rotating with the camera, the states "Nearby"/"Right here"): `OsrsPathArrowOverlay`, `ArrowGeometry`.
- The micro HUD: the step code, the goal, the distance, the pace, health, preparation: `OsrsPathHudOverlay`. **Compact** (the `hudLean` setting, on by default): while the "What you need" list is on the screen, the step title, the goal, the distance and the "Bag" line are removed from the HUD, and the plate stays only with a warning (danger, health, an action, the pace, a gear hint) — `OsrsPathHudOverlay.lean`, the list visibility — `GuideList.shown`.
- The "What you need" list (the step's items, where to get them, the step's points, a click — the arrow to a place): `OsrsPathGuideOverlay`, `GuideList`, `GuideMouse`, `StepGuide`.
- The departure check at the bank, the highlight of items in the bag and the bank: `InventoryCheckOverlay`, `OsrsPathItemOverlay`, `Checklist`.
- The highlight of NPCs, objects, tiles and dialogue options: `OsrsPathWorldOverlay`, `OsrsPathWidgetOverlay`.
- The danger radar (the zones from `dangerZones.json`, 4 zones of the early F2P): `DangerRadar`, `OsrsPathDangerOverlay`.
- The hint at the Grand Exchange (the bulk list): `GrandExchangeHelperOverlay`, `ShoppingPlan`.
- The "OSRS Path" side panel: `OsrsPathPanel`.
- The training and combat pace: `PacingTracker`, `PacingSet`.
- Quest stages: by the quest variable (varp/varbit) the plugin determines the stage and the steps with tiles (the data `src/data/questStages.json`, 32 quests, from Quest Helper). The current step is led by `StageTracker` (pure logic, every tick): by position (`StepGuide.advance`), by items — `has` (obtained → counted, the steps without conditions before it too; and if the item went further — the next step handed it in), `need` (handed in: the item left within 12 tiles of the point; not handed in — you cannot get past the step, the list returns and explains). **You cannot skip forward with a click**: "✓ Done — next" exists only on steps that the game will not show by itself (the next one on the same place or without a place: `needsManualStep`). "◀ Back" — a view for 45 s, then by the facts again; "▶ To the current step" — at once. All the stages are walked in the `QuestStageWalkTest` test without dead ends. The arrow follows the step (`OsrsPathBridgePlugin.trackStageCursor/followStage`). The short line text is the `s` field (all 644 lines, the `stages-short` check), the fallback shortening is `ShortText` (the plugin) / `lib/shortText.ts` (the program).
- The step auto-mark in the game: `AutoCompletionManager`.
- The "Smart reveal" (**off** by default): `SmartView`.
- **Protocol 6 (2.22):** one state snapshot `POST /prep-plan` instead of five requests (`/active-step`, `/shopping-plan`, `/bank-tags`, `/gear-hint`, the plan). The program: `lib/prepEnvelope.ts` (assembly, `planPayload`, `nextSeq`), `PrepSync.tsx` (the active step's plan), `bridge.tsx` (`snapshot`, `setPrepPart`, `flushSnapshot`; a plugin below 6 — the old requests). The plugin: `PrepEnvelope`/`PrepPlan` (a check by parts, `seq` against late ones), `OsrsPathBridgePlugin.onPrepPlan/applySnapshot` (in one pass of the client thread), `GuideList` draws the percent, "low", "Do not take now", the weight, the bag, the recovery mode. The contract is `runelite-bridge/src/test/resources/prep-snapshots.json` (written by `tests/prepEnvelope.test.ts`).
- **Bank and gear between sessions (2.24):** the plugin writes the bank into the RuneLite profile settings (`BankSnapshot`, the `bankSnapshot` key, no more than once per 3 s and on exit), loads it at login (`bankFromSave`, OWNED carries `bankSavedAt`); the program keeps `lastGear` (localStorage `osrs-put:last-gear`) and shows it on "Gear" while RuneLite is closed.
- **The debug journal and the developer plate (2.23):** by default the plugin writes `~/.runelite/osrs-path-telemetry/session-DATE.jsonl` (one JSON line per event: the step, the stage, where the cursor moved and why, clicks, the bag, a death/teleport, the program's snapshots, the text of the plates and the list, "oddities"; up to 8 files of 6 MB, local only). `Telemetry` is the writer, `EngineWatchdog` the watchdog (a stuck cursor, an item warning that holds on, an empty screen with a chosen step, a quest handed in but the list not), `DebugView` + `OsrsPathDebugOverlay` — a green/red plate on **Ctrl+Shift+D** (`ActiveStep | Stage | Cursor | Trigger | QueueDepth`, the `has`/`need` conditions, the snapshot, the screen, the oddities), **Ctrl+Shift+K** and every new oddity — a screenshot into `shots/` (up to 12 per session, no more than once per 20 s) with the engine state in the journal. The bridge: `GET /telemetry` (a summary; into the program's diagnostics report). The analysis: `npm run telemetry` (`scripts/analyze-telemetry.ts` + `src/lib/telemetryReport.ts`; the last session or `--all`, `--json`, a file path). The settings are in the "Developer" section.
- **The stage cursor does not jump over steps (2.25):** position closes a step only if it is a **move** (`StageTracker.isMove`: "Enter/Go down/Return/Sail/Board…", before the verb a place name is allowed — "Seaman at the pier: sail…" and "Prepare for the fight and enter…"; `StageTravelTest` checks this on the real lines), confirmed by an item (`has`/`need`) or the player **was at its point** (`seen`, 8 tiles, `VISIT_RADIUS`); "walked away — done" (`leave()`, `LEAVE_RADIUS` 6) — only for moves. Otherwise the cursor waits, the arrow leads to the step, and a step without a tile and without an item gets the "✓ Done — next" button (the reasons `LEFT`, `GATE`, `BLOCK` in the journal). The quest is complete — the cursor is not touched.
- **The highlight as in Quest Helper (2.26):** every stage line in `questStages.json` has the field `hl` = `{npc:[id], obj:[id], on:[object names], item:[names]}` (568 of 644 lines). The plugin (`ActiveTarget.Highlight`/`LineHighlight`, `OsrsPathBridgePlugin.applyLineHighlight/matches/track`) highlights exactly what the **current line** names: NPCs and objects in the world, items in the bag (`OsrsPathItemOverlay`). The source is the Quest Helper sources, the constants resolved by `runelite-api` (`javap -constants`); `scripts/qa.ts` (`stages-hl`) verifies the fields. Items on the ground (the White apron in Gerrant's shop) and 3 objects without a constant in the API are not highlighted.
- **The list in the game: the "Steps" / "Advice" tabs (2.26):** the program's advice (the red and the grey: "Do not take now", the weight, the bag does not fit, blockers) is moved to the "Advice · N" tab (`GuideList.tabRow/adviceRows`, `Kind.TAB`, `StepGuide.View.adviceTab`, the switch in the plugin — a click on the strip). On the "Steps" tab the recovery mode, the stage lines and "Needed now" stay; the "during the step" items (you will get them in the quest yourself) are not shown in "Needed now" (`pendingNow`).
- **Steps as in Quest Helper (2.27):** the stage cursor is now led by a state machine, not only by place and bag. `src/data/questMachines.json` (a plugin resource, copied by `build.gradle` next to `dangerZones.json`) — the order of checking the steps and the conditions of 32 quests, extracted from the Quest Helper sources: `stages[variable value]` → the `ConditionalStep` nodes (the conditions in order, the first one that is met and not locked wins, otherwise the default step) → a leaf = the name of a Quest Helper step. The conditions: items, zones, variables, `chat`/`mes`/`dlg` (chat messages, message windows, dialogue lines), `wt` (widget text, for example the quest journal 119:5/119:6), an NPC/object nearby; the "latches" (`latch`) — as `Conditions(onlyNeedToPassOnce…)`. Three values: yes / no / unknown (`?` — what the plugin cannot check, for example the arrow on an NPC): an "unknown" before a met condition — the machine does not decide. `QhMachine` is pure logic (`Facts` — what the plugin knows about the game), `QhLiveFacts` — the facts from the client (it remembers up to 300 messages from the start of the quest; they reset on a step change and on leaving the game). Every stage line in `questStages.json` has the key `k` — the name of a Quest Helper step (`ActiveTarget.StageLine.k`, goes to the plugin through `runeliteBridge.ts`); `QhMachine.lineFor` looks for the line by the leaf, the nested conditional steps around it and the parents from `addSubSteps` (`alias`). **The rule:** the machine's choice is evidence only when it is "strong" (made by a met condition, not by the default step) and the line was found; then `StageTracker.update(…, QhPick)` sets the cursor by itself, the earlier logic (place, items) is counted as before and decides when there is no evidence. A view "back" and a pressed "done" (`floor`) are stronger than the machine; the "done" button stays (if a message did not arrive, the player will not get stuck). The "sync" step (S2-09: open the quest journal) is a hint in the list (`qhHint`). The `qhMachine` setting ("Steps like Quest Helper") turns everything off. A new Quest Helper version = regenerate the machines: `tools/qh-machines` (Python; `fetch_qh.py` → `dump_consts.py` → `build_machines.py` → `golden.py` → `steps_info.py` + `export_fixture.py`, the order and the checks are in the folder's README; `build_machines.py --check` on a fresh clone gives a byte-identical file); `QhGoldenTest` compares Java with the reference (`qeval.py`) on 2700 checks. The data is checked against Quest Helper: a line's tile (`at`) and the NPC/object highlight (`hl`) match the step (`tests/questMachines.test.ts`, `tests/fixtures/qh-steps.json`); the known gaps are 30 Quest Helper steps without a line in the list and 45 unreachable lines (the ceiling is in the same test, it must not grow).
- **The window at the bank / Grand Exchange / a shop (2.24):** `ShopWindow` (pure logic: what to take, what to buy, where, prices; from the step list and the plan) + `OsrsPathShopOverlay` (draws next to the open `Bankmain`/`GeOffers`/`Shopmain` widget); the `shopWindow` setting. `InventoryCheckOverlay` is hidden while the window is open.
- **Auto-update (2.25):** `electron/updater.cjs` — a release from GitHub (`releases/latest`), the attachment `OSRS-Put-X.Y.Z-portable.exe` strictly from `bexaf3163/OSRS` (20–400 MB, sha256 from `digest`), a download next to the exe, a restart on a button; the "Check at start" setting; the UI — `UpdateBanner`, `SettingsExtra.UpdatesSection`, `lib/useUpdates.ts`, `lib/desktop.ts`. The data lies in `OSRS-Put-data` next to the exe and the new version picks it up by itself.
- The launch: `OsrsPathLauncher` (+ `electron/runelite-launcher.cjs`).

**The plugin settings** (`OsrsPathBridgeConfig`, the "In-game helper" section and others): `qhMachine`, `telemetryDetail`, `telemetryEventShots` (2.27), `port`, `hintArrow`, `worldMapMarker`, `highlightColor`, `completionSound`, `smartOverlays`, `showHud`, `showGuide`, `guideCollapsed`, `hudOpacity`, `hudLarge`, `overlayTheme` (2.32), `showChecklist`, `bigArrow`, `arrowSize`, `useShortestPath`, `showGeHelper`, `shareStats`, `autoNavigation`, `upgradeRouter`, `bankTagsHelper`, `bankHighlight`, `dangerRadar`, `dangerSound`, `smartPacing`, `hudPacing`, `hudHealth`, `stageFollow`. The config keys are stable: they are stored in the player's RuneLite profile.

**The bridge:** `BridgeServer.java` — HTTP `/status`, `/active-step`, `/shopping-plan`, `/nav-target`, `/bank-tags`, `/gear-hint`, `/prep-plan`, `/telemetry`, `/clear`, `/events` (SSE); it answers only on `127.0.0.1`, any `Origin` gets 403. The plugin version `PLUGIN_VERSION` must match `package.json`.

---

## 6. The file map

### The root
| File | Purpose |
|---|---|
| `package.json` | The version, dependencies, commands (see §8) |
| `vite.config.ts` | The build, the version substitution, the Content-Security-Policy |
| `index.html` | The window entry point, the early theme |
| `README.md` | The description, running, features |
| `PROJECT_GUIDELINES.md` | The binding working rules for the agent (language, safety, checks) |
| `CLAUDE.md` | The short project rules for Claude Code |
| `THIRD_PARTY_NOTICES.md` | The Quest Helper license and what was derived from it |
| `release-notes/vX.Y.Z.md` | The release notes (the GitHub Release is built from them) |
| `.github/workflows/checks.yml` | The "Checks" CI on every push |
| `.github/workflows/release.yml` | The "Release" CI: builds the exe when the version in `package.json` changes |

### The window root, `src/`
| File | What is inside |
|---|---|
| `App.tsx` | The frame: the header, the page switch (hash routing), the global observers of preparation and of the RuneLite link. |
| `bridge.tsx` | The RuneLite link state: whether it is on, whether the plugin is there, which step is shown in the game. The auto-mark from the game comes here: the step is marked, the next one goes to the game, the pages open it on their own.… |
| `env.d.ts` | The version from package.json, substituted at build time (vite.config.ts). |
| `main.tsx` | The React entry point: the providers (progress, the RuneLite link, the player state, the readiness engine). |
| `playerStateContext.tsx` | The single player state for the screens: one snapshot for everyone (readiness, shopping, preparation, one trip, goals) and the session resource journal. Recomputed only when the fingerprint changes — not on every render. |
| `readinessContext.tsx` | The single readiness engine for the screens: one for the whole app, recreated only when what affects the calculations changes (player state, step marks, quest points, mode, route). The calculations and answers are in… |
| `store.tsx` | The progress state: one source for the whole app, saving (localStorage + a file in the desktop app), undo. |
| `styles.css` | OSRS Path — minimalism: a warm neutral background, one accent (muted gold), 1px borders. The dark theme is a neutral graphite without a yellow-brown tint; gold only in accents. |

### The logic, `src/lib/` (pure functions without React — mostly covered by tests)
| File | What is inside |
|---|---|
| `accountSync.ts` | "Sync with the account": the game knows which quests are complete and which levels are reached, so the route steps with such an auto-tick can be closed at once, without waiting for the player to go through them with the plugin… |
| `bankTags.ts` | The stage's items for the bank: the OSRS Path Bridge plugin softly highlights them in the main RuneLite bank window (POST /bank-tags) while the stage's step is shown in the game. There is no separate tab and no import string: the… |
| `branching.ts` | A step's quick options for the player's stats: "⚡ You have Magic 25: Varrock Teleport". Levels come from RuneLite, and without it, from those entered manually on the skills page. The main route is not hidden: an option only adds… |
| `checklist.ts` | The departure check: whether everything from the step's items is in the bag before leaving the bank. The count comes from RuneLite (the OWNED event); the rules are the same as in the plugin (Checklist.java). |
| `clipboard.ts` | Copying to the clipboard: the Clipboard API, and if it is blocked (no focus, an old browser, desktop app restrictions) the old way through selecting text. |
| `desktop.ts` | The bridge to the desktop app (electron/preload.cjs). Without it (the page during development) everything works, only without RuneLite and the progress file. |
| `features.ts` | The stage 3 helpers in the app: they can be turned off in the settings, and then they not only hide but also do nothing: they look up no coordinates, send no stage items to RuneLite, offer no upgrades. What happens in the game… |
| `flash.ts` | A short "done" flash on a step row: when the mark was set by the game, not a click. |
| `foodAdvice.ts` | "Food for combat": how hard the step's opponent hits and when to eat. The numbers come from the wiki (threats.json, build-threats): max hit, speed, food healing. The only thing of our own is the threshold rule: eat while HP has… |
| `gearAdvice.ts` | The gear analysis for the screen: levels (from the game, which win over manual ones), what is worn, the bag and bank from RuneLite, Grand Exchange prices, whether the Al Kharid gate is free, what the route will still buy and who… |
| `goals.ts` | Goals by stage for skill levels. |
| `ledger.ts` | The resource journal: what increased and decreased during the session and why: gathering, buying, selling, a reward, moving to the bank, spending. It is built from the changes between state snapshots… |
| `ledgerStore.ts` | Storing the resource journal between sessions. The journal is separate for each profile and character: the gains of one account do not enter the totals of another. It lives in the window's storage (localStorage): the journal is a… |
| `magicPlan.ts` | What it costs to bring Magic to a goal with strike combat spells (Wind/Water/Earth/Fire Strike) and whether the staff pays for itself. Pure logic: the prices come from outside (the exchange), the spells from spells.json (wiki… |
| `map.ts` | The OSRS Wiki world map: tiles, floors and the step's points. The wiki's own map cannot be embedded: oldschool.runescape.wiki answers with X-Frame-Options: DENY and frame-ancestors 'none', so we draw the map ourselves from the… |
| `md.ts` | Inline guide markup: **bold**, `code`, [link](url). |
| `media.ts` | A media query as React state. The desktop app's scale changes the width for media queries honestly, so the layout switches on both the window size and the interface scale. |
| `moneyAdvisor.ts` | "How to make up the money": earning methods from the wiki (moneyMaking.json) that are available at the player's levels. Levels come from the game or are entered manually; what we do not know we do not invent but mark with "?".… |
| `navigation.ts` | One navigation target for everything: where the arrow in the game leads now, the big map shows the same. Before, the step map drew only the step's points, while the arrow could lead to a quick option (a teleport, a canoe), to a… |
| `next-step.ts` | Step availability and the choice of "What to do now". |
| `oneTrip.ts` | "One trip": preparation for the current step and several nearest ones together: one visit to the bank and the exchange instead of three. The items are collected from the requirements of the window's steps, what the player already… |
| `pacing.ts` | The training pace texts for the app (the same as the plugin writes in the micro HUD). |
| `places.ts` | Places from the wiki dossier to a point on the map and a temporary target for RuneLite. Pure functions without React and Leaflet: what to look for (a spawn line, a shop, a seller, a town), where the coordinates came from and what… |
| `playerState.ts` | The single player state: levels, items, coins, quests, position, mode: one snapshot for the whole app. Readiness, shopping, preparation, the navigation target and the change summary read it, instead of each taking its own pieces… |
| `playStyle.ts` | Play style: "calm" or "efficient". One setting that all the helpers read, instead of separate switches: - calm: less on the screen, nothing is pushed; training methods without risk and without extra clicks; - efficient: more… |
| `prepEnvelope.ts` | The state snapshot for the game: protocol 6 (POST /prep-plan). Before, the app sent the plugin five separate requests (the step, shopping, bank highlighting, gear advice, and the plan was counted in the app only for itself)… |
| `prepPlan.ts` | The preparation plan: one decision "what is needed before the step", from which the views are drawn: "What you need" in the app (and the in-game list and the bank check are moved onto it by protocol 6). It has no checks of its… |
| `prepQueue.ts` | The auto-queue for preparation: it lines up what to do before the step and leads the arrow first to the first thing, then to the second, until nothing is left, and then returns to the step. The player does not need to press… |
| `prepRoute.ts` | The preparation route for a step: what exactly to do before leaving, in what order, and the return to the step when all is ready. Built from readiness (readiness.ts): one state, no checks of its own. Preparation does not break… |
| `priceBook.ts` | Prices for estimating loot: fresh ones from the exchange (OSRS Wiki Prices), and until they arrive from the project's item database. The loot estimate is recounted at the current prices on every display and not fixed at the… |
| `profiles.ts` | Profiles: several characters, each with its own progress. The first profile ("Main") is stored where it was before (the key and the file did not change), so nothing is lost. The others are under the key progress:p:<id> and the… |
| `progress.ts` | Progress: storage, JSON export and import, migration of old saves, pure updates. No relative value imports: the module is used by both the tests and the app. |
| `qp.ts` | Quest points. |
| `quests.ts` | The list of quests from the route steps. A quest of several steps (Dragon Slayer I) is one entry. |
| `ranges.ts` | The "Training plan" row by skill level. |
| `readiness.ts` | Readiness for a step: whether there are enough levels, quests, items and coins, and what to do if not. One calculation on top of what the app already knows: levels from the game (or the profile), quest marks on the route, the bag… |
| `readinessEngine.ts` | The single readiness engine: once per state snapshot it counts readiness, the preparation route, the "fix everything" chain and "one trip", and remembers the answers. The step screen, the preparation observer, the queue and "what… |
| `recovery.ts` | Recovery mode: the player died, pressed a teleport in the middle of a step, or otherwise ended up far from where the step is. The route assumes the player stands where needed; after a setback "hit the zombie" or "go to the… |
| `requirements.ts` | The single requirements: a declarative description ("Ranged 20", "20 food: trout or salmon", "worn", "2000 gp") and one check against the player's state (playerState.ts). Preparation, the preparation route, gear and shopping are… |
| `review.ts` | V2 Review: completed steps in which important requirements appeared in V2 that the user has not checked yet. |
| `router.ts` | Hash routes: they work on GitHub Pages and from any folder without server setup. |
| `search.ts` | Global search over steps, the item database, skills, training rows and the reference. |
| `session.ts` | The session summary: what changed since the app received the first levels and XP from the game. |
| `shopping.ts` | The Grand Exchange bulk list: one purchase for several steps ahead instead of trips to the exchange before each. The items are collected from the itemsRequired of the selected steps, identical ones are summed by ID (without an… |
| `shortText.ts` | Short text for the game screen: one line instead of a paragraph. The game needs "what to do now", while the details (dialogues, explanations, warnings) stay in the app and in the hover hint. Quest steps (data/questStages.json)… |
| `sourceRouter.ts` | Where to get an item: one queue of sources for any thing (not only gear), in order: in the bank, already in the bag, free nearby, a shop, the exchange, a drop from opponents. A shop slightly dearer than the exchange (up to… |
| `stepPlaces.ts` | The places of a step: the step point, the places from the step map, where items come from (an NPC or a shop from the place dictionary) and the quest NPCs. One layout for the app and the game: the same places — as points on the… |
| `styleGear.ts` | "What to wear for magic and ranged": the wiki's recommendations (styleGear.json, build-style-gear) for your levels, quests and wallet. The wiki's slot options go from the best to the available. We take the best suitable one that… |
| `targets.ts` | Level targets from a step title: "Fishing to 20 and Cooking to 15" → fishing 20, cooking 15. No relative imports: the file is used by both the app and the check scripts in Node. |
| `telemetryReport.ts` | Parsing the plugin's debug journal (osrs-path-telemetry/session-*.jsonl): it is used to find errors without replaying the game. The plugin writes one JSON line per event (Telemetry.java); here: reading, finding oddities and a… |
| `theme.ts` | The theme: light, dark or as in the system. The early choice before rendering is in index.html. |
| `trainingNav.ts` | The in-game arrow for a training method: the point is taken only from the place dictionary by the method key — without guessing from the text. |
| `trainingRouter.ts` | "What to train with": by level, goal, game mode, items and play style (calm / efficient) it picks a training method for the skill and shows the path to the goal. The methods are in src/data/trainingMethods.json (OSRS Wiki and the… |
| `travel.ts` | "How to get there": from the player's position (the plugin, /status → pos) to the step target — on foot, by teleport or by canoe. The distances are straight lines (the obstacles are unknown), so this is a comparison of options… |
| `triggers.ts` | How to explain an automatic step mark: "The step will be marked by itself when …". One phrase for any condition — a quest, levels, items or a combination of them. |
| `ui-scale.ts` | The font size (everywhere) and the interface scale (in the desktop app). The font size changes the root font-size: all fonts are set in rem and the layout is not, so large text does not inflate the whole interface. The interface… |
| `usePrep.ts` | The state of the preparation detours: kept in the window (separately for each profile) and survives a refresh and a restart. |
| `useRecoveryTracker.ts` | The recovery mode for screens: watches the MOVED events from the game (death, teleport), decides whether it is a derailment (lib/recovery.ts); while it is a derailment, asks the plugin every half minute where the player is: near… |
| `useUpdates.ts` | The auto-update state for the window: a subscription to the main process (electron/updater.cjs). Without the desktop app — null. |
| `wealth.ts` | Money and stock: exact coins separately from the item estimate. Coins in the bag and bank are a fact from the game; items are "~" at exchange prices (the plugin's estimate through RuneLite prices), this is not money until they… |
| `weight.ts` | Weight and running. The weight of the bag and equipment decides how fast the run energy bar drains. The formula is from the OSRS Wiki "Run energy": loss per tick = floor(60 + 67 · clamp(weight, 0..64) / 64) × (1 − Agility / 300).… |
| `xp.ts` | The standard OSRS XP formula. check-data compares it with the "How much XP is needed per level" table in src/data/xp.json. |
| `xpRate.ts` | The XP rate from the plugin's measurements: skill XP arrives every ~3 seconds while training goes on. The speed is the gain over the measurement window (up to 10 minutes), only when the player is really training: after two… |

### Cards and blocks, `src/components/`
| File | What is inside |
|---|---|
| `AccountSync.tsx` | "Sync with the account": the game knows the completed quests and the levels reached — steps with such an auto-mark can be closed at once. It only marks (removes nothing) and has undo. |
| `Blocks.tsx` | Guide blocks: paragraphs, lists, tables. |
| `BranchSuggestions.tsx` | "⚡ A quick variant for your stats": a teleport, a canoe, a shortcut — if the level allows. Levels — from RuneLite, and without it — entered by hand in "Skills". The step's ordinary path stays as it is. |
| `BridgeIndicator.tsx` | The RuneLite link indicator in the header: 🟢 the bridge is active / ⚪ offline. It leads to the link settings. While the link is turned off in settings there is no indicator — those who play without the plugin do not need it. |
| `DensityToggle.tsx` | The density switch: in the header — one icon button, in settings — labelled options. 🧘 Zen (default): the current step, one status line, the "Done" button and critical warnings. 🔍 Inspector: all the step card blocks are expanded… |
| `FoodAdvice.tsx` | "🍖 Food for combat": how and when the step's opponent hits (wiki) and what food you already have. Health — from the game or from the skills page. |
| `GearHintSync.tsx` | Gear advice — into the game (POST /gear-hint). The HUD line ("⚡ Stronger: Steel scimitar from Zeke…") and the highlight in the bag and bank — only while an unfinished combat step is shown in the game and its advice is not… |
| `GearPrompt.tsx` | "⚔️ Stronger in combat": on a combat step — what to wear or buy to hit the step's opponent faster. The analysis is gearAdvisor (OSRS Wiki damage formulas, the opponent's defence from the wiki). The button leads the in-game arrow… |
| `HeaderProgress.tsx` | Progress in the header: a ring "how much is done" and quest points. The ring is a link to "Path". |
| `Icons.tsx` | One-colour icons: stroke = currentColor, the size is set by CSS. |
| `InGamePanel.tsx` | "🧭 Show in the game": the step goes to the RuneLite plugin — the arrow, the highlight of NPCs, objects, tiles, the needed dialogue options and items. Below — what exactly will be highlighted. |
| `Inline.tsx` | The inline markup of the texts in React without innerHTML: **bold**, `code`, [link](url or #/page) and step codes → links. |
| `LevelInput.tsx` | A skill level: a number with − and + buttons. Saved at once. |
| `LiveXp.tsx` | The XP from the game to the goal: how much is left and in how many minutes at this session's pace. The pace is from measurements only (at least half a minute of gain is needed): without them the time is not invented. |
| `MagicPlan.tsx` | "Magic to the goal: how many spells and what it costs" — for steps with `magicPlan` (S2-04). Prices — from the exchange, XP — from the game (or by level); without prices and the game link the calculation is still shown, but… |
| `ModeToggle.tsx` | The game mode switch in the header: [ 🛡️ F2P \| 👑 Members ]. Members adds stages 7–9, members skills and the members alternatives in the F2P steps. |
| `MoneyGoal.tsx` | "💰 Step goal": how many coins you already have and what selling the loot gives — for earning steps (S1-13, S3-06). Coins are exact, from the game; items are "~" at exchange prices. Without an open bank we do not invent progress. |
| `MoneyPlan.tsx` | "💰 How to make up the money": money-making methods from the wiki for the player's levels, on steps where money is needed (moneyGoal, magicPlan). The revenue is the wiki's estimate at exchange prices on the snapshot date and with… |
| `NavigateButton.tsx` | "🧭 Point the arrow in the game": a temporary target in RuneLite — the arrow, the Shortest Path route and the HUD lead to the place, and on arrival (or after buying the needed item) the player sees their step again. Coordinates… |
| `NextStepCard.tsx` | "What to do now" — the main element of the "Path" screen. |
| `OneTripCard.tsx` | "🧳 What you need": the preparation plan for the step and the nearest three (lib/prepPlan.ts) — one decision, and this is the block that shows it. For each thing you see where it is (worn / in the bag / in the bank / missing / not… |
| `PacingLine.tsx` | The training pace from the game: "🐟 34 shrimps to 20 Fishing · ≈ 7 min". The RuneLite plugin counts it from XP; while there are few measurements, the time is not invented — "calculating the time…". In combat (attack, strength… |
| `PageBoundary.tsx` | A page change clears the error: a broken section must not lock the others. |
| `PlaceMap.tsx` | Places from the wiki dossier — onto the map and into the game: "📍 Port Sarim" opens the world map with a marker and the source caption, "🧭" leads the RuneLite arrow there. Coordinates — only from place search (dictionary → OSRS… |
| `PluginUpdateNote.tsx` | The plugin in RuneLite is older than the app: there is a link but no new features. The app starts RuneLite with the plugin from its folder, and an already running RuneLite keeps the plugin it started with — after the app update… |
| `PreflightPanel.tsx` | "🧳 Departure check": which of the step's items are already in the bag — from RuneLite data, with no manual refresh. A step is checked when it is shown in the game ("Show in the game"): the plugin counts the bag and bank for it… |
| `PrepRoute.tsx` | "The preparation route": what to do before setting off, in order — one main thing, then no more than two, and the return to the step. The queue is built and started by itself (PrepAuto): the arrow leads for what is missing — to… |
| `PrepSync.tsx` | The preparation plan — into the game (protocol 6). The app computes it for the "What you need" card (prepPlan.ts); the same plan goes to the plugin in the shared snapshot, and it draws the readiness percent, "do not take now"… |
| `ProfileBanner.tsx` | The game has a different character than the active profile: levels and marks from the game are not written until the player chooses. |
| `ProgressBar.tsx` | A progress bar. |
| `RangeHints.tsx` | The matching row of the "Training plan" for a step — by the current levels. |
| `ReadinessPanel.tsx` | "Readiness for a step": a traffic light and what to do before setting off — each problem has its own action. The calculation is lib/readiness.ts; here only the display. A step without requirements and items gets no panel. |
| `SearchBox.tsx` | The global search: a window over the page, opened by the header button or the "/" key. The results are in groups: the walkthrough steps, the item database (with the exchange price), skills and the reference, the OSRS Wiki. |
| `StageSection.tsx` | A stage section with its list of steps. |
| `StepCard.tsx` | The step card: the header in the list and the details by section. The order: status → title → context (NPC, place) → items → actions → tips → completion. |
| `StepImage.tsx` | A diagram or screenshot inside the step card: a collapsible block and a full-size view. |
| `StepMap.tsx` | The map in the step card: a preview from OSRS Wiki tiles, a point switch and the full-screen world map. The chosen point is one state for the preview, the switch and the world map: they always show the same place. |
| `StepStatus.tsx` | The "unified status" of a step instead of a stack of plaques: one line — 🟢 Ready to set off · [Start the step] 🟡 Preparation required (3 items) · [Fix] [More] "More" expands an accordion with tabs (preparation, gear, food, route… |
| `StyleGear.tsx` | "🛡 What to wear for magic / ranged": the wiki's advice by slot for your levels and coins. Prices — the exchange; what is worn — from the game. |
| `Table.tsx` | The index of the highlighted row. |
| `ToastView.tsx` | A pop-up message with an "Undo" button. |
| `TrainingCard.tsx` | "🎯 What to train with": a skill training method up to the goal — by level, mode, items and play style (calm / efficient). The calculation is lib/trainingRouter.ts; here only the display. It starts and buys nothing: the arrow is… |
| `TravelPlan.tsx` | "🧭 How to get there": where you are now (the plugin) and how best to reach the step's place — on foot, by teleport or by canoe. What is available is counted from the levels and items from the game; what we do not know (the bank… |
| `UpdateBanner.tsx` | At the top of the window: a new version is out. The player installs it with a button; the download goes in the background, no data is lost. |
| `UpgradePrompt.tsx` | "⚡ SPEED UPGRADE": before a long training — a cheap better tool, if the level already allows. Weapons and armor on combat steps are advised by GearPrompt (the gear analysis). The button leads the in-game arrow to the seller (a… |
| `WikiDrawer.tsx` | The built-in wiki inspector: an item or NPC dossier. On a wide "Path" screen it is a pinned third column, otherwise a slide-out panel on the right. Opened by a click on an item/NPC in the step card or from the search; closed by… |
| `WorldMapModal.tsx` | The full-screen world map: OSRS Wiki tiles in Leaflet, the step point markers, switching of points and floors. Loaded as a separate chunk only by the "World map" button — Leaflet does not weigh down the start. The wiki's map page… |

### Screens, `src/pages/`
| File | What is inside |
|---|---|
| `Gear.tsx` | "⚔️ Gear": what is worn, how hard it hits and what to do to hit faster — wear the best from the bag and bank, buy from a trader or at the exchange, save up. It is counted by the OSRS Wiki damage formulas against the opponent of… |
| `Goals.tsx` | The "Goals" screen: the levels for each stage. |
| `Path.tsx` | The collapse time of a card (like the transition of .collapse) — after it the layout has settled. |
| `PathWide.tsx` | "Path" on a wide screen (redesign D): on the left a ribbon of stages with steps, in the centre the chosen step, on the right the pinned wiki dossier. The whole route, the step and the dossier are visible at once, without page… |
| `Quests.tsx` | The "Quests" screen: the route quests, the quest points and what they unlock. |
| `Reference.tsx` | A guide diagram (mermaid) as a list with "→", grouped by source. |
| `Settings.tsx` | The "Settings" screen: appearance, the RuneLite link, helpers, progress export and import. |
| `SettingsExtra.tsx` | The 2.12 settings: character profiles, a scheduled progress copy, the session summary and "Diagnostics". |
| `Shopping.tsx` | "🛒 Grand Exchange shopping list": one purchase for several stages ahead. The prices come from the same OSRS Wiki price service as the item inspector; what you already have — from RuneLite. You have to buy yourself: the app only… |
| `SkillDetail.tsx` | The default goal: the stage goal or the end of the current plan row. |
| `Skills.tsx` | The list of skills: the free and the members ones with their training plans. |

### Services, `src/services/` (the network, the bridge, the gear analysis)
| File | What is inside |
|---|---|
| `gearAdvisor.ts` | Gear analysis: what is worn, how hard it hits at your levels and what to do to get stronger — wear the best from the bag or bank, buy from a trader or at the exchange. The order: the free first, then the weapon (combat speed… |
| `gearUpgradeRouter.ts` | A smart tool upgrade before a long training: the player already has 6+ Woodcutting, and in hand is a bronze axe — suggest a Steel axe from Bob in Lumbridge for ~200 gp and return to the step when the axe is bought. Weapons and… |
| `locationResolver.ts` | The coordinates of a place by its name — for the "📍" in the item inspector, the world map and the RuneLite arrow. |
| `pricesApi.ts` | Grand Exchange prices from the OSRS Wiki Prices API. One request gives the prices of all items, so we keep them in memory (a Map) and refresh no more often than once in 5 minutes. |
| `runeliteBridge.ts` | The link to the RuneLite plugin "OSRS Path Bridge" on this computer: http://127.0.0.1:38282. Requests go through the Electron main process (preload → ipc): the plugin accepts only them, and a request from a page in a browser… |
| `wikiApi.ts` | Requests to the OSRS Wiki: the item card, shops, drops, spawns, NPCs. Shared code for the app (live requests) and scripts/build-items.ts (building the local database). No relative imports: the file runs both in Vite and directly… |
| `wikiService.ts` | An item and NPC dossier for the built-in wiki inspector. First the local database (f2p-items.json), then a live wiki search. Exchange prices are always live. |

### Electron, `electron/`
| File | What is inside |
|---|---|
| `main.cjs` | The desktop shell of OSRS Path: the same app from dist/ in a separate window. The data is in the app folder (%APPDATA%\OSRS Path), and for the portable version — next to the exe (OSRS-Put-data). The progress is stored twice: in… |
| `preload.cjs` | The bridge between the window and the app: scale, "always on top", the progress file and the link with the RuneLite plugin. The window works in a sandbox — only these functions are exposed, without access to Node. |
| `progress-files.cjs` | The progress file: reading with a broken file set aside and a copy of the last whole state; the hourly copies (`dailyBackup`, `latestCopy`) into `%APPDATA%\OSRS Path\progress-copies` and `restoreFromCopies`, which refills a fresh data folder at launch. The write already goes through a temporary file (main.cjs), so corruption is unlikely; but if the file still does not parse, it must not… |
| `runelite-bridge.cjs` | The link of the window with the RuneLite plugin "OSRS Path Bridge" (http://127.0.0.1:38282) through the main process. The window does not go to localhost itself: this way there is no CORS, and a turned-off RuneLite does not spray… |
| `runelite-launcher.cjs` | Starting RuneLite with the OSRS Path Bridge plugin right from the "OSRS Path" app. Nothing is downloaded: Java is from the installed RuneLite (%LOCALAPPDATA%\RuneLite\jre), the client classes are from its own cache… |
| `updater.cjs` | Auto-update of the portable version: compares the version with the latest GitHub release, downloads the new exe next to the old one, checks the size and checksum and, on a button, restarts the app from the new exe. The data is in… |

### Scripts, `scripts/`
| File | What is inside |
|---|---|
| `analyze-telemetry.ts` | Analysis of the plugin debug journal: `npm run telemetry` reads the latest session from ~/.runelite/osrs-path-telemetry (or the file/folder passed as an argument) and prints the findings: engine oddities, where the cursor stood… |
| `build-bridge-jar.ts` | npm run bridge:jar — build the RuneLite plugin jar (runelite-bridge/build/libs/osrs-path-bridge.jar), which the desktop app puts into the exe and starts together with the installed RuneLite. JDK 17 is needed: JAVA_HOME or… |
| `build-gear.ts` | Builds src/data/gear.json from the OSRS Wiki: the free-version melee weapons and armor, amulets and what is handed out on Tutorial Island. And src/data/monsters.json — the defence of the opponents from the route steps (foes)… |
| `build-items.ts` | Builds src/data/f2p-items.json from the OSRS Wiki and fills in wikiItemId and iconUrl for the items in steps.json. It needs a network. Run: npm run build-items (about 2–4 minutes, the wiki asks not to hurry). |
| `build-locations.ts` | Builds src/data/majorLocations.json — a dictionary of key places for the "📍" in the item inspector and the map. It needs a network. Run: npm run build-locations (about a minute). |
| `build-money.ts` | Builds src/data/moneyMaking.json from the OSRS Wiki: the free-version money-making methods (the "Money making guide/ Free-to-play" list and the Mmgtable card of each article). It needs a network. Run: npm run build-money (about a… |
| `build-style-gear.ts` | Builds src/data/styleGear.json from the OSRS Wiki: what to wear for magic and ranged in the free version — the block "Recommended equipment" of the articles "Free-to-play Magic training" and "Free-to-play Ranged training". It… |
| `build-threats.ts` | Builds src/data/threats.json from the OSRS Wiki: the max hits and speed of the step opponents (Bucket infobox_monster) and how much health the free-version food restores (the first phrase "restores N Hitpoints" in the article).… |
| `build-weights.ts` | Builds src/data/weights.json from the OSRS Wiki: the item weight in kilograms (Bucket infobox_item, the weight field) — for the preparation plan: how much the bag and the worn items weigh, what is better left in the bank on a… |
| `check-data.ts` | npm run check-data — the checks of the V2 route and the static data (skills, goals, XP). No network. |
| `check-links.ts` | Checks that all the wiki links from steps.json, f2p-items.json and reference.json lead to existing articles and files. It needs a network. Run: npm run check-links |
| `check-runelite-compat.ts` | Checks that the built plugin is compatible with the RuneLite INSTALLED on the player's machine: all its references to net.runelite.* exist in the client jar. Needed: JDK 17 (javap, javac), a built plugin (./gradlew build) and… |
| `e2e-electron.ts` | An end-to-end check of the real Electron: the window opens, the bridge answers, the progress is written to disk as a file. Run: npm run build && npm run test:e2e (a display is needed — it does not run on CI; locally on… |
| `gear-requirements.ts` | The wearing requirements from the OSRS Wiki article text. They are not in the wiki data (Bucket) — only in the text, so here is a parse of the sentences about wearing: "requires 20 [[Ranged]] to equip", "requires 40 [[Defence]]… |
| `make-icons.ts` | Draws the app icons without libraries: a 512 PNG — the window and exe icon, an SVG — the logo in the header. Run: npm run icons. The result is in public/ and is kept in the repository. |
| `money-parse.ts` | Parsing of the wiki markup and rendered HTML for scripts/build-money.ts — kept apart to be checked by tests without a network. |
| `paths.ts` | The V2 route — kept right in the JSON. |
| `qa.ts` | A consistency check of the data and texts: one set of rules for `npm run check-data` and for the tests. The rules catch what has already broken the app: a Coif without the 20 Ranged requirement, two "main" amulets in one route, a… |
| `RuneLiteCompat.java` | A binary compatibility check of the plugin with the installed RuneLite: every reference of the compiled plugin to net.runelite.* (a method, field, constructor) must exist in the client jar. This catches a breakage like… |
| `style-gear-parse.ts` | Parsing of the wiki {{Recommended equipment}} block for scripts/build-style-gear.ts — kept apart to be checked by tests without a network. |
| `ui-smoke.ts` | npm run test:ui — a run of the interface in a real browser (Chromium through Playwright), as the player has it in the exe: the built page, a stub desktop app (window.osrsDesktop) and a stub RuneLite bridge. The network to the… |
| `validate.ts` | Data checks: the V2 route (steps.json, stages.json, f2p-items.json) and the skills, goals, XP, plugins and reference data. Used by check-data.ts and the tests. No network. |

### The RuneLite plugin, `runelite-bridge/src/main/java/com/osrspath/bridge/`
| File | What is inside |
|---|---|
| `ActiveTarget.java` | The current step sent by the app: the same as InGameTarget in src/types/index.ts, plus the step's code and title. Gson fills the fields; the sets for fast comparison are built by {@link #prepare()}. |
| `ArrowGeometry.java` | The big arrow to the target: how to turn it on the screen and what state it is in. |
| `AutoCompletionManager.java` | Auto-tick of the current step. Only conditions that are known in advance and tested: <ul> <li>QUEST_COMPLETED: a quest with this name is in the FINISHED state (Quest.getState in RuneLite);</li> <li>SKILL_LEVEL: real skill levels… |
| `BankSnapshot.java` | The last known bank contents: remembered so that after a RuneLite restart the bank is not "unknown" until you open it again. Stored in the RuneLite profile settings (a separate one for each character) as the string {@code… |
| `BankTags.java` | The stage's items for soft highlighting in the bank (POST /bank-tags): everything needed in the stage is visible right in the main bank window, without a separate Bank Tags plugin tab and an import string. An empty list clears… |
| `BridgeServer.java` | Local HTTP bridge for the "OSRS Path" app. Listens on 127.0.0.1 only. |
| `Checklist.java` | The departure check: is everything for the step in the bag (or worn), and for what is missing, is it in the bank. Pure logic without RuneLite: src/lib/checklist.ts in the app repeats it. |
| `DangerRadar.java` | The danger radar: zones from src/data/dangerZones.json (Gradle puts it in the jar) and the player entering/leaving. |
| `DebugView.java` | The developer badge (Ctrl+Shift+D): the engine status in green and red over the game screen: {@code ActiveStep: S2-05 \| Stage: 3/9 \| Cursor: 2/5 \| Trigger: Item(Lobster ×5) = FALSE \| QueueDepth: 1}. Only the row layout by… |
| `EngineWatchdog.java` | The engine watchdog: looks in what the player sees for states that should not exist, and writes them to the log and the developer badge. It repairs nothing and changes nothing, it only notices: |
| `GearHint.java` | The app's gear advice (POST /gear-hint): a line for the HUD ("⚡ Wear Iron scimitar - it is in the bank"), items to report the bank count of (they go into the OWNED event), and items to highlight in the bag and bank. There may be… |
| `GrandExchangeHelperOverlay.java` | The Grand Exchange hint: the bulk list from the app, what you already have, what is in an order and what to search for next. |
| `GuideList.java` | The "What you need" list right on the game screen, under the HUD: the step's items (have, in bank, missing, during the step) with "where to get it" and the step's points with NPCs. A line with a place is a button: a click sets a… |
| `GuideMouse.java` | Clicks on the "What you need" list on the game screen. A left click on a line with a place gives the arrow and path there (the action goes to the client thread), a click on the heading collapses or expands. A click on the list… |
| `InventoryCheckOverlay.java` | The departure check with the bank open: "✓ Rope 1/1", "✗ Cooked chicken 2/5 · +3 HP", "not in bank". The counting is in the plugin, from ItemContainerChanged events; here it is only shown. What is needed is highlighted in the… |
| `ItemCounts.java` | How many of which items are in a container (bag, worn items, bank). Computed once per ItemContainerChanged event, not every frame. An item is looked up by ID, and if there is no ID or it differs (the wiki and the game sometimes… |
| `MoveDetector.java` | An abrupt jump of the character: a teleport, a respawn after death. A step on the ground is at most two tiles per tick, so a jump of {@link #JUMP} tiles or more is not walking. Going down a ladder also "jumps" (underground the… |
| `Navigation.java` | The distance and direction to the target for the micro HUD, and the step's waypoints. This is the straight-line distance between coordinates, not the number of steps along the road: the real path is drawn by Shortest Path or the… |
| `NavTarget.java` | A temporary target over the step: a place from the app's map ("📍 Port Sarim") or a shop for an upgrade ("Buy a Steel axe from Bob"). The arrow, Shortest Path and the HUD lead to it; the step does not go away and returns by itself… |
| `OsrsPathArrowOverlay.java` | The big arrow to the current target: top centre of the screen, over the scene but under the game windows, so it does not cover the minimap, chat and bag and does not get in the way of clicks. It turns with the camera, like the… |
| `OsrsPathBridgeConfig.java` | Big arrow size: the circle's diameter in screen pixels. |
| `OsrsPathBridgePlugin.java` | The Shortest Path plugin (Plugin Hub): its public API is a PluginMessage in the "shortestpath" namespace. |
| `OsrsPathDangerOverlay.java` | The danger radar in the 3D world: a red zone border while the player is closer than 20 tiles to its centre, and a red outline on dangerous NPCs while they are in the warning zone. Inside the zone the border is denser. |
| `OsrsPathDebugOverlay.java` | The developer badge: the engine status in green and red over the game screen. Hidden until you turn it on (by default Ctrl+Shift+D, the "Developer" setting). {@link DebugView} lays out the lines; here is only the drawing: a dark… |
| `OsrsPathGuideOverlay.java` | The "What you need" list on the game screen: under the HUD, top left (draggable with Alt). {@link GuideList} computes the lines; the line under the mouse is highlighted, with a hint for it at the bottom. After each frame the list… |
| `OsrsPathHudOverlay.java` | The micro HUD: the step's code and name, the current target and the distance to it. Top left, under the game windows, draggable with the mouse while holding Alt (like any RuneLite plate). |
| `OsrsPathItemOverlay.java` | The step's items in the inventory and bank: a frame along the cell's edge with a soft pulsation, the item itself is not covered. In the bank, also a green fill on what the departure check says to take into the bag, and a quiet… |
| `OsrsPathLauncher.java` | Launching RuneLite with the OSRS Path Bridge plugin: done by the "OSRS Path" app (electron/runelite-launcher.cjs). The client classes are taken from the installed RuneLite (~/.runelite/repository2), Java from its own jre folder.… |
| `OsrsPathPanel.java` | The "OSRS Path" side panel in RuneLite: the step, what you need (in the bag, in the bank, missing) and where to get it, the step's points. "Go here" sets a temporary target: the arrow and Shortest Path lead there, and on arrival… |
| `OsrsPathShopOverlay.java` | A separate window next to the bank, exchange and merchant windows: what to take, what to buy and where it is sold. The list is built by {@link ShopWindow}; here: which game window is open, where to put the card (beside the game… |
| `OsrsPathWidgetOverlay.java` | The right option in the dialogue menu: a frame around the line and an arrow ▶ on the left. And the upgrade item in a shop. The options menu is the component InterfaceID.Chatmenu.OPTIONS (219:1) from RuneLite 1.12.39's gameval… |
| `OsrsPathWorldOverlay.java` | Highlighting in the 3D world: the outline of the step's NPCs and objects with a label, tiles from groundTiles and the step's point. The plugin collects whom to highlight from spawn events; here is only the drawing of what has… |
| `OverlayCard.java` | The look of the plugin plates: a dark rounded card with a coloured strip on the left (the colour is the state: gold, green, red) and a thin border. Instead of PanelComponent's flat brownish background. |
| `OverlayText.java` | Plugin plate text: one font for the whole line and wrapping to the panel width. |
| `PacingSet.java` | The pace of a step by one skill or by several with one goal, in combat: Attack, Strength, Defence to 30. They are trained in turn, switching the attack style, so the skill that is growing now is shown. While no XP has been… |
| `PacingTracker.java` | Training pace: how much XP and how many actions are left to the step's goal and about how long that will take. |
| `PrepEnvelope.java` | The state snapshot from the app: protocol 6, POST /prep-plan. One request instead of five (/active-step, /shopping-plan, /bank-tags, /gear-hint, the preparation plan): the plugin applies everything in one pass of the client… |
| `PrepPlan.java` | The preparation plan the app has already computed (protocol 6, part of the /prep-plan snapshot): the readiness percentage, for each item the importance, the deadline, whether the supply is enough and what to do; "don't take now"… |
| `QhLiveFacts.java` | Game facts for the Quest Helper state machine: what the client sees now, and the messages since observation began. Read only on the client thread. |
| `QhMachine.java` | The quest state machine: the conditions by which Quest Helper chooses the current stage step. The data (src/data/questMachines.json) is built from its sources; here it is executed the same way: conditions are checked in turn, the… |
| `ShoppingPlan.java` | The Grand Exchange bulk list from the app: what to buy several steps ahead. The plugin only shows it at the exchange and counts what you already have; it buys nothing itself. |
| `ShopWindow.java` | The bank, exchange and shop window: what the step needs right here. At the bank, what to take (and what the bank lacks); at the exchange and at a merchant, what to buy and where it is sold. For any quest: the same item list of… |
| `ShortText.java` | One short line instead of a paragraph for the game screen: the game needs "what to do now", the details stay in the app and in the hover hint. The app sends a ready short text for the step (field s); this fallback is for when… |
| `SmartView.java` | The "smart reveal" of the overlays: what to show in the game now. The game is the operational level: where to click, how many tiles are left, whether they are hitting. Everything else (what to buy in bulk, where to get it… |
| `StageTracker.java` | Where the player is within a quest stage: the current step of the list. The cursor is counted only from what is visible in the game; it is moved by facts, not by clicks, otherwise it is easy to click past a step and lose track of… |
| `StepGuide.java` | What the "What you need" list in the game and the "OSRS Path" side panel show: the step's items (whether you have them: bag, bank), where to get them and which point to aim the arrow at, and the step's points. Pure logic: the… |
| `Telemetry.java` | The debug log: what the plugin's engine did while you played. One JSON line per event into the file {@code osrs-path-telemetry/session-DATE.jsonl} next to the RuneLite settings: step and stage changes, where the cursor moved and… |

### Data, `src/data/`
| File | What is inside | How it is updated |
|---|---|---|
| `steps.json` | The 69 route steps (titles, NPCs, items, quick steps, `inGame`, branches, `pacing`, `moneyGoal`…) — **the source of truth of the route** | by hand; `build-items` sets the item ids/icons |
| `stages.json` | The 9 stages | by hand |
| `questStages.json` | The stages of 32 quests: varp → stage → steps with tiles, `go`, the stage items, `has` / `need` | built from Quest Helper (scripts outside the repository) + hand-written texts |
| `questMachines.json` | The Quest Helper state machines for 32 quests (nodes, conditions, latches) + `alias` from `addSubSteps`; a plugin resource | `tools/qh-machines` (from the Quest Helper sources); checked by `QhGoldenTest`, `tests/questMachines.test.ts` |
| `f2p-items.json` | 203 items: the dossier, prices, shops, drops | `npm run build-items` (network, ~40 min without the cache, **rewrites steps.json**) |
| `gear.json`, `monsters.json` | Gear (135 items) and opponents | `npm run build-gear` |
| `threats.json` | The max hit, the speed, the food healing | `npm run build-threats` |
| `styleGear.json` | What to wear for magic and ranged | `npm run build-style-gear` |
| `moneyMaking.json` | Earning methods | `npm run build-money` |
| `majorLocations.json` | The place dictionary (126) | `npm run build-locations` |
| `npcLocations.json` | NPC positions | by hand |
| `trainingMethods.json` | 61 training methods | by hand from the wiki |
| `weights.json` | The weight of 297 items, kg | `npm run build-weights` |
| `toolProgression.json` | The axe and pickaxe tiers | by hand |
| `dangerZones.json` | The radar zones | by hand (from the wiki, not measured) |
| `transport.json` | Teleports, canoes, boats | by hand |
| `spells.json` | The spells for the magic plan | by hand |
| `skills.json`, `members-skills.json`, `levels.json`, `goals.json`, `xp.json`, `plugins.json`, `reference.json` | Skills, levels, goals, the XP table, plugins, the reference | by hand; `check-data` verifies them |
| `index.ts` | Typed access to the data | — |

---

## 7. Tests

| Suite | Where | What it covers |
|---|---|---|
| Vitest (616) | `tests/*.test.ts` | the logic: the player state, readiness, requirements, preparation, one trip, shopping, the journal, gear, amulets, navigation, the bridge, progress, the map, places, data gaps (`qa.test.ts`), random garbage on input (`fuzz.test.ts`) |
| The golden snapshot | `tests/readiness.golden.test.ts` + `tests/fixtures/readiness.golden.json` | readiness over all steps × scenarios; update with `UPDATE_FIXTURES=1 npm test` |
| The plugin fixture | `tests/activeSteps.fixture.test.ts` → `runelite-bridge/src/test/resources/active-steps.json` | the step targets as the program sends them |
| The interface | `scripts/ui-smoke.ts` (`npm run test:ui`) | a real Chromium (Playwright), a `window.osrsDesktop` stub, widths 320–1920 |
| E2E | `scripts/e2e-electron.ts` (`npm run test:e2e`) | a real Electron with a bridge stub |
| Java | `runelite-bridge/src/test/java/...` (329 tests) | the HTTP/SSE bridge, the "What you need" list, the arrow, the radar, the pace, quest stages (`QuestStageTest`), the smart view (`SmartViewTest`), the overlay layout |
| The journal | `tests/telemetryReport.test.ts` + the sample `runelite-bridge/src/test/resources/telemetry-session.jsonl` (written by the Java test `TelemetryTest`; a new sample: `UPDATE_FIXTURES=1 ./gradlew test --tests '*TelemetryTest'`) | the journal format and the parsing rules on both sides |
| Data | `scripts/qa.ts` (+ `check-data`) | consistency: Coif=20 Ranged, amulets, quest stages (`need`), training methods, "Home Teleport" |
| Compatibility | `npm run check-runelite` | all the plugin's references to `net.runelite.*` exist in the installed client |

---

## 8. Commands and the release

| Command | What it does |
|---|---|
| `npm run dev` | development (Vite) |
| `npm run build` | types + the build |
| `npm test` | Vitest |
| `npm run check-data` | the data check |
| `npm run telemetry` | analysis of the plugin's debug journal (after a game): `-- --all`, `-- --json`, `-- path` |
| `npm run check-links` | wiki links (network) |
| `npm run test:ui` | the interface in a browser (needs `npm run build`) |
| `npm run test:e2e` | a real Electron |
| `npm run bridge:jar` | build the plugin jar (JDK 17) |
| `npm run check-runelite` | the plugin's compatibility with RuneLite |
| `npm run desktop` | run Electron from the sources |
| `npm run dist:win` | build the portable exe |
| `cd runelite-bridge && ./gradlew test` | the plugin tests (with the game running ~4–15 min) |

**The release:** raise the version in `package.json`, in `package-lock.json` (2 places) and `PLUGIN_VERSION` in `BridgeServer.java`, write `release-notes/vX.Y.Z.md`, push to `main` → the "Checks" CI + the "Release" CI → the exe in GitHub Releases. The release starts only on a version change in `package.json`.

---

## 9. What is not finished / not verified

- **Not verified in the live game** is everything made since 2.16.0 (and the developer plate, the hotkeys and the screenshots of 2.23.0 — they were not run in a live client): the quest stages and the arrow following the step, the "What you need" list after the edits, the preparation auto-queue, the "Smart reveal", the journal over several days.
- **Members gear** is not entered (verified IDs and requirements are needed).
- The upgrade estimate by saved time is not counted (there are no measurements).
- In the game "What you need" still shows the earlier list: the preparation plan (importance, deadlines, weight, recovery mode) is partly visible only in the program.
- The radar knows 4 zones; the coordinates are from the wiki.
- Quests without stages: Dragon Slayer I (S5-xx), Shield of Arrav (S3-05), Recipe for Disaster – Another Cook's Quest (S9-05).
- Training methods: up to level ~70 and 20 skills; Hunter/Construction/Slayer — only by the plan of the guide. The auto-arrow to a place — for 40 of 61 methods.
- The "return/hand in" steps without a `need` condition (S1-03, S3-03, S3-04…) are protected only by the general stage-change rule.
- Lazy loading of JSON is deliberately not done (a local program; the bundle is ~1.1 MB).
- A line-by-line proofreading of all the text has not been done (automatic rules exist).

---

## 10. Ideas for development (what can be suggested)

1. A live check and collecting remarks from the game — the most valuable next step.
2. A single "kit" for a stage (combat / tools / food / potions / teleports / quest items / money) with one button.
3. Members data: the Dragon axe/pickaxe, members armour and weapons — from verified wiki data.
4. Stages for Dragon Slayer and Shield of Arrav; `need` for the other "return/hand in" steps.
5. A preparation strip in the game HUD; a redraw of the list and HUD look (the owner finds it "not pretty").
6. More radar zones, measuring the radii in the game.
7. The resource journal: a chart by days, an export.
8. Training methods at high levels and for Hunter/Construction/Slayer.
9. The auto-update of the program — done in 2.25 (the repository is public now); it remains to be checked on a live pair of versions.
10. Component tests (jsdom) instead of only a run in a browser.

---

## 11. How to use this file in another chat

Attach this file and say what you want: "think of what to add to section X", "find weak places in Y", "rewrite screen Z". So that a change does not break the foundation, keep §2 (the principles) and §3 (the data flow) in mind: a new feature must read the single player state (`playerState.ts`), show "unknown" and not "no", and pass `npm test`, `npm run check-data` and `npm run test:ui`.
