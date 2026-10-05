# OSRS Path - Capabilities Map

> Encyclopedia of everything implemented in the repository `bexaf3163/OSRS` as of **version 2.30.0** (bridge protocol 6, plugin 2.30.0).
> Every module below was read from the source tree: `src/`, `electron/`, `runelite-bridge/`, `scripts/`, `src/data/`, `tests/`, `tools/`, `.github/`.
> Counts (files, config keys, datasets, tests) are produced by a generator that reads the files, not copied from older documents.

## 0. Conventions

### 0.1 Status tags

| Tag | Meaning | Evidence policy |
|---|---|---|
| `[PROVEN IN LIVE GAME]` | Confirmed in a running RuneScape client with the real plugin. | Release notes that record a live check (2.5.1, 2.11.1, 2.24-2.26 live fixes) and the 2026-10-05 session on a real PC with RuneLite 1.13.1 (character on world 316, quest Prince Ali Rescue, bridge `/status` handshake, in-game list, Tip tab, big arrow, side panel, account sync, progress copies). |
| `[VERIFIED VIA TESTS]` | Covered by unit/integration tests, golden fixtures, mocks or the browser UI smoke run, but not seen in a live game. | The default for everything else. |
| `[OFFLINE FALLBACK]` | Keeps working when the RuneLite bridge is offline (levels typed by hand, state shown as UNKNOWN, no in-game output). | Marked per module; offline never means "missing = none" (see 1.6). |
| `[NOT AUTOMATED]` | A build-time or network tool that is not run in CI and has no automated test of its own; its output is checked by `check-data` and the data tests. | Run by hand. |

A module can carry `[VERIFIED VIA TESTS]` and `[OFFLINE FALLBACK]` together, or `[PROVEN IN LIVE GAME]` and `[OFFLINE FALLBACK]`. A tag on a module describes its main behaviour; individual limitations are listed in section 8.

### 0.2 Naming map (requested vocabulary to real code)

| Requested name | What exists in the code |
|---|---|
| `preparationPlan` | `src/lib/prepPlan.ts` (`PrepPlan`, `PrepLine`, `PrepScore`, `PrepSlots`) |
| `requiredItems` | `PrepPlan.lines` (state `PrepWhere`: EQUIPPED / INVENTORY / BANK / MISSING / UNKNOWN; priority `PrepPriority`; timing `PrepTiming`) |
| `actionableRequirements` | `PrepLine.action` (`PrepAction`: TAKE, BUY, EARN, GATHER, CONNECT, UPGRADE; with optional `nav` target and `price`) |
| `futureNeeds` | `PrepPlan.soon` and `PrepPlan.later`, built from the look-ahead window of `oneTrip.ts` (`LOOK_AHEAD = 3` steps; the "efficient" style looks four steps ahead) |
| `negativeChecklist` | `PrepPlan.later` ("do not take now") plus `PrepPlan.weight` (what to leave in the bank) |
| `INVENTORY_OVERFLOW` | `PrepPlan.slots.over` (> 0 when required + protected items exceed `BAG_SLOTS = 28`), shown as "It will not all fit at once" |
| `gearAdvisor`, `gearUpgradeRouter` | `src/services/gearAdvisor.ts`, `src/services/gearUpgradeRouter.ts` |
| `sourceRouter` | `src/lib/sourceRouter.ts` (`SourceKind`: bag, bank, free, shop, ge, drop) |
| `NavigationTarget` | `src/lib/navigation.ts` (app) and `NavTarget.java` / `Navigation.java` (plugin) |
| `Launcher` | `electron/runelite-launcher.cjs` (starts RuneLite) and `OsrsPathLauncher.java` (the entry class that loads the plugin as a built-in) |
| `OsrsPathPanel` | `OsrsPathPanel.java`, the RuneLite side-bar panel (Swing) |
| `/bank-tags` | `POST /bank-tags` exists: the stage's items are highlighted softly in the main bank window (there is no import string and no Bank Tags tab) |
| System tray | Not implemented. The desktop shell is a normal window with a single-instance lock. |
| `/events` SSE | `GET /events` exists (text/event-stream) |

## 1. High-level architecture and communication

### 1.1 Dual-side runtime

```
+--------------------------------------+        127.0.0.1:38282         +-----------------------------------+
| OSRS Path desktop app (Electron)     |  <---- HTTP + SSE (main proc)--> | RuneLite client + OSRS Path Bridge |
|  main.cjs  : window, files, updater  |                                 |  Java 17 plugin (jar in the exe)  |
|  preload   : contextBridge API       |   POST /prep-plan (snapshot)    |  hooks, overlays, trackers,       |
|  renderer  : React 19 / TypeScript   |   GET  /status, /telemetry      |  bridge server, telemetry         |
|  engines   : playerState ->          |   SSE  STATUS STATS XP QUESTS   |  Quest Helper machine, stage      |
|   readinessEngine -> prepPlan        |        OWNED GEAR PACING ...    |  tracker, auto-completion         |
+--------------------------------------+                                 +-----------------------------------+
        |  progress.json + localStorage                                             |  RuneLite profile config (BankSnapshot)
        |  %APPDATA%\OSRS Path\progress-copies                                      |  ~/.runelite/osrs-path-telemetry
```

* **Electron side (TypeScript/React).** Owns the route, the progress, every calculation (readiness, preparation, shopping, gear, travel, money, training) and the wiki/price clients. It is the *planner*.
* **RuneLite side (Java 17, RuneLite 1.12.39 API, verified compatible with 1.13.1).** Owns client hooks, game events, item/bank observation, HUD, overlays, hint arrow, widgets, quest-stage following, auto-completion and the debug journal. It is the *observer and renderer*: it carries no route resolution, no wiki parsing and no planner. (`QhMachine` and `StageTracker` execute pre-built data; they do not plan.)
* One package: the portable exe `OSRS-Put-<version>-portable.exe` carries the app plus `runelite-bridge/osrs-path-bridge.jar` as an extra resource. The app starts the user's installed RuneLite with that jar loaded as a built-in plugin.

### 1.2 Process model and IPC boundary (security)

* `electron/main.cjs` creates one `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `autoHideMenuBar`, `minWidth: 380`; a single-instance lock (`app.requestSingleInstanceLock`); window state in `window.json`; UI settings in `ui.json`.
* `electron/preload.cjs` exposes exactly one object, `window.osrsDesktop`, through `contextBridge`:

| API | Purpose |
|---|---|
| `getZoom / setZoom / onZoom / setAlwaysOnTop` | interface scale (steps 0.8-2.0), auto-fit to window width (0.9x-1.5x), always-on-top |
| `loadProgressFile(profileId) / saveProgressFile(json, profileId)` | synchronous load before first render, debounced (400 ms) atomic save of `progress.json` / `progress-<id>.json` |
| `loadProfilesFile / saveProfilesFile` | the profile list as `profiles.json` (survives lost window storage) |
| `backup.get / choose / now / setAuto / clear` | progress copies: automatic folder outside the app and an optional user folder |
| `dataDir / isPortable` | where the data lives |
| `updates.get / check / download / install / setAuto / onState` | auto-update of the portable exe |
| `runelite.check / launch` | detect and start RuneLite with the plugin |
| `bridge.request(method, path, body) / bridge.openEvents(onEvent, onState)` | the only route to the plugin |

* `electron/runelite-bridge.cjs` is the only code that talks to `127.0.0.1:38282`. It allows exactly these paths: `/status`, `/active-step`, `/clear`, `/shopping-plan`, `/nav-target`, `/bank-tags`, `/gear-hint`, `/prep-plan`, `/telemetry`, plus the SSE stream `/events`. It adds the `X-OSRS-Path: 1` header and no `Origin`, so there is no CORS and a closed RuneLite does not spray console errors. `bridge:events-open/close` manage one stream per window.
* **Content-Security-Policy** (built page, `vite.config.ts`): `default-src 'none'`; scripts `'self'` plus the hash of the one inline theme script; network only to `oldschool.runescape.wiki`, `prices.runescape.wiki`, `maps.runescape.wiki`; no frames, forms, objects.
* External links open in the default browser (`setWindowOpenHandler`, `will-navigate` guard). The page loads from `file://`.

### 1.3 Local HTTP bridge specification (plugin side, `BridgeServer.java`)

* Binds to the loopback address only, default port **38282** (config key `port`, applied after plugin restart). Up to 8 SSE streams, ping every 15 s, body limit 64 KB (384 KB for the `/prep-plan` snapshot).
* **Protection:** `Host` header must be local (DNS-rebinding guard); any request carrying an `Origin` header is rejected (403); every POST needs `X-OSRS-Path`; a feature turned off in plugin settings answers **409** with a reason instead of failing silently.
* **Protocol version 6**, plugin version equal to the app version (a test pins it). The handshake fields `protocol` and `pluginVersion` in `/status` let the app say "update the plugin" (`PluginUpdateNote`, header yellow dot).

| Endpoint | Method | Purpose | Since protocol |
|---|---|---|---|
| `/status` | GET | `{status, inGame, activeStepId, stats, xp, questsDone, player, pos, shortestPath, navTarget, equipment, inventory, coins, bankCoins, carriedValue, bankValue, protocol, pluginVersion}` | 1 (fields grew; 5 added xp/quests/player/pos) |
| `/active-step` | POST | The step target (`ActiveTarget`): arrow, highlights, HUD, departure check, route, pacing, auto-completion trigger | 1 |
| `/clear` | POST | Remove everything the app set | 1 |
| `/shopping-plan` | POST | The Grand Exchange bulk list (`ShoppingPlan`) | 2 |
| `/nav-target` | POST | A temporary target over the step (`NavTarget`); `{"clear":true}` clears | 3 |
| `/bank-tags` | POST | The stage items for soft highlighting in the bank (`BankTags`) | 3 |
| `/gear-hint` | POST | Gear advice (`GearHint`): HUD line, items to count in the bank, items to highlight; `{"clear":true}` clears | 3 |
| `/prep-plan` | POST | **The single state snapshot** (`PrepEnvelope`): step + stages, shopping, bank highlight, gear hint and the preparation plan in one numbered body applied in one client-thread pass; a late snapshot is dropped, a bad part is reported without blocking the rest | 6 |
| `/telemetry` | GET | Debug-journal summary (file, counters, anomalies, latest events); `{"enabled":false}` if off | 6 |
| `/events` | GET (SSE) | Event stream, see below | 1 (events grew) |

**SSE events:** `STATUS` (inGame, player), `STATS` (levels), `XP`, `QUESTS` (completed quest names), `OWNED` (bag/worn/bank counts, `bankSeen`), `GEAR` (equipment, inventory, coins, value estimates), `PACING`, `NAV_SET`, `NAV_DONE`, `STEP_AUTO_COMPLETED`, plus `: ping` comments. STATS/OWNED/GEAR/PACING go out only on change (at most once per game tick) and are repeated to a new connection. The step cursor and stage events are internal to the plugin and appear in the journal.

**Protocol history:** 1 (before 2.9, no field) - 2 (2.9: item value, version handshake) - 3 (2.10: guide for the side panel) - 4 (2.11: the list on the game screen) - 5 (2.12: XP, quests, player, position) - 6 (2.22: one `/prep-plan` snapshot instead of five requests; old addresses stay for protocol-5 apps).

### 1.4 Single source of truth

```
bridge.tsx (SSE + /status)  --\
store.tsx (progress, marks)   ---> playerStateContext.tsx -> buildPlayerState() ---> PlayerState (one snapshot, fingerprinted)
profiles.ts / features.ts   --/                                                        |
                                                                                       v
                          readinessContext.tsx -> createReadinessEngine(): readiness, fixChain, prepRoute, oneTrip, plan (memoised per snapshot)
                                                                                       |
                                                                                       v
           prepPlan.ts (PrepPlan) -> UI consumers: OneTripCard, ReadinessPanel, StepStatus, NextStepCard, PrepRoute/Queue, Shopping
                                  -> prepEnvelope.ts -> POST /prep-plan -> plugin: GuideList, OsrsPathHudOverlay, InventoryCheckOverlay, ShopWindow, panel
```

* Nothing computes its own copy: readiness, shopping "I already have", quick options, the preparation route, "one trip", the in-game list and the bank check all read the same `PlayerState` and the same `requirements.ts` evaluator. The plugin keeps only instant, local derivations (live bag/bank counts, cursor facts) and takes the plan from the snapshot.
* The navigation target is also single: `lib/navigation.ts` resolves one `NavigationTarget`; the step map, the world map modal and the in-game arrow read it; the plugin's `NavTarget` (temporary) sits above the step target and returns to it on arrival.

### 1.5 Progress persistence

* `progress.json` (main profile) and `progress-<id>.json` (other profiles) in the data folder; a mirror in `localStorage`; the fresher of the two wins at start. Writes are atomic (temp file + rename). `progress.bak.json` is a copy of the last whole state before the first write of each session; a file that does not parse is set aside as `progress.broken-<time>.json` (3 kept) and never overwritten.
* **Copies outside the app folder:** every hour and at launch, `%APPDATA%\OSRS Path\progress-copies` receives `osrs-put-<name>-YYYYMMDD.json` (14 days per file) and `osrs-put-<name>-latest.json` (refreshed on every save; an older state never replaces it); an optional user folder (for example OneDrive) gets the same. A fresh data folder restores itself from the newest valid copy (`restoreFromCopies`, a just-created folder holding an older state is refreshed from a newer copy).
* Format: `version: 3` with `steps`, `notes`, `levels`, `reviewedV2Steps`, `qpKept`, `gameMode`, `legacy`, `updatedAt`; V1 -> V2 and V2 -> V3 migration tables (`V2_FROM_V1`, `V3_FROM_V2`), export/import of JSON, undo after replace/reset.

### 1.6 Tri-state model

* `PlayerState` fields use `Known<T> = { known: true; value; source: 'game' | 'profile' | 'manual' } | { known: false }`; item presence is `Presence = 'PRESENT' | 'MISSING' | 'UNKNOWN'`; requirement results are `ReqState = OK | BANK | PARTIAL | MISSING | UNKNOWN`.
* **Rules enforced in code and tests:** an offline or silent bridge is `UNKNOWN`, never `0` or `MISSING`; an unopened bank leaves the bank `UNKNOWN`; unknown items are excluded from the readiness percentage and shown as "Not checked"; coins in the bag that already cover the need settle the question even with the bank unknown; the plugin treats a Quest Helper condition it cannot observe as "unknown", and an "unknown" before a satisfied condition makes the machine defer to the older place-and-items logic.

## 2. Desktop application (Electron 44, React 19, TypeScript 7, Vite 8, Vitest 5, Leaflet 1.9)

### 2.1 App shell and core

| Capability | Where | Status |
|---|---|---|
| One window, single-instance lock, remembered bounds and maximised state, auto-hide menu (Alt shows it; Ctrl+R reload) | `electron/main.cjs` | [VERIFIED VIA TESTS], [PROVEN IN LIVE GAME] |
| Portable data folder `OSRS-Put-data` next to the exe; first launch takes progress from an installed version (`%APPDATA%\OSRS Path`) | `electron/main.cjs` | [VERIFIED VIA TESTS], [PROVEN IN LIVE GAME] |
| Interface scale 80-200 % (Ctrl +/-/0, Ctrl+wheel, numeric keypad), "adapt to window width" (0.9x-1.5x of the 1280-point base), always-on-top | `main.cjs`, `lib/ui-scale.ts`, `Settings.tsx` | [VERIFIED VIA TESTS] |
| Font size separate from scale (root rem) | `lib/ui-scale.ts` | [VERIFIED VIA TESTS] |
| Theme light / dark / system, early theme script before render | `lib/theme.ts`, `index.html` | [VERIFIED VIA TESTS], [OFFLINE FALLBACK] |
| Hash router with pages `path`, `skills`, `goals`, `quests`, `reference`, `settings`, `shopping`, `gear`; `#/step/<id>` opens Path on a step; `#/skills/<code>`; `#/reference/<section>` | `lib/router.ts` | [PROVEN IN LIVE GAME], [OFFLINE FALLBACK] |
| Global search opened by the header button or `/` (steps, items with live prices, skills, training rows, reference, OSRS Wiki fallback); arrow keys, Enter, Escape | `SearchBox.tsx`, `lib/search.ts` | [VERIFIED VIA TESTS], [OFFLINE FALLBACK] |
| Offline mode: the item database, plans, gear data, quest stages and all engines are local; wiki/price/map calls fail soft (map preview shows tile coordinates, world map shows a text fallback, prices show "no connection") | `services/wikiService.ts`, `pricesApi.ts`, `map.ts` | [VERIFIED VIA TESTS], [OFFLINE FALLBACK] |
| Crash boundaries: `PageBoundary` clears a page error on navigation so one broken section cannot lock the others | `PageBoundary.tsx` | [VERIFIED VIA TESTS] |
| Sessions: "This session" summary (minutes, XP and levels gained, steps closed) and the resource journal kept 30 days / 2000 entries per profile and character | `lib/session.ts`, `ledgerStore.ts`, `SettingsExtra.tsx` | [VERIFIED VIA TESTS], [PROVEN IN LIVE GAME] |
| Profiles: one progress per character, bound by the character name from the game; switching, rename, remove, `ProfileBanner` when the game shows another character; no foreign levels or marks are written until the player chooses | `lib/profiles.ts`, `ProfileBanner.tsx` | [PROVEN IN LIVE GAME] |
| Auto-update of the portable exe from GitHub releases (checksum, size 20-400 MB, allowed hosts only, nothing installed without a button, old exe deleted after switch) | `electron/updater.cjs`, `useUpdates.ts`, `UpdateBanner.tsx` | [VERIFIED VIA TESTS] (download of a real release tested; full restart path not repeated live) |
| Progress copies, restore from copies, profile list file | `progress-files.cjs`, `main.cjs`, `SettingsExtra.tsx` | [PROVEN IN LIVE GAME] |
| Undo toast after marks, replace and reset | `store.tsx`, `ToastView.tsx` | [VERIFIED VIA TESTS] |
| Skip link, ARIA roles, reduced-motion handling | `App.tsx`, `styles.css` | [VERIFIED VIA TESTS] |

### 2.2 Display modes and layouts

* **Zen mode (default).** The step card shows the step, one `StepStatus` line ("Ready to set off" / "Preparation required (N items) - Fix - More" / recovery), the Done button and critical warnings. All other blocks live behind "More" tabs (Preparation, Gear, Food, Route and game, Training and variants) that appear only when they have content (`useFilled` reads the DOM) and collapse by themselves when the player becomes ready.
* **Inspector mode.** Every block of the card is expanded (readiness, one-trip plan, money goal, training card, magic plan, money plan, upgrade/gear prompts, step map, in-game panel, travel plan, food advice, style gear, branch suggestions). Toggled in the header (`DensityToggle`) and in Settings; stored in `features.inspector`. Calculations and the game link are identical in both modes.
* **Play style:** `calm` (default: less on screen, one main task, no risk, messages only about the main thing) or `efficient` (fastest methods, time estimates, "one trip" four steps ahead, "what next" hints) in `lib/playStyle.ts`.
* **Responsive breakpoints.** Header tested at 1100, 1280, 1400, 1600, 1720, 1920 px without horizontal scrolling; the bridge label shows full text from 1720 px and a one-word status between 1280 and 1719 px; search label collapses between 900 and 1179 px. Narrow window (below about 1080): compact one-column list of stages with steps expanding in place; **2-column** layout in the middle; **wide 3-column** `PathWide` from 1080 points (stage rail, step view, wiki dossier pinned from 1260 points, a slide-over drawer below that).
* **Layout details:** the stage rail keeps a fixed "current step" pill; selecting a step highlights it at once and the step card shows a loading bar while it renders (React transition); Settings is split into four tabs (Look, RuneLite, Progress and copies, App) remembered between launches; folded readiness blocks ("N of N items in the bag", "N requirements met").

### 2.3 Screens

#### Path (`#/`, `pages/Path.tsx`, `PathWide.tsx`, `StageSection.tsx`)
* `NextStepCard` ("What to do now") with blockers, `StageSection` lists, `StepCard`/`StepBody` (kicker with type, stage, QP, members/optional/done/skipped badges, NPC + floor, dialogue hints, items required/recommended with icons and "where to get it", walkthrough text, tips, safespots, diagrams via `StepImage`, "Done when", Mark as done -> opens the next unclosed step).
* `StepStatus` unified status, `ReadinessPanel` (traffic light, per-problem actions, fix chain "The chain to readiness", preparation detour banner), `OneTripCard` ("What you need": where, what to do, how important, when, why, supply, coins, slot overflow, weight advice, recovery banner), `PreflightPanel` (departure check), `PrepRoute` (preparation route: one main item, up to two more, return to the step; auto-queue).
* `BranchSuggestions` (quick variants: Varrock Teleport with Magic 25, canoe with Woodcutting 12/27, Chronicle book), `TravelPlan` ("Where am I? How to get there": walk, teleport, canoe, boat compared by distance for the player's levels and items), `FoodAdvice`, `UpgradePrompt`, `GearPrompt`, `StyleGear`, `MagicPlan`, `MoneyGoal`, `MoneyPlan`, `TrainingCard` ("What to train with"), `RangeHints`, `PacingLine`, `LiveXp`.
* `StepMap` (preview from OSRS Wiki tiles, point switch, floor caption), `WorldMapModal` (Leaflet loaded as a separate chunk only on demand: markers of all step points, floors, wheel zoom, Escape/backdrop/X to close, text fallback offline), `InGamePanel` ("Show in the game", "Remove from the game", what will be highlighted, auto-mark explanation via `triggers.ts`).
* Review banner for steps updated in V2 (`review.ts`): show what changed, reset to active, or hide.

#### Skills (`#/skills`, `#/skills/<code>`, `Skills.tsx`, `SkillDetail.tsx`)
* 12 free skills plus 8 members skills (members mode). Per skill: level input (`LevelInput`, from the game when connected, manual otherwise), the plan row for the current level (`ranges.ts`), goal by stage, "How much XP is left" calculator (`xp.ts`), live XP rate and "about N minutes to the goal" from measurements only (`xpRate.ts`, `LiveXp`), the path steps that use the skill, "What to train with" (`trainingRouter.ts`: path 1-15 -> 15-30 ..., exact "about N logs more", missing tool, arrow to the place), and the plan tables and sections.

#### Goals (`#/goals`, `Goals.tsx`)
* The 6-stage x 15-skill level threshold table from `goals.json`; reached/not-yet/current-stage colouring against the player's levels.

#### Quests (`#/quests`, `Quests.tsx`)
* Route quests with QP, state (done, available, blocked), filter, requirement lines; "13 of 24 / quest points 20"-style summary; quests complete in the game close their steps through account sync and `STEP_AUTO_COMPLETED`.

#### Gear (`#/gear`, `Gear.tsx`)
* Worn equipment per slot, bag and bank from RuneLite, a DPS/kill-time comparison against the opponent of the nearest combat step (OSRS Wiki damage formulas, accurate/aggressive styles, stab/slash/crush), "Do now - hit faster", locked-item list ("needs 30 Attack"), armour within means, "What opens next", last known gear when RuneLite is closed (dated), and Magic/Ranged style gear.

#### Bulk Shopping (`#/shopping`, `Shopping.tsx`)
* Multi-stage Grand Exchange aggregation (stages from..to, only unfinished steps), items summed by id (or name), tools not repeated, budget at live exchange prices (OSRS Wiki Prices, cached 5 min), tabs "Need to buy / Partly owned / Already owned / All", "Not sold at the exchange" and "recommended" groups, per-line "already have" overrides (`withOwnedManual`, max `MAX_OWNED`, persisted), "Sync with my bank" from the game, copy list / copy one name, "Open the shopping list" from the step card. The app never buys.

#### Reference (`#/reference`, `Reference.tsx`)
* 8 sections from `reference.json` (see 5) including "Teleports, canoes and boats" and the 33-plugin RuneLite directory in 6 groups from `plugins.json`; skills graph; deep links from steps.

#### Settings (`#/settings`, `Settings.tsx`, `SettingsExtra.tsx`)
* **Look:** theme, interface scale, adapt to window, font size, always on top; Zen/Inspector, play style, auto-preparation, and the feature switches (places on the map, stage items in the bank, training pace, levels from the game, upgrades and gear).
* **RuneLite:** link on/off, plugin version compatibility, "Launch RuneLite with the bridge", start together with the app, Jagex Account sign-in hint, remove hints from the game.
* **Progress and copies:** character profiles, **Account sync** (restore from the game: confirmed steps + the steps they require + a separate list of earlier steps the game cannot confirm), This session + resource journal, progress copies (automatic folder, own folder, make a copy now, turn off), export/import progress JSON, reset (undoable).
* **App:** updates (check now, auto-check every few hours, download, restart into the new version), diagnostics ("Copy the report": versions, link state, last bridge events, journal summary; no bag, bank or notes).

### 2.4 Header, drawers and modals

* **Header:** brand, five tabs, `HeaderProgress` (progress ring + quest points), `BridgeIndicator` (green / white / yellow dot; "Linked/Offline/Update" word at medium widths, full label on wide), `DensityToggle`, `ModeToggle` (F2P | Members; marks are kept when switching), search, Gear and Shopping icon buttons, Settings.
* **`WikiDrawer` (inspector):** item and NPC dossier (examine, value, alchemy, trader prices, drops, free spawns, buy locations, wiki link) from the local database first, then live wiki search; exchange price always live; pinned as a third column on wide Path, slide-over otherwise; opened by clicking an item/NPC or from search; closed by X, backdrop or Escape (Escape inside the map closes only the map). `PlaceMap` turns "where it lies" places into map markers and an in-game arrow.
* **`WorldMapModal`** and **`SearchBox`** as above; **`UpdateBanner`** at the top when a new version exists.
* **Global observers mounted in `App.tsx`:** `PrepAuto`/`PrepWatcher` (auto-queue and reconciliation), `PrepSync` (snapshot to the plugin), `GearHintSync` (HUD gear line), `ProfileBanner`.

### 2.5 Feature switches (`lib/features.ts`, key `osrs-put:features`)

| Flag | Default | Effect when off |
|---|---|---|
| `autoLocation` | on | no coordinate look-ups for places, no map markers/arrows from the dossier |
| `bankTags` | on | no stage items sent for bank highlighting |
| `pacing` | on | no training-pace line in the step card |
| `upgradeRouter` | on | no tool/weapon upgrade hints |
| `levelsFromGame` | on | levels from RuneLite no longer fill the level fields |
| `autoPrep` | on | the app stops leading the arrow through the preparation queue |
| `efficient` | off (calm) | play style |
| `inspector` | off (Zen) | display mode |

A turned-off feature does nothing at all (not just hidden); the matching behaviour inside the game is switched in the plugin settings.

### 2.6 Module inventory

#### Root (`src/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `App.tsx` | 7 KB | The frame: the header, the page switch (hash routing), the global observers of preparation and of the RuneLite link. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `bridge.tsx` | 36 KB | The RuneLite link state: whether it is on, whether the plugin is there, which step is shown in the game. The auto-mark from the game comes here: the step is marked, the next one goes to the game, the pages open it on their own. Also from here: | [PROVEN IN LIVE GAME] |
| `main.tsx` | 1 KB | The React entry point: the providers (progress, the RuneLite link, the player state, the readiness engine). | [VERIFIED VIA TESTS] |
| `playerStateContext.tsx` | 6 KB | The single player state for the screens: one snapshot for everyone (readiness, shopping, preparation, one trip, goals) and the session resource journal. Recomputed only when the fingerprint changes — not on every render. | [PROVEN IN LIVE GAME] |
| `readinessContext.tsx` | 2 KB | The single readiness engine for the screens: one for the whole app, recreated only when what affects the calculations changes (player state, step marks, quest points, mode, route). The calculations and answers are in lib/readinessEngine.ts. | [PROVEN IN LIVE GAME] |
| `store.tsx` | 8 KB | The progress state: one source for the whole app, saving (localStorage + a file in the desktop app), undo. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |

#### Pages (`src/pages/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `Gear.tsx` | 15 KB | "⚔️ Gear": what is worn, how hard it hits and what to do to hit faster — wear the best from the bag and bank, buy from a trader or at the exchange, save up. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `Goals.tsx` | 4 KB | The "Goals" screen: the levels for each stage. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `Path.tsx` | 9 KB | The Path page: chooses the wide three-column layout (PathWide) or the compact one-column list of stage sections with the next-step card, V2 review banner, account-sync plaque, and focus/scroll handling for step links. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `PathWide.tsx` | 10 KB | "Path" on a wide screen (redesign D): on the left a ribbon of stages with steps, in the centre the chosen step, on the right the pinned wiki dossier. The whole route, the step and the dossier are visible at once, without page scrolling. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `Quests.tsx` | 4 KB | The "Quests" screen: the route quests, the quest points and what they unlock. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `Reference.tsx` | 3 KB | The Reference page: the list of 8 reference sections, a section view with guide blocks, the 33-plugin RuneLite directory in 6 groups, and the skills graph. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `Settings.tsx` | 21 KB | The "Settings" screen: appearance, the RuneLite link, helpers, progress export and import. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `SettingsExtra.tsx` | 11 KB | The 2.12 settings: character profiles, a scheduled progress copy, the session summary and "Diagnostics". | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `Shopping.tsx` | 19 KB | "🛒 Grand Exchange shopping list": one purchase for several stages ahead. The prices come from the same OSRS Wiki price service as the item inspector; what you already have — from RuneLite. You have to buy yourself: | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `SkillDetail.tsx` | 8 KB | One skill: level input, goal for the current stage, training-plan row and tables, XP-left calculator, live XP rate, the path steps using the skill, and the "What to train with" card. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `Skills.tsx` | 4 KB | The list of skills: the free and the members ones with their training plans. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |

#### Components (`src/components/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `AccountSync.tsx` | 5 KB | "Sync with the account": the game knows the completed quests and the levels reached — steps with such an auto-mark can be closed at once. It only marks (removes nothing) and has undo. | [PROVEN IN LIVE GAME] |
| `Blocks.tsx` | 1 KB | Guide blocks: paragraphs, lists, tables. | [VERIFIED VIA TESTS] |
| `BranchSuggestions.tsx` | 4 KB | "⚡ A quick variant for your stats": a teleport, a canoe, a shortcut — if the level allows. Levels — from RuneLite, and without it — entered by hand in "Skills". The step's ordinary path stays as it is. | [VERIFIED VIA TESTS] |
| `BridgeIndicator.tsx` | 1 KB | The RuneLite link indicator in the header: 🟢 the bridge is active / ⚪ offline. It leads to the link settings. While the link is turned off in settings there is no indicator — those who play without the plugin do not need it. | [PROVEN IN LIVE GAME] |
| `DensityToggle.tsx` | 1 KB | The density switch: in the header — one icon button, in settings — labelled options. 🧘 Zen (default): the current step, one status line, the "Done" button and critical warnings. 🔍 Inspector: | [PROVEN IN LIVE GAME] |
| `FoodAdvice.tsx` | 2 KB | "🍖 Food for combat": how and when the step's opponent hits (wiki) and what food you already have. Health — from the game or from the skills page. | [VERIFIED VIA TESTS] |
| `GearHintSync.tsx` | 3 KB | Gear advice — into the game (POST /gear-hint). The HUD line ("⚡ Stronger: Steel scimitar from Zeke…") and the highlight in the bag and bank — only while an unfinished combat step is shown in the game and its advice is not skipped. | [VERIFIED VIA TESTS] |
| `GearPrompt.tsx` | 9 KB | "⚔️ Stronger in combat": on a combat step — what to wear or buy to hit the step's opponent faster. The analysis is gearAdvisor (OSRS Wiki damage formulas, the opponent's defence from the wiki). | [PROVEN IN LIVE GAME] |
| `HeaderProgress.tsx` | 1 KB | Progress in the header: a ring "how much is done" and quest points. The ring is a link to "Path". | [PROVEN IN LIVE GAME] |
| `Icons.tsx` | 3 KB | One-colour icons: stroke = currentColor, the size is set by CSS. | [VERIFIED VIA TESTS] |
| `InGamePanel.tsx` | 5 KB | "🧭 Show in the game": the step goes to the RuneLite plugin — the arrow, the highlight of NPCs, objects, tiles, the needed dialogue options and items. Below — what exactly will be highlighted. | [PROVEN IN LIVE GAME] |
| `Inline.tsx` | 1 KB | The inline markup of the texts in React without innerHTML: **bold**, `code`, [link](url or #/page) and step codes → links. | [VERIFIED VIA TESTS] |
| `LevelInput.tsx` | 1 KB | A skill level: a number with − and + buttons. Saved at once. | [VERIFIED VIA TESTS] |
| `LiveXp.tsx` | 1 KB | The XP from the game to the goal: how much is left and in how many minutes at this session's pace. The pace is from measurements only (at least half a minute of gain is needed): without them the time is not invented. | [VERIFIED VIA TESTS] |
| `MagicPlan.tsx` | 6 KB | "Magic to the goal: how many spells and what it costs" — for steps with `magicPlan` (S2-04). Prices — from the exchange, XP — from the game (or by level); without prices and the game link the calculation is still shown, but marked approximate. | [VERIFIED VIA TESTS] |
| `ModeToggle.tsx` | 1 KB | The game mode switch in the header: [ 🛡️ F2P / 👑 Members ]. Members adds stages 7–9, members skills and the members alternatives in the F2P steps. | [PROVEN IN LIVE GAME] |
| `MoneyGoal.tsx` | 4 KB | "💰 Step goal": how many coins you already have and what selling the loot gives — for earning steps (S1-13, S3-06). Coins are exact, from the game; items are "~" at exchange prices. Without an open bank we do not invent progress. | [VERIFIED VIA TESTS] |
| `MoneyPlan.tsx` | 5 KB | "💰 How to make up the money": money-making methods from the wiki for the player's levels, on steps where money is needed (moneyGoal, magicPlan). The revenue is the wiki's estimate at exchange prices on the snapshot date and with good play: | [VERIFIED VIA TESTS] |
| `NavigateButton.tsx` | 2 KB | "🧭 Point the arrow in the game": a temporary target in RuneLite — the arrow, the Shortest Path route and the HUD lead to the place, and on arrival (or after buying the needed item) the player sees their step again. | [PROVEN IN LIVE GAME] |
| `NextStepCard.tsx` | 3 KB | "What to do now" — the main element of the "Path" screen. | [PROVEN IN LIVE GAME] |
| `OneTripCard.tsx` | 11 KB | "🧳 What you need": the preparation plan for the step and the nearest three (lib/prepPlan.ts) — one decision, and this is the block that shows it. | [PROVEN IN LIVE GAME] |
| `PacingLine.tsx` | 1 KB | The training pace from the game: "🐟 34 shrimps to 20 Fishing · ≈ 7 min". The RuneLite plugin counts it from XP; while there are few measurements, the time is not invented — "calculating the time…". | [VERIFIED VIA TESTS] |
| `PageBoundary.tsx` | 1 KB | A page change clears the error: a broken section must not lock the others. | [VERIFIED VIA TESTS] |
| `PlaceMap.tsx` | 3 KB | Places from the wiki dossier — onto the map and into the game: "📍 Port Sarim" opens the world map with a marker and the source caption, "🧭" leads the RuneLite arrow there. Coordinates — only from place search (dictionary → OSRS Wiki → wiki search): | [VERIFIED VIA TESTS] |
| `PluginUpdateNote.tsx` | 1 KB | The plugin in RuneLite is older than the app: there is a link but no new features. The app starts RuneLite with the plugin from its folder, and an already running RuneLite keeps the plugin it started with — after the app update it must be restarted. | [VERIFIED VIA TESTS] |
| `PreflightPanel.tsx` | 3 KB | "🧳 Departure check": which of the step's items are already in the bag — from RuneLite data, with no manual refresh. A step is checked when it is shown in the game ("Show in the game"): the plugin counts the bag and bank for it specifically. | [PROVEN IN LIVE GAME] |
| `PrepRoute.tsx` | 11 KB | "The preparation route": what to do before setting off, in order — one main thing, then no more than two, and the return to the step. The queue is built and started by itself (PrepAuto): | [VERIFIED VIA TESTS] |
| `PrepSync.tsx` | 2 KB | The preparation plan — into the game (protocol 6). | [PROVEN IN LIVE GAME] |
| `ProfileBanner.tsx` | 1 KB | The game has a different character than the active profile: levels and marks from the game are not written until the player chooses. | [PROVEN IN LIVE GAME] |
| `ProgressBar.tsx` | 0 KB | A progress bar. | [VERIFIED VIA TESTS] |
| `RangeHints.tsx` | 1 KB | The matching row of the "Training plan" for a step — by the current levels. | [VERIFIED VIA TESTS] |
| `ReadinessPanel.tsx` | 6 KB | "Readiness for a step": a traffic light and what to do before setting off — each problem has its own action. The calculation is lib/readiness.ts; here only the display. A step without requirements and items gets no panel. | [PROVEN IN LIVE GAME] |
| `SearchBox.tsx` | 7 KB | The global search: a window over the page, opened by the header button or the "/" key. The results are in groups: the walkthrough steps, the item database (with the exchange price), skills and the reference, the OSRS Wiki. | [PROVEN IN LIVE GAME] |
| `StageSection.tsx` | 2 KB | A stage section with its list of steps. | [VERIFIED VIA TESTS] |
| `StepCard.tsx` | 15 KB | The step card: the header in the list and the details by section. The order: status → title → context (NPC, place) → items → actions → tips → completion. | [PROVEN IN LIVE GAME] |
| `StepImage.tsx` | 2 KB | A diagram or screenshot inside the step card: a collapsible block and a full-size view. | [VERIFIED VIA TESTS] |
| `StepMap.tsx` | 5 KB | The map in the step card: a preview from OSRS Wiki tiles, a point switch and the full-screen world map. The chosen point is one state for the preview, the switch and the world map: they always show the same place. | [PROVEN IN LIVE GAME] |
| `StepStatus.tsx` | 8 KB | The "unified status" of a step instead of a stack of plaques: | [PROVEN IN LIVE GAME] |
| `StyleGear.tsx` | 3 KB | "🛡 What to wear for magic / ranged": the wiki's advice by slot for your levels and coins. Prices — the exchange; what is worn — from the game. | [VERIFIED VIA TESTS] |
| `Table.tsx` | 1 KB | The index of the highlighted row. | [VERIFIED VIA TESTS] |
| `ToastView.tsx` | 1 KB | A pop-up message with an "Undo" button. | [VERIFIED VIA TESTS] |
| `TrainingCard.tsx` | 7 KB | "🎯 What to train with": a skill training method up to the goal — by level, mode, items and play style (calm / efficient). The calculation is lib/trainingRouter.ts; here only the display. It starts and buys nothing: | [VERIFIED VIA TESTS] |
| `TravelPlan.tsx` | 5 KB | "🧭 How to get there": where you are now (the plugin) and how best to reach the step's place — on foot, by teleport or by canoe. | [VERIFIED VIA TESTS] |
| `UpdateBanner.tsx` | 1 KB | At the top of the window: a new version is out. The player installs it with a button; the download goes in the background, no data is lost. | [VERIFIED VIA TESTS] |
| `UpgradePrompt.tsx` | 6 KB | "⚡ SPEED UPGRADE": before a long training — a cheap better tool, if the level already allows. Weapons and armor on combat steps are advised by GearPrompt (the gear analysis). The button leads the in-game arrow to the seller (a temporary target): | [VERIFIED VIA TESTS] |
| `WikiDrawer.tsx` | 14 KB | The built-in wiki inspector: an item or NPC dossier. On a wide "Path" screen it is a pinned third column, otherwise a slide-out panel on the right. | [VERIFIED VIA TESTS] |
| `WorldMapModal.tsx` | 13 KB | The full-screen world map: OSRS Wiki tiles in Leaflet, the step point markers, switching of points and floors. Loaded as a separate chunk only by the "World map" button — Leaflet does not weigh down the start. | [VERIFIED VIA TESTS] |

#### Services (`src/services/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `gearAdvisor.ts` | 37 KB | Gear analysis: what is worn, how hard it hits at your levels and what to do to get stronger — wear the best from the bag or bank, buy from a trader or at the exchange. The order: | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `gearUpgradeRouter.ts` | 8 KB | A smart tool upgrade before a long training: the player already has 6+ Woodcutting, and in hand is a bronze axe — suggest a Steel axe from Bob in Lumbridge for ~200 gp and return to the step when the axe is bought. Weapons and armor are not here: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `locationResolver.ts` | 12 KB | The coordinates of a place by its name — for the "📍" in the item inspector, the world map and the RuneLite arrow. The order: 0. The "where it lies for free" line: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `pricesApi.ts` | 4 KB | Grand Exchange prices from the OSRS Wiki Prices API. One request gives the prices of all items, so we keep them in memory (a Map) and refresh no more often than once in 5 minutes. | [VERIFIED VIA TESTS] |
| `runeliteBridge.ts` | 33 KB | The link to the RuneLite plugin "OSRS Path Bridge" on this computer: http://127.0.0.1:38282. Requests go through the Electron main process (preload → ipc): | [PROVEN IN LIVE GAME] |
| `wikiApi.ts` | 22 KB | Requests to the OSRS Wiki: the item card, shops, drops, spawns, NPCs. Shared code for the app (live requests) and scripts/build-items.ts (building the local database). No relative imports: the file runs both in Vite and directly in Node. | [VERIFIED VIA TESTS] |
| `wikiService.ts` | 2 KB | An item and NPC dossier for the built-in wiki inspector. First the local database (f2p-items.json), then a live wiki search. Exchange prices are always live. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |

#### Libraries (`src/lib/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `accountSync.ts` | 4 KB | "Sync with the account": the game knows which quests are complete and which levels are reached, so the route steps with such an auto-tick can be closed at once, without waiting for the player to go through them with the plugin on. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `bankTags.ts` | 1 KB | The stage's items for the bank: the OSRS Path Bridge plugin softly highlights them in the main RuneLite bank window (POST /bank-tags) while the stage's step is shown in the game. There is no separate tab and no import string: | [VERIFIED VIA TESTS] |
| `branching.ts` | 6 KB | A step's quick options for the player's stats: "⚡ You have Magic 25: Varrock Teleport". Levels come from RuneLite, and without it, from those entered manually on the skills page. The main route is not hidden: an option only adds to it. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `checklist.ts` | 4 KB | The departure check: whether everything from the step's items is in the bag before leaving the bank. The count comes from RuneLite (the OWNED event); the rules are the same as in the plugin (Checklist.java). | [VERIFIED VIA TESTS] |
| `clipboard.ts` | 1 KB | Copying to the clipboard: the Clipboard API, and if it is blocked (no focus, an old browser, desktop app restrictions) the old way through selecting text. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `desktop.ts` | 4 KB | The bridge to the desktop app (electron/preload.cjs). Without it (the page during development) everything works, only without RuneLite and the progress file. | [VERIFIED VIA TESTS] |
| `features.ts` | 2 KB | The stage 3 helpers in the app: they can be turned off in the settings, and then they not only hide but also do nothing: they look up no coordinates, send no stage items to RuneLite, offer no upgrades. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `flash.ts` | 0 KB | A short "done" flash on a step row: when the mark was set by the game, not a click. | [VERIFIED VIA TESTS] |
| `foodAdvice.ts` | 3 KB | "Food for combat": how hard the step's opponent hits and when to eat. The numbers come from the wiki (threats.json, build-threats): max hit, speed, food healing. The only thing of our own is the threshold rule: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `gearAdvice.ts` | 3 KB | The gear analysis for the screen: levels (from the game, which win over manual ones), what is worn, the bag and bank from RuneLite, Grand Exchange prices, whether the Al Kharid gate is free, what the route will still buy and who the step fights. | [VERIFIED VIA TESTS] |
| `goals.ts` | 0 KB | Goals by stage for skill levels. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `ledger.ts` | 6 KB | The resource journal: what increased and decreased during the session and why: gathering, buying, selling, a reward, moving to the bank, spending. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `ledgerStore.ts` | 2 KB | Storing the resource journal between sessions. The journal is separate for each profile and character: the gains of one account do not enter the totals of another. It lives in the window's storage (localStorage): | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `magicPlan.ts` | 5 KB | What it costs to bring Magic to a goal with strike combat spells (Wind/Water/Earth/Fire Strike) and whether the staff pays for itself. Pure logic: the prices come from outside (the exchange), the spells from spells.json (wiki cards). | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `map.ts` | 3 KB | The OSRS Wiki world map: tiles, floors and the step's points. The wiki's own map cannot be embedded: oldschool.runescape.wiki answers with X-Frame-Options: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `md.ts` | 0 KB | Inline guide markup: **bold**, `code`, [link](url). | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `media.ts` | 1 KB | A media query as React state. The desktop app's scale changes the width for media queries honestly, so the layout switches on both the window size and the interface scale. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `moneyAdvisor.ts` | 5 KB | "How to make up the money": earning methods from the wiki (moneyMaking.json) that are available at the player's levels. Levels come from the game or are entered manually; what we do not know we do not invent but mark with "?". | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `navigation.ts` | 2 KB | One navigation target for everything: where the arrow in the game leads now, the big map shows the same. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `next-step.ts` | 1 KB | Step availability and the choice of "What to do now". | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `oneTrip.ts` | 5 KB | "One trip": preparation for the current step and several nearest ones together: one visit to the bank and the exchange instead of three. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `pacing.ts` | 2 KB | The training pace texts for the app (the same as the plugin writes in the micro HUD). | [VERIFIED VIA TESTS] |
| `places.ts` | 3 KB | Places from the wiki dossier to a point on the map and a temporary target for RuneLite. Pure functions without React and Leaflet: what to look for (a spawn line, a shop, a seller, a town), where the coordinates came from and what goes to the game. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `playStyle.ts` | 1 KB | Play style: "calm" or "efficient". One setting that all the helpers read, instead of separate switches: - calm: less on the screen, nothing is pushed; training methods without risk and without extra clicks; - efficient: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `playerState.ts` | 11 KB | The single player state: levels, items, coins, quests, position, mode: one snapshot for the whole app. Readiness, shopping, preparation, the navigation target and the change summary read it, instead of each taking its own pieces of bridge/store. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `prepEnvelope.ts` | 7 KB | The state snapshot for the game: protocol 6 (POST /prep-plan). Before, the app sent the plugin five separate requests (the step, shopping, bank highlighting, gear advice, and the plan was counted in the app only for itself): | [PROVEN IN LIVE GAME] |
| `prepPlan.ts` | 20 KB | The preparation plan: one decision "what is needed before the step", from which the views are drawn: "What you need" in the app (and the in-game list and the bank check are moved onto it by protocol 6). It has no checks of its own: | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `prepQueue.ts` | 5 KB | The auto-queue for preparation: it lines up what to do before the step and leads the arrow first to the first thing, then to the second, until nothing is left, and then returns to the step. The player does not need to press "Start preparing". | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `prepRoute.ts` | 9 KB | The preparation route for a step: what exactly to do before leaving, in what order, and the return to the step when all is ready. Built from readiness (readiness.ts): one state, no checks of its own. Preparation does not break the main route: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `priceBook.ts` | 2 KB | Prices for estimating loot: fresh ones from the exchange (OSRS Wiki Prices), and until they arrive from the project's item database. The loot estimate is recounted at the current prices on every display and not fixed at the moment of the find: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `profiles.ts` | 7 KB | Profiles: several characters, each with its own progress. The first profile ("Main") is stored where it was before (the key and the file did not change), so nothing is lost. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `progress.ts` | 13 KB | Progress: storage, JSON export and import, migration of old saves, pure updates. No relative value imports: the module is used by both the tests and the app. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `qp.ts` | 1 KB | Quest points. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `quests.ts` | 1 KB | The list of quests from the route steps. A quest of several steps (Dragon Slayer I) is one entry. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `ranges.ts` | 1 KB | The "Training plan" row by skill level. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `readiness.ts` | 18 KB | Readiness for a step: whether there are enough levels, quests, items and coins, and what to do if not. One calculation on top of what the app already knows: | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `readinessEngine.ts` | 4 KB | The single readiness engine: once per state snapshot it counts readiness, the preparation route, the "fix everything" chain and "one trip", and remembers the answers. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `recovery.ts` | 6 KB | Recovery mode: the player died, pressed a teleport in the middle of a step, or otherwise ended up far from where the step is. The route assumes the player stands where needed; after a setback "hit the zombie" or "go to the ladder" would be a mockery. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `requirements.ts` | 8 KB | The single requirements: a declarative description ("Ranged 20", "20 food: trout or salmon", "worn", "2000 gp") and one check against the player's state (playerState.ts). Preparation, the preparation route, gear and shopping are counted by it. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `review.ts` | 0 KB | V2 Review: completed steps in which important requirements appeared in V2 that the user has not checked yet. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `router.ts` | 1 KB | Hash routes: they work on GitHub Pages and from any folder without server setup. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `search.ts` | 5 KB | Global search over steps, the item database, skills, training rows and the reference. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `session.ts` | 1 KB | The session summary: what changed since the app received the first levels and XP from the game. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `shopping.ts` | 9 KB | The Grand Exchange bulk list: one purchase for several steps ahead instead of trips to the exchange before each. The items are collected from the itemsRequired of the selected steps, identical ones are summed by ID (without an ID, by name). | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `shortText.ts` | 1 KB | Short text for the game screen: one line instead of a paragraph. The game needs "what to do now", while the details (dialogues, explanations, warnings) stay in the app and in the hover hint. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `sourceRouter.ts` | 6 KB | Where to get an item: one queue of sources for any thing (not only gear), in order: in the bank, already in the bag, free nearby, a shop, the exchange, a drop from opponents. A shop slightly dearer than the exchange (up to SAVE_GP) goes first: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `stepPlaces.ts` | 5 KB | The places of a step: the step point, the places from the step map, where items come from (an NPC or a shop from the place dictionary) and the quest NPCs. One layout for the app and the game: | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `styleGear.ts` | 6 KB | "What to wear for magic and ranged": the wiki's recommendations (styleGear.json, build-style-gear) for your levels, quests and wallet. The wiki's slot options go from the best to the available. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `targets.ts` | 1 KB | Level targets from a step title: "Fishing to 20 and Cooking to 15" → fishing 20, cooking 15. No relative imports: the file is used by both the app and the check scripts in Node. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `telemetryReport.ts` | 15 KB | Parsing the plugin's debug journal (osrs-path-telemetry/session-*.jsonl): it is used to find errors without replaying the game. The plugin writes one JSON line per event (Telemetry.java); here: reading, finding oddities and a per-step summary. | [VERIFIED VIA TESTS] |
| `theme.ts` | 1 KB | The theme: light, dark or as in the system. The early choice before rendering is in index.html. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `trainingNav.ts` | 1 KB | The in-game arrow for a training method: the point is taken only from the place dictionary by the method key — without guessing from the text. | [VERIFIED VIA TESTS] |
| `trainingRouter.ts` | 13 KB | "What to train with": by level, goal, game mode, items and play style (calm / efficient) it picks a training method for the skill and shows the path to the goal. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `travel.ts` | 8 KB | "How to get there": from the player's position (the plugin, /status → pos) to the step target — on foot, by teleport or by canoe. The distances are straight lines (the obstacles are unknown), so this is a comparison of options, not an exact time. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `triggers.ts` | 1 KB | How to explain an automatic step mark: "The step will be marked by itself when …". One phrase for any condition — a quest, levels, items or a combination of them. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `ui-scale.ts` | 1 KB | The font size (everywhere) and the interface scale (in the desktop app). The font size changes the root font-size: all fonts are set in rem and the layout is not, so large text does not inflate the whole interface. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `usePrep.ts` | 1 KB | The state of the preparation detours: kept in the window (separately for each profile) and survives a refresh and a restart. | [VERIFIED VIA TESTS] |
| `useRecoveryTracker.ts` | 2 KB | The recovery mode for screens: watches the MOVED events from the game (death, teleport), decides whether it is a derailment (lib/recovery.ts); while it is a derailment, asks the plugin every half minute where the player is: | [VERIFIED VIA TESTS] |
| `useUpdates.ts` | 1 KB | The auto-update state for the window: a subscription to the main process (electron/updater.cjs). Without the desktop app — null. | [VERIFIED VIA TESTS] |
| `wealth.ts` | 2 KB | Money and stock: exact coins separately from the item estimate. Coins in the bag and bank are a fact from the game; items are "~" at exchange prices (the plugin's estimate through RuneLite prices), this is not money until they are sold. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `weight.ts` | 5 KB | Weight and running. The weight of the bag and equipment decides how fast the run energy bar drains. The formula is from the OSRS Wiki "Run energy": loss per tick = floor(60 + 67 · clamp(weight, 0..64) / 64) × (1 − Agility / 300). | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `xp.ts` | 1 KB | The standard OSRS XP formula. check-data compares it with the "How much XP is needed per level" table in src/data/xp.json. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |
| `xpRate.ts` | 2 KB | The XP rate from the plugin's measurements: skill XP arrives every ~3 seconds while training goes on. The speed is the gain over the measurement window (up to 10 minutes), only when the player is really training: | [VERIFIED VIA TESTS] |

#### Electron main process (`electron/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `main.cjs` | 14 KB | The desktop shell of OSRS Path: the same app from dist/ in a separate window. The data is in the app folder (%APPDATA%\OSRS Path), and for the portable version — next to the exe (OSRS-Put-data). | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `preload.cjs` | 3 KB | The bridge between the window and the app: scale, "always on top", the progress file and the link with the RuneLite plugin. The window works in a sandbox — only these functions are exposed, without access to Node. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `progress-files.cjs` | 6 KB | The progress file: reading with a broken file set aside and a copy of the last whole state. | [PROVEN IN LIVE GAME] [OFFLINE FALLBACK] |
| `runelite-bridge.cjs` | 4 KB | The link of the window with the RuneLite plugin "OSRS Path Bridge" (http://127.0.0.1:38282) through the main process. The window does not go to localhost itself: | [PROVEN IN LIVE GAME] |
| `runelite-launcher.cjs` | 6 KB | Starting RuneLite with the OSRS Path Bridge plugin right from the "OSRS Path" app. Nothing is downloaded: | [PROVEN IN LIVE GAME] |
| `updater.cjs` | 11 KB | Auto-update of the portable version: compares the version with the latest GitHub release, downloads the new exe next to the old one, checks the size and checksum and, on a button, restarts the app from the new exe. | [VERIFIED VIA TESTS] [OFFLINE FALLBACK] |

## 3. RuneLite bridge plugin (Java 17, `runelite-bridge/`)

### 3.1 Overlays and in-game UI

| Class | What the player sees | Status |
|---|---|---|
| `OsrsPathHudOverlay` | Micro-HUD plate: step code and name, current target and straight-line distance (`~142 tiles`, "Nearby" within 5 tiles holding to 7), another floor/dungeon in words, health warning below two max hits, training pace line, gear line "Stronger: ...", "Use X on Y" action line; draggable with Alt; "compact HUD" hides what the list already shows | [PROVEN IN LIVE GAME] |
| `OsrsPathArrowOverlay` + `ArrowGeometry` | Big arrow at the top of the screen that rotates with the camera like the minimap (offset in tiles rotated by the camera yaw), large distance text without a background, brighter inside 20 tiles, "Nearby" at the target; hidden while the world map is open | [PROVEN IN LIVE GAME] |
| `GuideList` + `OsrsPathGuideOverlay` + `GuideMouse` | The interactive "What you need" list: stage title "S2-10 - Stage 2 of 7 - 92%", step lines with short text, items (have / in bank / missing / on the way / not checked), "Where to go" rows (click -> arrow + path), actions PLACE (arrow and path to a place), BACK (arrow back to the step), NEXT ("Done - next" for steps the game cannot see), PREV (view the previous step, 45 s), RESUME, TAB (Steps/Tip) and TOGGLE (collapse), hover hint, a Steps/Tip tab strip (active tab gold, other link blue), click-through protection (a click on the list never reaches the game), Alt-drag | [PROVEN IN LIVE GAME] |
| `OsrsPathPanel` | RuneLite side-bar panel (Swing): step, what you need with state and "where to get it", the step points with "Go here" (temporary target), "Return the arrow to the step" | [PROVEN IN LIVE GAME] |
| `InventoryCheckOverlay` + `Checklist` | Bank pre-flight check next to the open bank: `Rope 1/1`, `Cooked chicken 2/5 +3 HP`, "not in bank"; states IN_BAG_READY / MISSING_FROM_BAG / NOT_FOUND_IN_BANK; the plugin moves nothing | [VERIFIED VIA TESTS] |
| `OsrsPathItemOverlay` | Pulsing frame on the step's items in the bag and bank (green fill on what the check says to take, quiet gold frame on stage items in the bank), the item itself is not covered | [VERIFIED VIA TESTS] |
| `OsrsPathShopOverlay` + `ShopWindow` | A card beside the bank / Grand Exchange / merchant window: what to take, what to buy and where it is sold (never over the game window; left, else right, else corner) | [VERIFIED VIA TESTS] |
| `GrandExchangeHelperOverlay` | Exchange hint: the bulk list, what you already have, what is in an order, what to search next (no text is written into the exchange search; buys nothing) | [VERIFIED VIA TESTS] |
| `OsrsPathWorldOverlay` | 3D world: outlines and labels on the step's NPCs and objects (including per-line stage highlights), ground tiles, the step point; `ModelOutlineRenderer` | [PROVEN IN LIVE GAME] |
| `OsrsPathWidgetOverlay` | Dialogue: frame and arrow on the right option of the chat menu (`InterfaceID.Chatmenu.OPTIONS`), upgrade item in a shop | [VERIFIED VIA TESTS] |
| `OsrsPathDangerOverlay` + `DangerRadar` | Red zone border within 20 tiles (denser inside), red outline on dangerous NPCs, warning in the HUD, a sound once on entering | [VERIFIED VIA TESTS] |
| `OsrsPathDebugOverlay` + `DebugView` | Developer badge (Ctrl+Shift+D): `ActiveStep: S2-05, Stage: 3/9 (var=5), Cursor: 2/5 [auto]`, conditions, last cursor reason, snapshot age, plan percent, bag, tile and tick, what is drawn, latest anomalies | [VERIFIED VIA TESTS] |
| `OverlayCard` / `OverlayText` | Shared look: dark rounded card with a state-coloured strip; one font per line with wrapping to the plate width (replaces fallback fonts for the symbols the RuneScape fonts lack) | [PROVEN IN LIVE GAME] |
| World-map marker and game hint arrow | `Client.setHintArrow` (yellow arrow) and a marker on the game's world map showing the arrow target (edge-clamped when far) | [PROVEN IN LIVE GAME] |

### 3.2 Core systems and trackers

| Class | Responsibility | Status |
|---|---|---|
| `OsrsPathBridgePlugin` | The plugin: lifecycle, subscribes to game events, owns all overlays, applies snapshots on the client thread, completion sound and chat line, bank persistence, telemetry hooks | [PROVEN IN LIVE GAME] |
| `BridgeServer` | Local HTTP/SSE bridge (section 1.3) | [PROVEN IN LIVE GAME] |
| `AutoCompletionManager` | Auto-tick of the current step: `QUEST_COMPLETED` (Quest state FINISHED), `SKILL_LEVEL` (real levels from `StatChanged`, no boosts), `ITEM_OWNED` (bag + notes + worn + bank), `CHAT_MESSAGE`, `VARBIT_CHANGED`; checked on change and every 10 ticks; emits `STEP_AUTO_COMPLETED` | [PROVEN IN LIVE GAME] |
| `StageTracker` | Where the player is inside a quest stage: cursor moved only by facts (place, items, hand-in, quest variable), transitions, `need`/`has` item conditions, 4/6-tile arrival rules, view-only Back (45 s), "Done - next" for steps the game cannot see, resume | [PROVEN IN LIVE GAME] |
| `QhMachine` + `QhLiveFacts` | Executes the Quest Helper state machines (`questMachines.json`): ordered conditions with three values (yes / no / unknown), latches, default step; facts from items, position, varbits, varps, chat/dialogue events, widgets, NPC/object presence, skills, quest state | [PROVEN IN LIVE GAME] |
| `StepGuide` | The list/panel model for a step: items with bag/bank state, "where to get it", points, NPCs | [PROVEN IN LIVE GAME] |
| `ActiveTarget` / `PrepEnvelope` / `PrepPlan` / `ShoppingPlan` / `BankTags` / `GearHint` / `NavTarget` | Typed payloads of the bridge | [PROVEN IN LIVE GAME] |
| `SmartView` | Optional contextual overlay visibility: contexts TRAVEL (> 25 tiles from the target), STEP, BANK, EXCHANGE; off by default (key `smartView`) | [VERIFIED VIA TESTS] |
| `PacingTracker` + `PacingSet` | XP and actions left to the step goal and the time estimate, measured over the last five XP gains (needs at least three measurements); combat steps track Attack/Strength/Defence in turn | [VERIFIED VIA TESTS] |
| `MoveDetector` | Jump of 20+ tiles per tick (teleport, respawn) -> `MOVED` event for the recovery mode | [VERIFIED VIA TESTS] |
| `DangerRadar` | Zones from `dangerZones.json` (in the jar), squared-distance checks once per tick | [VERIFIED VIA TESTS] |
| `BankSnapshot` | Last known bank stored in the RuneLite profile config (per character, throttled to 3 s, saved on logout and plugin stop), marked "from the previous session" until the bank is opened | [VERIFIED VIA TESTS] |
| `ItemCounts` | Counts in bag, worn and bank per `ItemContainerChanged` (by id, else by name; banknotes separate) | [PROVEN IN LIVE GAME] |
| `ShortText` | One short line per step/stage line for the game screen | [PROVEN IN LIVE GAME] |
| `Telemetry` | Local JSONL journal `~/.runelite/osrs-path-telemetry/session-DATE.jsonl` (6 MB cap, 8 files, no character name, nothing sent anywhere) with event kinds `bag`, `bank`, `chat`, `click`, `debug`, `highlight`, `journal`, `menu`, `moved` (DEATH / TELEPORT), `nav`, `opts`, `qh`, `session`, `shot`, `snapshot`, `stage`, `step`, `var`, `varx`, `warning`, `anomaly`, `beat`, `ui`, `end`; optional screenshots (`shots`, last 40) | [PROVEN IN LIVE GAME] |
| `EngineWatchdog` | Notices anomalies without repairing them: `STUCK` (cursor still for 3 min while the player walked/changed the bag), `CLAMP` (item-still-in-bag warning older than 90 s), `EMPTY` (step chosen, nothing drawn for 20 s), `QUEST_DONE` (quest complete, list does not show it for 10 s) | [PROVEN IN LIVE GAME] |
| `OsrsPathLauncher` | Entry class: loads the plugin as a built-in plugin into a normally installed client (the stock launcher does not load third-party plugins) | [PROVEN IN LIVE GAME] |

**RuneLite events subscribed by `OsrsPathBridgePlugin` (24 handlers):** `onConfigChanged`, `onPluginChanged` (Shortest Path detection), `onPostMenuSort` (menu tooltip over the list), `onNpcSpawned/Changed/Despawned`, `onGameObjectSpawned/Despawned`, `onWallObjectSpawned/Despawned`, `onDecorativeObjectSpawned/Despawned`, `onGroundObjectSpawned/Despawned` (highlight collection), `onGameStateChanged`, `onActorDeath`, `onGameTick` (cursor, HUD, radar, watchdog, completion checks), `onStatChanged`, `onItemContainerChanged`, `onGrandExchangeOfferChanged`, `onChatMessage`, `onWidgetLoaded`, `onMenuOptionClicked`, `onVarbitChanged`. Overlays registered: HUD, guide list, big arrow, world, widget, item, danger, shop card, inventory check, Grand Exchange helper, debug badge.

### 3.3 Configuration keys (`OsrsPathBridgeConfig.java`, 36 items in 3 sections: "In-game helper", "Places, radar, pace", "Developer")

Section ids in the table: `companion` = "In-game helper", `helpers` = "Places, radar, pace", `developer` = "Developer"; `general` = items outside a section.

| Key | Section | Label | Type | Default | Effect |
|---|---|---|---|---|---|
| `port` | general | Port | int | `38282` | Bridge port on 127.0.0.1. The OSRS Path app expects 38282. Applied after the plugin restarts. |
| `hintArrow` | general | Arrow to the step's place | boolean | `true` | The game's yellow arrow above the current step's point |
| `worldMapMarker` | general | World map marker | boolean | `true` | Shows where the arrow points as a marker on the game's world map. Far away: the marker sits at the map edge; click it to open the map there |
| `highlightColor` | general | Highlight colour | Color | `cyan (0,220,255,230)` | NPCs, objects, tiles, dialogue options and the step's items |
| `completionSound` | general | Sound: step done | boolean | `true` | A short interface sound when a step is counted automatically |
| `smartView` | companion | Smart reveal | boolean | `false` | Off by default: the 'What you need' list and HUD are always visible. If enabled, only the arrow and |
| `showHud` | companion | Show micro HUD | boolean | `true` | The current step, the target and the distance to it. The plate can be dragged while holding Alt |
| `hudLean` | companion | Compact HUD | boolean | `true` | Do not repeat in the HUD what the 'What you need' list already shows: the step name, target, distance and 'Bag ready'. |
| `showGuide` | companion | 'What you need' list | boolean | `true` | Under the HUD: the step's items (have, in bank, missing) with 'where to get it' and the step's places with NPCs. |
| `guideCollapsed` | general | (hidden state) | boolean | `false` | The 'What you need' list is collapsed to one line; changed by clicking its heading |
| `hudOpacity` | companion | HUD background | int | `75` | Opacity of the helper plates' background, in percent |
| `hudLarge` | companion | Large HUD text | boolean | `false` | Enlarge the text and width of the helper plates by a quarter |
| `showChecklist` | companion | Departure check at the bank | boolean | `true` | With the bank open: which of the step's items are already in the bag and which to take. What is needed is highlighted in the bank |
| `bigArrow` | companion | Big arrow | boolean | `true` | A large arrow at the top of the screen: it turns with the camera and shows where to go and how many tiles. Draggable with Alt |
| `arrowSize` | companion | Size | ArrowSize | `MEDIUM` | Size of the big arrow: small, medium or large, to fit the window and screen |
| `useShortestPath` | companion | Via Shortest Path | boolean | `true` | If the Shortest Path plugin (Plugin Hub) is installed, pass it the step's target; it lays out a path that accounts for walls and doors |
| `shopWindow` | companion | Bank and shop window | boolean | `true` | A separate card next to the bank, exchange and merchant windows: what to take from the bank, what to buy and where it is sold, for any quest. |
| `showGeHelper` | companion | Exchange hint | boolean | `true` | With the Grand Exchange open: the bulk shopping list from the app. Buys nothing by itself |
| `shareStats` | companion | Level-based variants | boolean | `true` | Send skill levels to the app so it can offer teleports, canoes and shortcuts |
| `autoNavigation` | helpers | Arrow to places | boolean | `true` | The 'Point arrow in game' button in the app sets the arrow (and the Shortest Path route) to a place from the map. |
| `upgradeRouter` | helpers | Upgrade hints | boolean | `true` | Send gear and coins to the app so it can suggest a better tool, weapon, amulet and armour. |
| `bankTagsHelper` | helpers | Stage items | boolean | `true` | Accept the stage's item list from the app, for highlighting in the bank |
| `bankHighlight` | helpers | Bank highlight | boolean | `true` | A soft golden frame on the stage's items in the main bank window; the Bank Tags tab is not needed |
| `dangerRadar` | helpers | Danger radar | boolean | `true` | A red border on dangerous places (dark wizards, animated trees, aggressive guards), |
| `dangerSound` | helpers | Danger zone sound | boolean | `true` | Once on entering the zone; again only if you leave and re-enter |
| `smartPacing` | helpers | Training pace | boolean | `true` | Count by XP how many actions are left to the step's goal and how long that takes, and send it to the app |
| `hudPacing` | helpers | Pace in micro HUD | boolean | `true` | A line like '34 shrimps to 20 Fishing (~7 min)' on the step plate |
| `hudHealth` | helpers | Health in HUD | boolean | `true` | A red line on the step plate when health drops below two max hits of the step's enemy |
| `stageFollow` | helpers | Arrow by stages | boolean | `true` | For quests with stages the 'What you need' list shows the current stage, and the arrow itself leads to its NPC and moves |
| `qhMachine` | helpers | Steps like Quest Helper | boolean | `true` | The current stage step is chosen by the same conditions as in the Quest Helper plugin: items, place, quest variables, |
| `telemetry` | developer | Debug log | boolean | `true` | Writes to the osrs-path-telemetry folder next to the RuneLite settings what the plugin did: step and stage changes, where the cursor moved and why, |
| `telemetryShots` | developer | Screenshot on anomaly | boolean | `true` | When the plugin notices an anomaly (the step does not change, an empty screen), it saves a game screenshot to osrs-path-telemetry/shots. |
| `telemetryDetail` | developer | Log: chat and dialogues | boolean | `true` | The log gets game messages (chat, message boxes, dialogue lines and answer options), game menu clicks, |
| `telemetryEventShots` | developer | Screenshot on every step | boolean | `true` | A game screenshot at every stage cursor move, so the log shows what the player saw. |
| `debugKey` | developer | Developer badge | Keybind | `Ctrl+Shift+D` | Hotkey: show or hide the engine status over the screen: step, cursor, conditions, the app's snapshot, anomalies |
| `shotKey` | developer | Debug screenshot | Keybind | `Ctrl+Shift+K` | Hotkey: save a game screenshot to osrs-path-telemetry/shots and mark it in the log |

Plugin config keys are stable: they are never renamed, so saved settings survive updates (a changed default needs a new key, as happened with `smartOverlays` -> `smartView`).

### 3.4 Java class inventory
| File | Size | Responsibility | Status |
|---|---|---|---|
| `ActiveTarget.java` | 20 KB | The current step sent by the app: the same as InGameTarget in src/types/index.ts, plus the step's code and title. Gson fills the fields; the sets for fast comparison are built by prepare(). | [PROVEN IN LIVE GAME] |
| `ArrowGeometry.java` | 3 KB | The big arrow to the target: how to turn it on the screen and what state it is in. The direction is computed the way RuneLite places points on the minimap (Perspective.localToMinimap in 1.12.39): | [PROVEN IN LIVE GAME] |
| `AutoCompletionManager.java` | 8 KB | Auto-tick of the current step. Only conditions that are known in advance and tested: QUEST_COMPLETED: a quest with this name is in the FINISHED state (Quest.getState in RuneLite); SKILL_LEVEL: | [PROVEN IN LIVE GAME] |
| `BankSnapshot.java` | 2 KB | The last known bank contents: remembered so that after a RuneLite restart the bank is not "unknown" until you open it again. | [VERIFIED VIA TESTS] |
| `BankTags.java` | 1 KB | The stage's items for soft highlighting in the bank (POST /bank-tags): everything needed in the stage is visible right in the main bank window, without a separate Bank Tags plugin tab and an import string. An empty list clears the highlight. | [VERIFIED VIA TESTS] |
| `BridgeServer.java` | 26 KB | Local HTTP bridge for the "OSRS Path" app. Listens on 127.0.0.1 only. | [PROVEN IN LIVE GAME] |
| `Checklist.java` | 3 KB | The departure check: is everything for the step in the bag (or worn), and for what is missing, is it in the bank. Pure logic without RuneLite: src/lib/checklist.ts in the app repeats it. | [VERIFIED VIA TESTS] |
| `DangerRadar.java` | 6 KB | The danger radar: zones from src/data/dangerZones.json (Gradle puts it in the jar) and the player entering/leaving. Distances are squared (dx^2 + dy^2), without a root. | [VERIFIED VIA TESTS] |
| `DebugView.java` | 5 KB | The developer badge (Ctrl+Shift+D): the engine status in green and red over the game screen: ActiveStep: S2-05 / Stage: 3/9 / Cursor: 2/5 / Trigger: Item(Lobster ×5) = FALSE / QueueDepth: 1. | [VERIFIED VIA TESTS] |
| `EngineWatchdog.java` | 5 KB | The engine watchdog: looks in what the player sees for states that should not exist, and writes them to the log and the developer badge. It repairs nothing and changes nothing, it only notices: - STUCK: | [PROVEN IN LIVE GAME] |
| `GearHint.java` | 1 KB | The app's gear advice (POST /gear-hint): a line for the HUD ("⚡ Wear Iron scimitar - it is in the bank"), items to report the bank count of (they go into the OWNED event), and items to highlight in the bag and bank. | [VERIFIED VIA TESTS] |
| `GrandExchangeHelperOverlay.java` | 5 KB | The Grand Exchange hint: the bulk list from the app, what you already have, what is in an order and what to search for next. The text is not put into the exchange search: | [VERIFIED VIA TESTS] |
| `GuideList.java` | 28 KB | The "What you need" list right on the game screen, under the HUD: the step's items (have, in bank, missing, during the step) with "where to get it" and the step's points with NPCs. A line with a place is a button: | [PROVEN IN LIVE GAME] |
| `GuideMouse.java` | 3 KB | Clicks on the "What you need" list on the game screen. A left click on a line with a place gives the arrow and path there (the action goes to the client thread), a click on the heading collapses or expands. | [PROVEN IN LIVE GAME] |
| `InventoryCheckOverlay.java` | 5 KB | The departure check with the bank open: "✓ Rope 1/1", "✗ Cooked chicken 2/5 · +3 HP", "not in bank". The counting is in the plugin, from ItemContainerChanged events; here it is only shown. | [VERIFIED VIA TESTS] |
| `ItemCounts.java` | 4 KB | How many of which items are in a container (bag, worn items, bank). Computed once per ItemContainerChanged event, not every frame. | [PROVEN IN LIVE GAME] |
| `MoveDetector.java` | 1 KB | An abrupt jump of the character: a teleport, a respawn after death. A step on the ground is at most two tiles per tick, so a jump of JUMP tiles or more is not walking. | [VERIFIED VIA TESTS] |
| `NavTarget.java` | 2 KB | A temporary target over the step: a place from the app's map ("📍 Port Sarim") or a shop for an upgrade ("Buy a Steel axe from Bob"). | [PROVEN IN LIVE GAME] |
| `Navigation.java` | 4 KB | The distance and direction to the target for the micro HUD, and the step's waypoints. This is the straight-line distance between coordinates, not the number of steps along the road: the real path is drawn by Shortest Path or the waypoints. | [PROVEN IN LIVE GAME] |
| `OsrsPathArrowOverlay.java` | 6 KB | The big arrow to the current target: top centre of the screen, over the scene but under the game windows, so it does not cover the minimap, chat and bag and does not get in the way of clicks. | [PROVEN IN LIVE GAME] |
| `OsrsPathBridgeConfig.java` | 13 KB | Big arrow size: the circle's diameter in screen pixels. | [PROVEN IN LIVE GAME] |
| `OsrsPathBridgePlugin.java` | 95 KB | The RuneLite plugin: lifecycle, 24 event subscriptions, ownership of every overlay and tracker, snapshot application on the client thread, hint arrow and world-map marker, completion sound and chat line, bank persistence, journal hooks, side panel. | [PROVEN IN LIVE GAME] |
| `OsrsPathDangerOverlay.java` | 3 KB | The danger radar in the 3D world: a red zone border while the player is closer than 20 tiles to its centre, and a red outline on dangerous NPCs while they are in the warning zone. Inside the zone the border is denser. Only drawing is here: | [VERIFIED VIA TESTS] |
| `OsrsPathDebugOverlay.java` | 2 KB | The developer badge: the engine status in green and red over the game screen. Hidden until you turn it on (by default Ctrl+Shift+D, the "Developer" setting). DebugView lays out the lines; here is only the drawing: | [VERIFIED VIA TESTS] |
| `OsrsPathGuideOverlay.java` | 10 KB | The "What you need" list on the game screen: under the HUD, top left (draggable with Alt). GuideList computes the lines; the line under the mouse is highlighted, with a hint for it at the bottom. | [PROVEN IN LIVE GAME] |
| `OsrsPathHudOverlay.java` | 10 KB | The micro HUD: the step's code and name, the current target and the distance to it. Top left, under the game windows, draggable with the mouse while holding Alt (like any RuneLite plate). | [PROVEN IN LIVE GAME] |
| `OsrsPathItemOverlay.java` | 4 KB | The step's items in the inventory and bank: a frame along the cell's edge with a soft pulsation, the item itself is not covered. | [VERIFIED VIA TESTS] |
| `OsrsPathLauncher.java` | 1 KB | Launching RuneLite with the OSRS Path Bridge plugin: done by the "OSRS Path" app (electron/runelite-launcher.cjs). The client classes are taken from the installed RuneLite (~/.runelite/repository2), Java from its own jre folder. | [VERIFIED VIA TESTS] |
| `OsrsPathPanel.java` | 9 KB | The "OSRS Path" side panel in RuneLite: the step, what you need (in the bag, in the bank, missing) and where to get it, the step's points. "Go here" sets a temporary target: | [PROVEN IN LIVE GAME] |
| `OsrsPathShopOverlay.java` | 5 KB | A separate window next to the bank, exchange and merchant windows: what to take, what to buy and where it is sold. The list is built by ShopWindow; here: | [VERIFIED VIA TESTS] |
| `OsrsPathWidgetOverlay.java` | 4 KB | The right option in the dialogue menu: a frame around the line and an arrow ▶ on the left. And the upgrade item in a shop. | [VERIFIED VIA TESTS] |
| `OsrsPathWorldOverlay.java` | 5 KB | Highlighting in the 3D world: the outline of the step's NPCs and objects with a label, tiles from groundTiles and the step's point. The plugin collects whom to highlight from spawn events; here is only the drawing of what has been found. | [PROVEN IN LIVE GAME] |
| `OverlayCard.java` | 4 KB | The look of the plugin plates: a dark rounded card with a coloured strip on the left (the colour is the state: gold, green, red) and a thin border. Instead of PanelComponent's flat brownish background. | [PROVEN IN LIVE GAME] |
| `OverlayText.java` | 9 KB | Plugin plate text: one font for the whole line and wrapping to the panel width. The RuneScape fonts lack some symbols the plugin uses (✓ ✗ ⚠ ▶ ◀ ●), and RuneLite substitutes them from a system font. | [PROVEN IN LIVE GAME] |
| `PacingSet.java` | 3 KB | The pace of a step by one skill or by several with one goal, in combat: Attack, Strength, Defence to 30. They are trained in turn, switching the attack style, so the skill that is growing now is shown. | [VERIFIED VIA TESTS] |
| `PacingTracker.java` | 5 KB | Training pace: how much XP and how many actions are left to the step's goal and about how long that will take. The pace is measured over the last five XP gains: the XP between the first and the last of them, divided by the time. | [VERIFIED VIA TESTS] |
| `PrepEnvelope.java` | 2 KB | The state snapshot from the app: protocol 6, POST /prep-plan. One request instead of five (/active-step, /shopping-plan, /bank-tags, /gear-hint, the preparation plan): | [PROVEN IN LIVE GAME] |
| `PrepPlan.java` | 4 KB | The preparation plan the app has already computed (protocol 6, part of the /prep-plan snapshot): | [PROVEN IN LIVE GAME] |
| `QhLiveFacts.java` | 5 KB | Game facts for the Quest Helper state machine: what the client sees now, and the messages since observation began. Read only on the client thread. | [PROVEN IN LIVE GAME] |
| `QhMachine.java` | 14 KB | The quest state machine: the conditions by which Quest Helper chooses the current stage step. The data (src/data/questMachines.json) is built from its sources; here it is executed the same way: | [PROVEN IN LIVE GAME] |
| `ShopWindow.java` | 6 KB | The bank, exchange and shop window: what the step needs right here. At the bank, what to take (and what the bank lacks); at the exchange and at a merchant, what to buy and where it is sold. For any quest: | [VERIFIED VIA TESTS] |
| `ShoppingPlan.java` | 2 KB | The Grand Exchange bulk list from the app: what to buy several steps ahead. The plugin only shows it at the exchange and counts what you already have; it buys nothing itself. | [VERIFIED VIA TESTS] |
| `ShortText.java` | 1 KB | One short line instead of a paragraph for the game screen: the game needs "what to do now", the details stay in the app and in the hover hint. | [PROVEN IN LIVE GAME] |
| `SmartView.java` | 3 KB | The "smart reveal" of the overlays: what to show in the game now. The game is the operational level: where to click, how many tiles are left, whether they are hitting. | [VERIFIED VIA TESTS] |
| `StageTracker.java` | 20 KB | Where the player is within a quest stage: the current step of the list. | [PROVEN IN LIVE GAME] |
| `StepGuide.java` | 20 KB | What the "What you need" list in the game and the "OSRS Path" side panel show: the step's items (whether you have them: bag, bank), where to get them and which point to aim the arrow at, and the step's points. Pure logic: | [PROVEN IN LIVE GAME] |
| `Telemetry.java` | 8 KB | The debug log: what the plugin's engine did while you played. One JSON line per event into the file osrs-path-telemetry/session-DATE.jsonl next to the RuneLite settings: | [PROVEN IN LIVE GAME] |

## 4. Preparation and intelligence engines (`src/lib/`, `src/services/`)

All engines are pure TypeScript (no React inside), take a `PlayerState`, and never buy or click anything. `[OFFLINE FALLBACK]` is applicable to all: without the bridge they degrade to `UNKNOWN` states and manually entered levels.

### 4.1 `playerState.ts`
One snapshot: levels (`Known<number>` per skill, source game/profile/manual), items (bag, worn, notes, bank with `bankSeen`), coins (bag/bank), quests (`QuestPresence`), position (`WorldPoint`), game mode, weight, bag slots. `heldOf` gives `Held {presence, bag, noted, bank, equipped}`; `diffPlayerState` produces the change summary ("Defence 27 -> 30", "+3 Lobster") used by the resource journal; a fingerprint avoids recomputation.

### 4.2 `requirements.ts` and `readiness.ts` (the `readinessEngine` rules)
* Declarative requirements: `skill`, `item` (by id or name), `equipment`, `quest`, `money`, `gameMode`, `alternative` ("20 food: trout or salmon"), `composite` (all/any); one `evaluate()` returning `ReqResult` (`OK | BANK | PARTIAL | MISSING | UNKNOWN`, have/need/missing).
* `stepReadiness` -> `ReadinessStatus` = `READY | MINOR_PREP | MISSING_ITEM | MISSING_STATS | MISSING_QUEST | MISSING_MONEY | BLOCKED | UNKNOWN`; per-requirement `RequirementState`; actions as links or navigation targets; `fixChain` ("The chain to readiness": unfinished steps/quests, then levels, items, coins); `nearestBank`.
* A goal already met (level goal reached) offers to close the step instead of training again.

### 4.3 `readinessEngine.ts`
`createReadinessEngine` computes, once per state snapshot, readiness, the preparation route, the fix chain, one-trip and plan, and memoises answers; the step screen, the observer, the queue and "what to do now" all read from it. Old per-feature calculations were compared against it on all 69 steps in six scenarios (golden fixture `readiness.golden.json`).

### 4.4 `prepPlan.ts` (the preparation plan)
* Lines with `where` (EQUIPPED/INVENTORY/BANK/MISSING/UNKNOWN), `priority` (CRITICAL/IMPORTANT/OPTIMIZATION/OPTIONAL), `timing` (NOW/SOON/IN_STEP/LATER), `supply` (ENOUGH/LOW/CRITICAL for consumables from 5 pieces), `action`, `why`, `usedIn`.
* Buckets: `now`, `soon` (look-ahead), `byTheWay`, `have`, `later` (do not take now), `optimizations`, `blockers`, `recovery`, `weight`, `coins`, `slots` (28-slot budget; stacks - runes, arrows, coins - take one slot), `score` (percent, ready/total, critical/important/optimizations/unknown, verdict READY / NOT_READY / UNKNOWN).
* Reads readiness, one-trip and the source router; adds nothing the others do not know. Percent excludes UNKNOWN.

### 4.5 `sourceRouter.ts`
Waterfall for any item: bank, already in the bag, free nearby (spawn lines, excluding members-only or telekinetic spawns for F2P), shop (a shop slightly dearer than the exchange wins up to `SAVE_GP` because the price is exact and the walk is short), Grand Exchange, drop. Returns a primary option and alternatives with navigation targets.

### 4.6 `oneTrip.ts`
The current step plus the next three unclosed steps (`LOOK_AHEAD = 3`; four in the efficient style): what the player holds is assigned to the nearest steps, tools are taken once, one thing is split by timing ("Lobster x40" = 20 now + 20 on the way), urgency NOW/SOON/LATER, coins need vs have (bag coins covering the need settle it with an unopened bank).

### 4.7 `prepRoute.ts` and `prepQueue.ts` (preparation route and auto-queue)
Route tasks (`block`, `quest`, `stat`, `buy`, `money`, `bank`) with urgency and need (REQUIRED/RECOMMENDED/OPTIONAL); one main task then at most two; detours kept per profile with maximum depth `MAX_DETOUR_DEPTH` (3), no repeat or cycle, removed automatically when the game data shows the task done, and a return-to-step prompt; the queue (`decideAuto`) leads the arrow to the bank, the exchange (item highlighted) or a training place; it never takes over an arrow already set in the game, pauses when the player clears the arrow (until "Continue preparation"), remembers "Cancel the detour" for the session; buys nothing.

### 4.8 `recovery.ts` and `useRecoveryTracker.ts`
Recovery mode after a death (respawn hubs) or a teleport away from the step (`MOVED` events, far/near radii, 30-minute time-to-live): ordered plan (1 collect items - gravestone then Death's Office or check the bag, 2 take what is missing, 3 return to the step), "This is not a break - continue" dismissal, ends on arrival; a teleport toward the step is not a break.

### 4.9 `weight.ts`
OSRS Wiki run-energy formula `floor(60 + 67 * clamp(weight, 0..64) / 64) * (1 - Agility / 300)`; on non-combat steps suggests leaving heavy armour and extras in the bank ("Weight 44 kg -> 13.8 kg, running lasts ~1.4x longer"); never touches combat steps, combat skills or what the step needs.

### 4.10 `gearAdvisor.ts` and `gearUpgradeRouter.ts` (single gear authority)
* `adviseGear` evaluates Attack, Strength, Defence, Ranged, Magic, Prayer and quest locks (`canWear`, `missingRequirements`, `LOCK_NEAR`), F2P/members mode, the opponent from `monsters.json`, accurate/aggressive styles and stab/slash/crush, prayers, the Al Kharid toll (`TOLL`), and the route's own purchases (`routeNeeds`); order: wear the free best from bag/bank, then weapon, amulet, armour, then save-up targets and "what opens next". Items the player cannot equip are never advised (Coif needs 20 Ranged; Rune platebody needs Dragon Slayer I). Output feeds the Gear page, the combat-step prompt, the in-game HUD line (`hudHint`) and the bag/bank highlight (`watchNames`).
* `gearUpgradeRouter` detects obsolete tools before grinds (woodcutting and mining ladders from `toolProgression.json`; e.g. Bronze axe -> Steel axe from Bob at 6+ Woodcutting) with statuses `NO_UPGRADE | UPGRADE_AVAILABLE | UPGRADE_OWNED | UPGRADE_NOT_AFFORDABLE | SKIPPED | UNKNOWN`; the player can skip (`withUpgradeDismissed`). `styleGear.ts` ladders for magic and ranged (`PickStatus` worn/bag/buy/save/find/locked, ammo fit by bow tier).

### 4.11 `ledger.ts`, `ledgerStore.ts`, `priceBook.ts`, `wealth.ts`
Resource journal built from state diffs (`LedgerReason`: LOOT, PICKUP, PURCHASE, SALE, QUEST_REWARD, BANK_TRANSFER, CONSUMED, UNKNOWN); a move to the bank is not income; loot is re-priced at current prices on every display (`priceBook` live exchange prices, fallback to the project database with a note); `wealth` keeps exact coins separate from the item estimate ("loot ~N gp, an estimate, not money"); `ledgerStore` persists per profile and character for 30 days; `resourceGoal` gives time to goal from sufficient measurements only.

### 4.12 `travel.ts` and `branching.ts`
* `travelOptions`: from the plugin position (`/status` -> `pos`) to the step place: walk, teleports (Lumbridge Home, Lumbridge, Varrock, Falador, Chronicle), canoe stations by Woodcutting level and axe, the Port Sarim - Karamja boat with coins; each option lists needs with `ok: true | false | null` (unknown, e.g. unopened bank), straight-line tiles, `MIN_SAVING_TILES` filter; availability `ready | maybe | locked`.
* `evaluateBranches`: per-step quick variants (`SKILL_LEVEL`, `QUEST_COMPLETED`, `ITEM_OWNED`) with `available | locked | unknown`, missing needs, the saving, and the in-game point to lead to; the main route is never hidden.

### 4.13 Advisors for money, magic, food, training
`moneyAdvisor` (methods available at the levels, investments, "if you have something to invest", soon-unlocking), `magicPlan` (cost to reach Magic 25/33 with four options and staff pay-back), `foodAdvice` (max hit, speed, eat-below threshold of two max hits, dragonfire shown separately), `trainingRouter` (methods by level, mode, items, style; effort afk/low/medium/high, cost free/profit/cost, risk none/low/high; status READY/PREP/LOCKED), `xpRate`/`pacing` (rate from measurements only), `search`, `shopping`, `bankTags`, `checklist` (TypeScript mirror of `Checklist.java`), `places`/`stepPlaces`/`locationResolver` (coordinates only from the dictionary or the wiki, never guessed), `map` (wiki tile map and floors), `telemetryReport` (parses the plugin journal and finds oddities), `shortText`.

## 5. Data layer (`src/data/`, 27 files)

| Dataset | Content and size | Source | Update mechanism |
|---|---|---|---|
| `steps.json` | The V2 route: 69 steps (42 quest, 16 skill, 7 prep, 4 gear; 54 F2P + 15 members) with requirements, items, NPC, floor, map point, quick steps, branches, pacing, money goals, `inGame` highlight data and `completionTrigger` (62 steps: 34 QUEST_COMPLETED, 16 SKILL_LEVEL, 12 ITEM_OWNED). | Hand-edited source of truth | `npm run check-data` (validate.ts + qa.ts) |
| `stages.json` | 9 stages (1-6 free, 7-9 members) with titles. | Hand-edited | `check-data` |
| `questStages.json` | Per-quest stage data for the 32 route quests: 240 stages with 644 lines (each with full text `t`, short text `s` of at most 72 characters, tile `at`, key `k`, `has`/`need` item conditions, highlight lists for NPC/object/item), the quest variable (varp/varbit) and 135 walkthrough route groups. | Quest Helper sources (Zoinkwiz/quest-helper) + OSRS Wiki + route notes | Generated with `tools/qh-machines`, checked by `check-data` rules (`stages-has-missing`, `stages-short`, `need` rules) |
| `questMachines.json` | Quest Helper state machines (conditions, step tree, latches) for 32 quests; shipped into the plugin jar and executed by `QhMachine`. | Quest Helper sources, symbolic interpretation | `python tools/qh-machines/qhm/build_machines.py` after `fetch_qh.py`; `questMachines.test.ts`, `QhGoldenTest` |
| `skills.json` | 12 free skills (WC, FM, FI, CO, MI, SM, CR, ME, RA, MA, PR, RC) with intro, sections and a level-by-level training plan (rows). | Hand-edited, checked against the OSRS Wiki | `check-data` (plans run from level 1 without gaps) |
| `members-skills.json` | 8 members skills (AG, TH, SL, FA, HE, HU, CN, FL) with plans up to 99, XP-from-quests, equipment and FAQ sections. | Hand-edited, checked against the OSRS Wiki | `check-data`, `members-skills.test.ts` |
| `levels.json` | 14 level ids (attack, strength, defence, ranged, magic, prayer, woodcutting, firemaking, fishing, cooking, mining, smithing, crafting, runecraft) with RuneLite skill names. | Hand-edited | tests |
| `goals.json` | Skill-level goals by stage: 6 stages x 15 rows, with an intro and notes. | Hand-edited | `check-data` |
| `xp.json` | XP table points (18) used to cross-check the formula in `xp.ts`. | OSRS Wiki | `check-data`, `xp.test.ts` |
| `plugins.json` | The RuneLite plugin directory: 33 plugins in 6 groups (Essential 6, Convenience and interface 8, Training 6, Combat 6, Bank and items 4, World and navigation 3). | Hand-edited | `check-data` (reference/plugins validation) |
| `reference.json` | The beginner reference: 8 sections (Signing in and setup; Free or membership; How skills feed each other; If you do not know what to do; Teleports, canoes and boats; RuneLite plugins; Tips and safety; Wiki links) plus training table and skills graph. | Hand-edited, OSRS Wiki | `check-data`, `check-links` |
| `f2p-items.json` | The item database: 203 items (examine, value, alchemy, trader prices - 149 with buy locations, 160 with drop sources, 85 with free spawn lines, icons, wiki URLs). | OSRS Wiki Bucket API + articles | `npm run build-items` (network, 2-4 min, cached in node_modules/.cache, `--fresh`) |
| `gear.json` | 135 free-version melee items (7 metal tiers of weapons and armour, amulets, leather): bonuses, speed, slot, level/quest requirements, shops and prices. | OSRS Wiki Bucket infobox_item/infobox_bonuses/storeline + article text | `npm run build-gear` (network); requirements parsed by `gear-requirements.ts` |
| `monsters.json` | Defence, level and health of the 8 opponents named in the steps `foes` field. | OSRS Wiki infobox_monster | `npm run build-gear` |
| `threats.json` | 12 opponent threat cards (max hit, speed) and 16 foods with healing. | OSRS Wiki infobox_monster and food articles | `npm run build-threats` (network), generatedAt 2026-10-03 |
| `styleGear.json` | Recommended magic (9 slots) and ranged (9 slots) equipment ladders for the free version. | OSRS Wiki Free-to-play Magic/Ranged training | `npm run build-style-gear` (network) |
| `moneyMaking.json` | 91 free-version money-making methods with GP/hour estimates, requirements, investments. | OSRS Wiki Money making guide/Free-to-play | `npm run build-money` (network), generatedAt 2026-10-03 |
| `trainingMethods.json` | 61 training methods per skill with level ranges, needs, effort, risk, cost, wiki speed (guideline only). | OSRS Wiki training pages + guide plans | Hand-maintained; `check-data` validates repeats, ranges, speeds, places, links |
| `spells.json` | 6 strike/teleport spells, rune ids, 4 staffs, cowhide id for `magicPlan.ts`. | OSRS Wiki spell cards | Hand-maintained, checked 2026-10-03 |
| `toolProgression.json` | Woodcutting (6 tiers) and mining (6 tiers) tool ladders with ids, level requirements, seller. | Game levels + f2p-items.json + majorLocations.json | Hand-maintained; tests verify id, shop and point exist |
| `majorLocations.json` | The place dictionary: 126 key places with wiki `{{Map}}` coordinates for the inspector, world map and arrow. | OSRS Wiki articles | `npm run build-locations` (network) |
| `npcLocations.json` | 105 NPC locations for "Where to go" in the in-game list and step map points. | OSRS Wiki NPC maps | Hand-maintained, checked against the route steps 2026-09-27 |
| `transport.json` | Teleports (5), canoe stations/types (3), boats (2) with points and conditions. | OSRS Wiki Teleportation, Chronicle, Canoe | Hand-maintained, checked 2026-10-03; `transport.test.ts` |
| `dangerZones.json` | 4 danger zones: Varrock dark wizards, Draynor dark wizards, Draynor Manor trees, Draynor jail guards. Also shipped in the plugin jar for `DangerRadar`. | OSRS Wiki LocLine/maps, checked 2026-09-27 | Hand-maintained; Gradle `processResources` |
| `weights.json` | 297 item weights in kg for the preparation weight advice. | OSRS Wiki infobox_item | `npm run build-weights` (network) |
| `index.ts` | Typed accessors over all JSON (`stepById`, `itemById`, `known`, `findSkill`, `reference`, ...). | Code | tsc |

Packaged into the plugin jar by Gradle `processResources`: `dangerZones.json`, `questMachines.json`.

Guardrails on the data: `scripts/qa.ts` rules (a Coif without 20 Ranged, two "main" amulets, a "home teleport" without a recharge note, quest stages with missing `has`, stage text length, price sanity), `validate.ts` (route, plans, goals, XP, plugins, reference), and per-dataset tests.

## 6. Tooling, scripts and test suites

### 6.1 npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc --noEmit && vite build` (CSP inserted at build) |
| `npm test` | `vitest run --testTimeout=30000` |
| `npm run check-data` | route and static-data validation with no network (`validate.ts` + `qa.ts`) |
| `npm run test:ui` | Playwright (Chromium) UI smoke against the built page with a stub desktop bridge and stub RuneLite |
| `npm run test:e2e` | real Electron end-to-end (needs a display, not in CI) |
| `npm run check-links` | wiki links alive (network) |
| `npm run check-runelite` | the built plugin's `net.runelite.*` references exist in the installed client jar (needs JDK 17) |
| `npm run bridge:jar` | build `osrs-path-bridge.jar` with Gradle (JDK 17) |
| `npm run dist:win` | build + jar + `electron-builder --win portable` -> `release/OSRS-Put-<version>-portable.exe` |
| `npm run desktop` | build, optional jar, `electron .` |
| `npm run icons` | draw the window icon and SVG logo without libraries |
| `npm run build-items / build-gear / build-locations / build-money / build-threats / build-style-gear / build-weights` | rebuild datasets from the OSRS Wiki (network) |
| `npm run telemetry` | analyse the latest plugin journal |

### 6.2 Script inventory (`scripts/`)
| File | Size | Responsibility | Status |
|---|---|---|---|
| `analyze-telemetry.ts` | 1 KB | Analysis of the plugin debug journal: `npm run telemetry` reads the latest session from ~/.runelite/osrs-path-telemetry (or the file/folder passed as an argument) and prints the findings: | [NOT AUTOMATED] |
| `build-bridge-jar.ts` | 2 KB | npm run bridge:jar — build the RuneLite plugin jar (runelite-bridge/build/libs/osrs-path-bridge.jar), which the desktop app puts into the exe and starts together with the installed RuneLite. JDK 17 is needed: JAVA_HOME or ~/.jdks/<jdk-17…>. | [NOT AUTOMATED] |
| `build-gear.ts` | 10 KB | Builds src/data/gear.json from the OSRS Wiki: the free-version melee weapons and armor, amulets and what is handed out on Tutorial Island. | [NOT AUTOMATED] |
| `build-items.ts` | 6 KB | Builds src/data/f2p-items.json from the OSRS Wiki and fills in wikiItemId and iconUrl for the items in steps.json. It needs a network. Run: npm run build-items (about 2–4 minutes, the wiki asks not to hurry). The data is from the wiki only: | [NOT AUTOMATED] |
| `build-locations.ts` | 10 KB | Builds src/data/majorLocations.json — a dictionary of key places for the "📍" in the item inspector and the map. It needs a network. Run: npm run build-locations (about a minute). The coordinates are not written by hand: | [NOT AUTOMATED] |
| `build-money.ts` | 4 KB | Builds src/data/moneyMaking.json from the OSRS Wiki: the free-version money-making methods (the "Money making guide/ Free-to-play" list and the Mmgtable card of each article). It needs a network. Run: npm run build-money (about a minute). | [NOT AUTOMATED] |
| `build-style-gear.ts` | 1 KB | Builds src/data/styleGear.json from the OSRS Wiki: what to wear for magic and ranged in the free version — the block "Recommended equipment" of the articles "Free-to-play Magic training" and "Free-to-play Ranged training". It needs a network. Run: | [NOT AUTOMATED] |
| `build-threats.ts` | 4 KB | Builds src/data/threats.json from the OSRS Wiki: the max hits and speed of the step opponents (Bucket infobox_monster) and how much health the free-version food restores (the first phrase "restores N Hitpoints" in the article). It needs a network. | [NOT AUTOMATED] |
| `build-weights.ts` | 3 KB | Builds src/data/weights.json from the OSRS Wiki: the item weight in kilograms (Bucket infobox_item, the weight field) — for the preparation plan: how much the bag and the worn items weigh, what is better left in the bank on a step without combat. | [NOT AUTOMATED] |
| `check-data.ts` | 1 KB | npm run check-data — the checks of the V2 route and the static data (skills, goals, XP). No network. | [VERIFIED VIA TESTS] |
| `check-links.ts` | 4 KB | Checks that all the wiki links from steps.json, f2p-items.json and reference.json lead to existing articles and files. It needs a network. Run: npm run check-links | [NOT AUTOMATED] |
| `check-runelite-compat.ts` | 4 KB | Checks that the built plugin is compatible with the RuneLite INSTALLED on the player's machine: all its references to net.runelite.* exist in the client jar. Needed: | [NOT AUTOMATED] |
| `e2e-electron.ts` | 5 KB | An end-to-end check of the real Electron: the window opens, the bridge answers, the progress is written to disk as a file. Run: npm run build && npm run test:e2e (a display is needed — it does not run on CI; locally on Windows/Mac/Linux). Safety: | [NOT AUTOMATED] |
| `gear-requirements.ts` | 5 KB | The wearing requirements from the OSRS Wiki article text. They are not in the wiki data (Bucket) — only in the text, so here is a parse of the sentences about wearing: | [VERIFIED VIA TESTS] |
| `make-icons.ts` | 3 KB | Draws the app icons without libraries: a 512 PNG — the window and exe icon, an SVG — the logo in the header. Run: npm run icons. The result is in public/ and is kept in the repository. | [NOT AUTOMATED] |
| `money-parse.ts` | 4 KB | Parsing of the wiki markup and rendered HTML for scripts/build-money.ts — kept apart to be checked by tests without a network. | [VERIFIED VIA TESTS] |
| `paths.ts` | 1 KB | The V2 route — kept right in the JSON. | [VERIFIED VIA TESTS] |
| `qa.ts` | 12 KB | A consistency check of the data and texts: one set of rules for `npm run check-data` and for the tests. The rules catch what has already broken the app: | [VERIFIED VIA TESTS] |
| `style-gear-parse.ts` | 3 KB | Parsing of the wiki {{Recommended equipment}} block for scripts/build-style-gear.ts — kept apart to be checked by tests without a network. | [VERIFIED VIA TESTS] |
| `ui-smoke.ts` | 44 KB | npm run test:ui — a run of the interface in a real browser (Chromium through Playwright), as the player has it in the exe: the built page, a stub desktop app (window.osrsDesktop) and a stub RuneLite bridge. | [VERIFIED VIA TESTS] |
| `validate.ts` | 34 KB | Data checks: the V2 route (steps.json, stages.json, f2p-items.json) and the skills, goals, XP, plugins and reference data. Used by check-data.ts and the tests. No network. | [VERIFIED VIA TESTS] |

`scripts/RuneLiteCompat.java` is the Java helper behind `check-runelite-compat.ts`.

### 6.3 Quest Helper tooling (`tools/qh-machines/qhm/`, Python)
`fetch_qh.py` (download Quest Helper sources), `dump_consts.py` (RuneLite API constants), `jparse.py` + `interp.py` (parse and symbolically execute `loadSteps()`), `build.py` / `build_machines.py` (write `questMachines.json`), `qeval.py` (reference evaluator), `golden.py` (golden vectors for the Java test), `steps_info.py`, `export_fixture.py` (-> `tests/fixtures/qh-steps.json`), `compare_pos.py`, `compare_hl.py` (arrow tile and highlight checks against Quest Helper), `gaps.py`, `reach.py`, `quests.py`, `pretty.py`, `paths.py`. Status: `[NOT AUTOMATED]` (manual tooling; its outputs are covered by `questMachines.test.ts`, `QhGoldenTest`, `QhScenarioTest`).

### 6.4 Continuous integration (`.github/workflows/`)
* `checks.yml` (every push and PR): job 1 `npm ci`, `check-data`, `npm test`, `npm run build`, Playwright Chromium install, `npm run test:ui`; job 2 Temurin 17, `./gradlew --no-daemon test`.
* `release.yml`: when `package.json` version changes on `main`, builds the plugin jar and the portable exe on Windows, tags `vX.Y.Z`, publishes "OSRS Path X.Y.Z" with `release-notes/vX.Y.Z.md`.
* There are no other workflows in this repository.

### 6.5 Test matrix

| Layer | Runner | Count | Notes |
|---|---|---|---|
| Vitest logic tests | `npm test` | 622 `it()` calls in 50 files (Vitest reports 624 passing at 2.30.0) | pure logic, golden fixtures (`readiness.golden.json`, `qh-steps.json`), fuzzing (`fuzz.test.ts`: 3,000 bridge-event and save parses, 4,000 progress parses, 1,500 advisor inputs) |
| Java JUnit 4 | `./gradlew test` | 329 `@Test` methods in 40 classes (329 passing) | pure-logic overlays and trackers, bridge server over real sockets, config defaults/names, golden Quest Helper vectors (`qh-golden.json`), app snapshot fixture (`prep-snapshots.json`), text layout rendered with the real RuneLite fonts into `build/overlay-render/*.png`, journal sample (`telemetry-session.jsonl`), every one of the 250 quest stages walked by a simulated player (`QuestStageWalkTest`) |
| Playwright UI smoke | `npm run test:ui` | 221 passing checks (pages at two widths, header at ten widths) | all pages, header at 1100-1920 px, Zen/Inspector, readiness, shopping, gear, map, settings tabs, console-error and overflow checks, network to the wiki closed |
| Electron E2E | `npm run test:e2e` | 1 scenario | real window opens, bridge answers, progress file written; local only (needs a display) |
| Data checks | `npm run check-data`, `qa.ts` | 0 errors / 0 warnings | route, plans, goals, XP, plugins, reference, quest stages and machines, training methods |
| Compatibility | `npm run check-runelite` | 1 | plugin references vs installed RuneLite 1.13.1 client |

**Vitest files and counts**

| File | `it()` |
|---|---|
| `activeSteps.fixture.test.ts` | 1 |
| `bridge.test.ts` | 41 |
| `companion.test.ts` | 36 |
| `fuzz.test.ts` | 3 |
| `gear-requirements.test.ts` | 12 |
| `gear.test.ts` | 44 |
| `lastGear.test.ts` | 2 |
| `ledger.test.ts` | 13 |
| `ledgerStore.test.ts` | 7 |
| `location.test.ts` | 23 |
| `map.test.ts` | 9 |
| `members-skills.test.ts` | 7 |
| `navigation.test.ts` | 3 |
| `next-step.test.ts` | 9 |
| `oneTrip.test.ts` | 11 |
| `parity.test.ts` | 4 |
| `playerState.test.ts` | 12 |
| `prepEnvelope.test.ts` | 8 |
| `prepPlan.test.ts` | 16 |
| `prepQueue.test.ts` | 11 |
| `price-status.test.ts` | 3 |
| `priceBook.test.ts` | 6 |
| `progress-files.test.ts` | 9 |
| `progress.test.ts` | 20 |
| `qa.test.ts` | 8 |
| `qp.test.ts` | 7 |
| `questMachines.test.ts` | 7 |
| `questStages.test.ts` | 7 |
| `ranges.test.ts` | 7 |
| `readiness.golden.test.ts` | 1 |
| `readiness.test.ts` | 11 |
| `readinessEngine.test.ts` | 5 |
| `recovery.test.ts` | 13 |
| `search.test.ts` | 11 |
| `shopping-owned.test.ts` | 11 |
| `shortText.test.ts` | 7 |
| `stage3.test.ts` | 38 |
| `stageHighlights.test.ts` | 3 |
| `styleGear.test.ts` | 18 |
| `telemetryReport.test.ts` | 20 |
| `trainingRouter.test.ts` | 17 |
| `transport.test.ts` | 9 |
| `travel.test.ts` | 8 |
| `updater.test.ts` | 15 |
| `v2.test.ts` | 24 |
| `v212.test.ts` | 17 |
| `v213.test.ts` | 26 |
| `wealth.test.ts` | 5 |
| `weight.test.ts` | 11 |
| `xp.test.ts` | 6 |

**JUnit classes and counts**

| Class | `@Test` |
|---|---|
| `ActiveStepsTest.java` | 2 |
| `ArrowGeometryTest.java` | 8 |
| `AutoCompletionManagerTest.java` | 15 |
| `BankSnapshotTest.java` | 6 |
| `BridgeServerTest.java` | 21 |
| `ChecklistTest.java` | 9 |
| `ConfigDefaultsTest.java` | 1 |
| `ConfigNamesTest.java` | 2 |
| `DangerRadarTest.java` | 8 |
| `DebugOverlayRenderTest.java` | 2 |
| `DebugViewTest.java` | 10 |
| `EngineWatchdogTest.java` | 15 |
| `GearSlotTest.java` | 1 |
| `GuideListTest.java` | 18 |
| `HealthLineTest.java` | 5 |
| `HudLeanTest.java` | 6 |
| `ItemValueTest.java` | 2 |
| `LineHighlightTest.java` | 5 |
| `MoveDetectorTest.java` | 4 |
| `NavigationTest.java` | 7 |
| `OverlayLayoutTest.java` | 7 |
| `PacingSetTest.java` | 8 |
| `PacingTrackerTest.java` | 11 |
| `PrepSnapshotFixtureTest.java` | 4 |
| `PrepSnapshotTest.java` | 14 |
| `QhGoldenTest.java` | 2 |
| `QhLiveFactsTest.java` | 4 |
| `QhScenarioTest.java` | 10 |
| `QuestStageTest.java` | 25 |
| `QuestStageWalkTest.java` | 1 |
| `RouteTargetsTest.java` | 3 |
| `ShopWindowTest.java` | 11 |
| `ShoppingPlanTest.java` | 3 |
| `ShortTextTest.java` | 6 |
| `SmartViewTest.java` | 11 |
| `StageQhTest.java` | 8 |
| `StageTrackerTest.java` | 29 |
| `StageTravelTest.java` | 4 |
| `StepGuideTest.java` | 8 |
| `TelemetryTest.java` | 13 |

## 7. Verification status matrix (by capability)

Evidence legend: **L10-05** = observed on 2026-10-05 on the real PC (RuneLite 1.13.1, plugin 2.29.x/2.30.0 of the same code, character Bexqq, F2P world 316). **RN x.y** = recorded as live-checked in the release notes of that version. **T** = tests only.

| Capability | Status | Evidence |
|---|---|---|
| Bridge handshake, `/status`, SSE stream, version check | [PROVEN IN LIVE GAME] | L10-05 (`/status` returned protocol 6 and plugin version, inventory, equipment, coins, quests, player, position) |
| Account sync / restore from the game (confirmed steps + required steps) | [PROVEN IN LIVE GAME] | L10-05 (14 steps marked, readiness 80% -> 92%) |
| "Earlier steps the game cannot confirm" offer | [VERIFIED VIA TESTS] | T (`v212.test.ts`); not yet exercised live |
| Level-goal steps in sync even with listed items | [VERIFIED VIA TESTS] | T |
| Profile binding by character name, profile gate | [PROVEN IN LIVE GAME] | L10-05 ("In the game now: Bexqq - the profile matches") |
| Progress save, `.bak`, copies outside the app, restore into a fresh data folder | [PROVEN IN LIVE GAME] | L10-05 (fresh exe copy restored from copies; found and fixed a stale-copy overwrite in 2.29.1) |
| Auto-update download and checksum | [VERIFIED VIA TESTS] | RN 2.25 (real 100 MB release downloaded; wrong checksum rejected) |
| RuneLite launch from the app | [PROVEN IN LIVE GAME] | L10-05 ("Launch RuneLite with the bridge" started RuneLite with the plugin) |
| Micro-HUD, temporary targets "Go to the place"/"Buy", return to the step, settings panel | [PROVEN IN LIVE GAME] | RN 2.5.1 |
| "What you need" list: fonts, clicks, hover, collapse, bank over the list, side panel, world-map marker | [PROVEN IN LIVE GAME] | RN 2.11.1, L10-05 (list, Tip tab, Where-to-go click) |
| Stage cursor on real quests (Vampire Slayer, Pirate's Treasure, Prince Ali Rescue) | [PROVEN IN LIVE GAME] | RN 2.24, 2.25, 2.26, L10-05 (Stage 2 of 7 for S2-10) |
| Quest Helper machine selection | [PROVEN IN LIVE GAME] | RN 2.27 live session (Pirate's Treasure), L10-05 |
| Big arrow, in-game hint arrow, ground tile and NPC outline | [PROVEN IN LIVE GAME] | L10-05 ("~16 tiles", Hassan outline, ground tile) |
| Readiness percent and Tip tab in the game | [PROVEN IN LIVE GAME] | L10-05 (80% -> 92%, "Tip 3" -> "Tip 1") |
| Debug journal, watchdog, screenshots | [PROVEN IN LIVE GAME] | RN 2.24, L10-05 (`npm run telemetry`: no oddities in 587 events) |
| Auto-completion by quest / level / items | [PROVEN IN LIVE GAME] | RN 2.26 live; L10-05 (S2-09 marked by the quest) |
| Bank pre-flight check overlay, bank snapshot persistence | [VERIFIED VIA TESTS] | T; live check pending |
| Bank / Grand Exchange / shop window card | [VERIFIED VIA TESTS] | T (text layout rendered with real fonts); open-window detection not live-checked |
| Grand Exchange helper overlay | [VERIFIED VIA TESTS] | T |
| Danger radar (zones, border, NPC outline, sound) | [VERIFIED VIA TESTS] | T |
| Training pace and combat pace, health line in the HUD | [VERIFIED VIA TESTS] | T |
| Smart reveal (off by default) | [VERIFIED VIA TESTS] | T |
| Gear advisor and Gear page, upgrade router | [VERIFIED VIA TESTS] | T; the Gear page rendered on L10-05 with live levels and coins |
| Shopping list with manual overrides | [VERIFIED VIA TESTS], [OFFLINE FALLBACK] | T, UI smoke; page viewed L10-05 |
| Skills, Goals, Quests, Reference, Settings pages | [PROVEN IN LIVE GAME], [OFFLINE FALLBACK] | L10-05 (all opened with real progress) |
| Travel plan and branches, money/magic/training advisors, ledger | [VERIFIED VIA TESTS], [OFFLINE FALLBACK] | T |
| World map modal and wiki inspector | [VERIFIED VIA TESTS], [OFFLINE FALLBACK] | UI smoke; offline fallbacks tested |
| Offline behaviour (no RuneLite): UNKNOWN states, manual levels, local data | [OFFLINE FALLBACK] | T and UI smoke with a closed bridge; observed L10-05 while RuneLite was closed ("Not checked", "Connect RuneLite and I will check") |
| Network data builders and link checker | [NOT AUTOMATED] | run by hand, outputs validated by `check-data` |

## 8. Known gaps and honest limits

* No system tray, no installer, no web or phone build (removed in 2.7): the app is one window.
* The in-game parts that need a bank, exchange or shop window open (departure check, shop card, exchange helper, bank snapshot) and the danger radar have not been exercised live; they are tagged `[VERIFIED VIA TESTS]`.
* Auto-completion covers 62 of 69 steps. Seven steps carry no completion trigger and are marked by hand or through account sync: S1-01, S1-02, S1-10, S5-06, S5-07, S6-05, S9-03 (client setup, banking, buying, looking around a place, the Fairytale II intro). Account sync offers the earlier ones separately as unverified.
* Transport and travel distances are straight lines, not path lengths (obstacles unknown); Shortest Path draws the real route when installed.
* Wiki-derived datasets are snapshots (dates in section 5); they refresh only when a build script is run.
* Plugin and protocol are tied to the app version: an older plugin keeps working with fewer features and the app asks for a restart of RuneLite.
* The player confirms every purchase, offer, click and dialogue: the program highlights, prepares and routes only. In the game client at most about two automated interactions occur per several minutes, and none of them is gameplay (combat, skilling, looting, eating, movement, dialogue loops).
