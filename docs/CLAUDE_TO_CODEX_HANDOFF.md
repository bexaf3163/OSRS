# Claude → Codex handoff (living document)

## Current continuation - 2.80.7 preparation (2026-10-27)

Published baseline is NORMAL portable2.80.6 (sourcea7d3d54): Release40540103010 and Checks40540103432 succeeded. EXE102,075,688bytes, SHA256 `8c2a9ab105bb5d6c1f31f945ff0a7673287f505cd2e016859b595e132878c143`, matching GitHub digest/SHA256SUMS. Publish verified batches to main as normal releases autonomously; no previews or repeated approval.

Implemented in this batch:
- Shared food holding/allocation in the existing food/readiness pipeline: healing rather than piece count, one rounding after mixed healing, real-HP limits, deduplicated aliases and physical/manual stock allocated once.
- Readiness, departure, one-trip preparation, Shopping and goal funding use it. Quest ingredients/other demands remain reserved; optional food cannot consume required stock. Player snapshots are immutable; only watched food records are copied, and lists without food skip allocation.
- Unread alternatives remain unknown, but sufficient observed bag/bank stock still proves ownership. Merged alternatives must satisfy every source. Mixed food/exact demands stay conservative; no such collision was found in current four-step raw route windows.
- Java Checklist/Foods mirror the allocation and share healing with quest guards. Login, mid-session enabling and HP changes refresh the cap. Unrecognised alternatives receive no assumed healing credit. Estimates and cleanup reserves also use effective healing; heterogeneous partial alternatives stay protected.
- No new panels, settings, route IDs or save migration. Existing manual marks retain their original keys. Old unsafe20-any-fish regression expectations now cover both sufficient healing and insufficient weak food.

Verification: final source passed2233unit tests/189files, fullJava644tests, build/TypeScript, data0errors/warnings, rebuilt plugin jar, sourceElectron E2E75checks (including actual profile-conflict merge and first-write copy failures). Full browser1035checks PASSED on source3edc5af; portable2.80.7 is not yet published and new behavior is not live-game verified.

REAL UPDATE ACCEPTANCE PASSED: [run40549572912](https://github.com/bexaf3163/OSRS/actions/runs/40549572912) exercised published2.80.5 ->2.80.6, real download/digest/install/automatic restart, old-EXE/cleanup-note removal and healthy recheck. S1-01 save bytes were identical. T02's normal update path is verified; interrupted-update/power-loss recovery is not claimed.

Native profile-conflict merge is verified through its real UI action: every character remains, browser/native lists agree after reload, and both original lists remain as exact recovery copies. The merge logic already existed; do not rebuild it.

Native first-write-copy failure is exercised in isolated source E2E: primary save succeeds, Settings names the failed profile/copy, history is persisted, renderer reload retains it, and successful independent copies do not erase it. This is not cold-process warning restart acceptance or a guarantee of retaining an unwritable copy.

NEXT: finish browser/packaged release acceptance and record the portable receipt; then address confirmed inventory packing/acquisition/whole-goal potion gaps. Verify remaining Members models and reproduce historical audit candidates before changing them. Do not redo completed work or claim the full audit complete. Default guidance stays compact and Balanced.

Read this first. Claude keeps this file current after every release. It says what Claude received from Codex, what Claude changed, which engine owns each concern, what is in progress and what is still open. The owner wants **one coherent product built on engines**: before changing anything, find the engine below that owns the concern and fix or extend that engine. Never add a parallel mechanism, a per-step patch or an old feature back.

**Codex continuation, 2026-10-26:** work is based on main `ae22ab7`, released app **2.80.3**. The local forecast, combat upgrade, Ranged/Magic recovery, Fletching/Herblore processing, funding-aware training and compact Skills/XP-Balanced-Money changes are described in [CODEX_ENGINE_HARDENING_HANDOFF.md](CODEX_ENGINE_HARDENING_HANDOFF.md). They are published in **2.80.4**; the verified portable receipt is at the top of CODEX_ENGINE_HARDENING_HANDOFF.md. Historical release entries below remain historical; use the current open list and the new receipt before repeating work.

## 1. Baseline received from Codex

- Codex delivered **2.74.3** (main `7ba9aeea`, tree `f5aa4d76`), described in [CLAUDE_NEXT_SESSION.md](CLAUDE_NEXT_SESSION.md). Codex's backlog is [CODEX_AUDIT_BACKLOG.md](CODEX_AUDIT_BACKLOG.md) (T01–T17). Its handoffs (`docs/CODEX_*_HANDOFF.md`) still describe the subsystems Codex built.
- Owner decision 2026-10-24: Claude owns the in-game tests ([CLAUDE_IN_GAME_ACCEPTANCE.md](CLAUDE_IN_GAME_ACCEPTANCE.md)).
- Claude released **2.74.4 → 2.80.3** on main (see section 8 for the release receipts). Every release has `release-notes/vX.md` and an entry in CLAUDE_NEXT_SESSION.md.

## 2. Owner rules (binding)

1. **Engines, not patches.** A bug is fixed in the mechanism, so every quest, monster, spot or skill gets the fix, including ones added later. Content is data (JSON registries checked by a builder and by `npm run check-data` and tests), never `if (step === 'S5-08')`. `tests/noStepCodesInLogic.test.ts` fails on any quoted step code in `src/lib|components|services|pages` or in the plugin's main sources. The only exceptions are the save-migration map in `progress.ts` and the search-box example.
2. **One answer, minimal UI.** The player sees a verdict ("go here because: fastest, most coins, least walking"). The maths runs in the background. Show at most a few rows and no menus inside menus. Say each thing once. Do not add panels, tabs or a second HUD/overlay. One `OsrsPathGuideOverlay`/`HudModel` exists.
3. **Truth over guesses.** Never invent coordinates, levels, drop rates or prices. Take them from the OSRS Wiki through a builder script, or from the game. Unknown stays unknown (`PRESENT | MISSING | UNKNOWN`), never 0 or MISSING.
4. **A companion, not a bot.** No gameplay automation. Never spend GP. Never enter passwords.
5. English in code, docs, commits and UI, with canonical OSRS Wiki/Quest Helper names.
6. Members content must slot in as data: the same registries take `members: true` entries, and the engines already filter by account mode.

## 3. Engine map (reuse these, do not duplicate)

| Concern | Engine (files) | Data / builder / check |
| --- | --- | --- |
| Route steps | `src/data/steps.json`, `src/data/index.ts` (`allSteps`, `stepById`) | `npm run check-data` (`scripts/validate.ts`) |
| Quest name → route step | `src/lib/questSteps.ts` `questStepOf` (readiness re-exports it; Gear's `questStep` is an alias) | step `inGame.completionTrigger.questName` |
| Single player state | `src/lib/playerState.ts` (`buildPlayerState`, `heldOf`, `levelOf`, `questOf`) | live from the plugin, otherwise the profile |
| Readiness / preparation | `readinessEngine.ts`, `prepPlan.ts`, `readinessVerdict.ts` | `SAFETY_RULES` keyed by hazard (e.g. `/dragonfire/i` on threats.json hit labels). Test: a hazard step lists its protection |
| Prices, tax, trade restriction | `lib/funding/quotes.ts` (`PriceView`), `usePriceView`, `funding/ge.ts` `netEach`, `tradeRestriction.ts` | live GE board, shared, never refetched per feature |
| What a drop or a minute is worth | `src/lib/lootValue.ts`: `coinsPerMinute` (cows-cowhide rate × net hide price, a rough baseline), `dropValue`, `bankingPays` (the one keep-or-drop rule, never on the fastest objective), `coinTimeShare` (coins worth at most `COIN_SHARE_CAP` = half the time) | `fundingMethods.json` |
| Combat estimate | `src/lib/combatEstimate.ts` (hit chance, attacks to kill, food, `SpotTerms`) | `combatFoes.json` ← `npm run build-combat-foes` |
| Combat training spots | `src/lib/combatRoute/spots.ts` (`spotsOf`, `bankTrip`, `termsFor`) | `scripts/trainers.defs.json` → `npm run build-trainers` → `trainers.json` (wiki LocLine spawns near a route step, named bank, always-drops) |
| Fight plan (route combat steps) | `combatRoute/plans.ts`, `pick.ts`, `selection.ts`; UI `CombatRoute.tsx` (verdict + ≤4 rows) | scoring: time × penalty + kills − loot/rate; `gainOver` margins |
| Method rates (one entry) | `methodRates.ts` `methodRate` → `combatRates.combatRate` or `skillingRates.gatherRate`; shared `ModelRate`/`Market` (prices, restriction, objective); `rateKeyOf` cache key without position | — |
| Gathering (WC/Fishing/Mining) | `skillingRates.ts` (`gatherRate`, best of all spots, `toolFor`, aggression), `skillChance.ts` (wiki formula + cascade), `bankTrip.ts` (shared with combat), `aggression.ts` | `scripts/skilling.defs.json` → `npm run build-skilling` (`scripts/build-skilling.ts`, uses `scripts/wiki.ts`) → `skilling.json`; tests/skillingRates.test.ts (wiki examples, synthetic registry, catalogue sync) |
| Processing (Smithing/Cooking/Crafting) | `processingRates.ts` (`processRate`: best recipe open at the level × best station; bag = whole actions; ticks at the Make-X pace; success chart or flat chance; materials cost / product gain by `supplyPrice` / `dropValue`), `bankTrip.tripMinutes` (shared trip rule, `BANK_VISIT` for a processing visit) | `scripts/processing.defs.json` → `npm run build-processing` (`scripts/build-processing.ts`: wiki `{{Recipe}}`, success charts, Infobox stackable, Furnace/Anvil location tables via `wikitables`/`mapPoint`, Fire ObjectLocLines) → `processing.json`; tests/processingRates.test.ts (wiki guide calibration, synthetic registry) |
| Skills page ranking | `trainingRouter.ts` (`personalize`, `compare`, `buildPath`, `adviseTraining`), `methodPick.ts` (picks carry the engine's `spot`/`where`/`warning`; `pickedMethodId`) | `trainingMethods.json`. Combat methods get model rates from `combatRates.ts` (melee/ranged/magic + loot + arrow/rune cost). Sync test: every trainer spot has a Skills method and vice versa |
| Ranged arrows | `rangedAmmo.ts` (`rangedHit`, `arrowsForGoal`) | `rangedGear.json` |
| Travel | `travel.ts`, `travelInput.ts` (`networkUnlocked`), `detours.ts` (GE priority by place) | `transport.json` (`unlocks`, `oneTime` checked against the route by a test), `transportNet.json` |
| Item sources | `sourceRouter.ts` (`FREE_GIVERS` by NPC → `giverStepOf`) | majorLocations.json, f2p-items.json |
| Bank cleanup | `cleanup.ts` (`OBSOLETE.afterQuests` by game quest name) | test: every named quest is a route quest |
| Step rewards | `stepRewards.ts` (`rewardCoins`, `coinRewardAhead`) | check-data: reward numbers use comma thousands |
| Wiki reading for builders | `scripts/wiki.ts`: one `wikitext()` fetch, `templates()`, `successCharts()`, `locLines()`, `pointsOf()`, `middleOf()` | build-skilling uses it; the older builders still have their own fetch (open) |
| In-game guidance | plugin: Quest Helper machines (`QhMachine`), `StepGuide`, one HUD | `questMachines.json`, `questStages.json` |

## 4. What Claude changed (2.74.4 → 2.80.3)

- **Quests, live fixes (2.74.4–2.74.16):** Melzar's Maze follows Quest Helper's rooms and keys. The lesser demon and Lost City are magic fights with required runes. Dragon Slayer S5-01 waits for all five questions, and S5-04…S5-07 follow game state. There is a death recovery path to Elvarg (volcano shortcut or hull repair). Stage 7 boss food is required where the game checks it. Only the nearest copy of a shared object ID is outlined. Every in-game card line is ≤225 characters. The free Anti-dragon shield comes from Duke Horacio.
- **App/UI minimalism (2.74.10–2.74.25):** one preparation panel; prerequisites named once; Skills is guide-first; the compact Bag/Now tabs say each thing once; Money details don't repeat.
- **Codex backlog items:** T01 profile conflicts and copy failures; T02 update cancel/retry, plus a real two-version update test; T03 members tool tiers on F2P; T05 owning the items meets acquisition steps; T06/T07 Demon Slayer in three phases; T09 FPS/overlay telemetry; T11 arrow counts; T12 GE buy-limit rounds; T15 plugin jar version gate; T16 advisories.
- **Skills content (2.74.18–2.74.21):** the wiki F2P training guides for every skill, "Other options", no outgrown methods.
- **T10, fight plan as one answer (2.74.23, 2.75.0):** trainer spot registry; per-spot bank trips; loot banked when it pays; quest-gated Brutus; one plan per spot; compact UI.
- **2.76.0:** the Skills combat methods are ranked by the same combat model for the character's levels and worn gear, with drops and arrow/rune costs. The Skills page and the fight plan agree, and the path under the card weighs every level the same way.
- **2.77.0, engine audit:** every step-code special case became a general rule (safety by hazard, GE priority by place, cleanup by quest name, free givers by NPC, fairy rings in transport data, coin tip by reward, plugin incantation hint by quest stage). Reward-number format was fixed and is now checked, and the guard test was added.

- **2.78.0, the gathering engine:** see section 3 (Gathering row). The registry holds 12 resources and 33 wiki-checked spots for 11 F2P methods. Rate = wiki success chance (level, best usable owned tool) and roll ticks, plus moving between trees/rocks/spots, plus the shared cap of rocks/trees (count, respawn, despawn timers), plus the bag (tool worn if Attack allows, bait slot), plus drop vs bank (`bankingPays` with the objective). All candidate spots are scored by time per XP less `coinTimeShare`. Spots whose wiki-verified aggressive NPCs would attack this player (combat ≤ 2× their level, or combat unknown) lose to safe ones, and a forced one carries one warning. Ties within 2% go to the spot nearest the method's catalogue place. With tool ownership unknown (bank unread) there is no rate and the wiki guide stays. Picks carry the spot to the Location card, the nav button and the in-game step. Method notes no longer name one place.

- **2.78.1, hardening (costs, eligibility, contracts):**
  - **Fight plans** (`combatRoute/plans.ts` `assemble`): score = effort + kills·0.05 − credit. Credit is (loot − food at its price)/rate, with a gain capped at `COIN_SHARE_CAP` × effort and a cost counted in full. With no food price, no coins are counted. `PlanInput.objective`: fastest sets rate = null, so no loot is kept and no coin terms apply. `playerStateContext` passes the Settings priority.
  - **Skills ranking** (`trainingRouter.compare`): `netCoinsPerHour` = loot − `costPerHour`. When either method's cost is unknown (null, or a wiki-only method with `cost: 'cost'`), no coin terms apply.
  - **`ModelRate.costPerHour` semantics:** 0 = nothing used up, null = used up but the price is unknown. Melee now costs the food the estimate eats (Salmon at its buy price); gathering without bait = 0.
  - **Supply prices** (`sourceRouter.supplyPrice(name, prices, mode)`): the one price rule for a used-up supply (arrows, runes, bait/feathers, food) in every rate model. It uses the exchange buy price, else the cheapest shop of `f2p-items.json` that sells it for coins to this account (members shops never on F2P), else null. Shop travel is not in it. Before this, a market without an arrow price left the ranged cost unknown while the loot still slowed the frogs, so monks won in the app (the UI ranged checks caught it). Covered by `tests/combatRates.test.ts` (GE / shop / members-only / unknown).
  - **Reserves = the exchange list** (`funding/snapshot.protectionsFor`): it reads `aggregateShopping(..., { wholeGoal: true })`, so food bought for a whole plan (`totalAmount`) is protected in full. Before this it protected one trip, and cleanup could offer to sell food Shopping had just bought. Covered by `tests/routeReserves.test.ts` (fails without the fix) and by `tests/contentContracts.test.ts` "changing an adopted plan" (method change → tools kept/prepared; food plan → trip in the bag, goal in the reserve). This closes open item (b).
  - **Money ↔ Skills, gathering** (`funding/gatherAdapter.ts` → `skillingRates.gatherPace`): a funding method of family `gathering` with one certain output, whose `spot` is within 30 tiles of a registry spot of that product, is personalised by the gathering engine (success chance for the level, the tool the evaluator plans via `EvalContext.personalise(m, tool)`, the spot's tree/rock cap). The published pace with `levelScale`/`toolScale` stays only where the registry has no spot (Dwarven Mine iron/coal), the tool's ownership is unknown, or a depleting spot has no count (the single oak east of Draynor Bank: refused, not timed as endless). Matched now: chop-yew-edgeville, fish-lobster-musa. Engine vs published per hour (Rune axe / Lobster pot): yew Edgeville 168–190 at WC 60, 199–224 at 80 (published 83–150); lobster Musa 206–236 at Fishing 60 (published 122–222). Combat money methods already shared `estimateStep`. Tests: `tests/funding/gatherAdapter.test.ts`. Not yet: the Dwarven Mine spots in `skilling.defs.json` (needs a wiki rebuild with network).
  - **Forecast:** `buildPath` re-rates future legs at their level every `FORECAST_STEP` (5) levels via `personalize(raw, …, atLevel(state, skill, lv))`.
  - **Rate cache:** keyed by price-snapshot identity (`priceKeyOf`, WeakMap), not by timestamp.
  - **Eligibility:** `spotsOf(steps, members)` has no default. Facts use `true` (`termsFor`, `combatRates`); offers use the account mode (`plans.ts`: members only when the state says members).
  - **Safety:** `safetyRulesOf(step)` reads the step's fights. `PrepPlan.safety` carries the rules and `readinessVerdict` reads them from the plan. Nothing looks a rule up by step code.
  - **Generic regression coverage added:**
    - `tests/contentContracts.test.ts` (synthetic steps through the real prep engine): rename invariant; new hazard encounter gets its block; unread bank is not missing; noted food not usable; worn tool counted once; banked → TAKE; unknown → not READY; F2P never gets a members method.
    - `tests/combatRoute/objectiveCosts.test.ts`: food ranked; fastest keeps time; the credit bound; unknown food price.
    - `tests/skillingRates.test.ts`: wiki worked examples; tools; objective; restriction; synthetic spots incl. bank journey, members and hostiles; forecast; catalogue sync.
    - `tests/combatRoute/plans.test.ts`: members spots explicit.

- **2.78.2, tool upgrades weighed (block a):**
  - **Engine:** `skillingRates.upgradesAt` lists, for the picked spot, every better tier of the method's tool family. Each tier must be usable at this level, allowed on this account (members tools never on F2P), not owned, and priced (`supplyPrice`). Each comes with the rate it would give at the same spot. It returns `ModelRate.upgrades`, which `personalize` copies to the method.
  - **Rule:** `trainingRouter.toolUpgrade(m, xpLeft, priority, coinRate)`:
    - Fastest: the tier saving the most hours (≥ 10 min), price shown.
    - Balanced: the tier whose hours saved × `coinsPerMinute` beat its price by the most; nothing without prices.
    - Relaxed: none.
  - The hours are the current method's to the goal, a floor, since later methods gain too.
  - **UI:** one clause at the end of the existing reason ("a Rune axe (≈ 7k gp) saves ≈ 23 h"); `TrainingAdvice.upgrade` carries it.
  - **Tests:** `tests/skillingRates.test.ts` "a better tool is weighed…".
  - **Example, recorded market:** Mining 41 with an Iron pickaxe → "a Rune pickaxe (≈ 19k gp) saves ≈ 7 h"; Mining 15 with Bronze → Steel (≈ 230 gp) saves ≈ 24 min.
  - **Not yet:** weapons/bows/staves (combat gear upgrade); the cash the player has is not checked (the price is shown, the Money page funds it).
- **2.78.2, spots under the ground (gathering registry):**
  - A defs spot may name `entrance` (a `kind: dungeon` place of majorLocations.json). `build-skilling` checks that the spawns lie 6400 tiles north of it (±200, the same rule as `bankTrip.legTiles`) and refuses an underground spawn group without one. It writes `waypoints: [entrance, spot]`.
  - The engine follows those waypoints everywhere:
    - the bank trip goes through them (`bankTrip({ waypoints })`);
    - `RateSpot.waypoints` → `TrainingPick.spot.waypoints` → `withTrainingMethod` sets `inGame.pathWaypoints`;
    - `trainingNav` points the arrow at the way in ("… (way in)");
    - `gatherPace` matches a money method by the way in (the Dwarven Mine methods name the entrance).
  - **Data added (wiki rebuild):** resource `coal`. Spots:
    - iron, Dwarven Mine (9 rocks, scorpions attached);
    - coal, Dwarven Mine (7);
    - coal, Barbarian Village mine (4, Edgeville Bank).
  - **Effect:** `mine-iron-dwarven` and `mine-coal-dwarven` on the Money page are now engine-timed too. No gathering money method is left on the scaled published pace except the uncounted oak.
  - **Approximation:** the only Dwarven Mine way in in the place data is the Ice Mountain ladder (3018,3450), so the Falador East Bank trip is long. Adding the Falador staircase to majorLocations.json (wiki-verified) and using it as the entrance would shorten it.
  - **Tests:** `tests/skillingRates.test.ts` "a spot under the ground (synthetic)"; `tests/funding/gatherAdapter.test.ts`.

- **2.79.0, the processing engine (block e, first part):** Smithing, Cooking and Crafting methods get per-player rates and a station, the same way as gathering.
  - **Registry:** `processing.json` is built from the wiki by `build-processing`. It holds 21 recipes for 13 catalogue methods: bronze axe/scimitar/warhammer, bronze–adamant platebodies, chicken/beef/trout/tuna, leather gloves/boots, gold ring/necklace/amulet, sapphire–diamond. Stations: Edgeville/Al Kharid/Falador furnaces and the Varrock anvil building, each with the wiki's tiles to the bank, plus the Barbarian Village fire → Edgeville Bank.
  - **Builder checks:** the recipe's facility matches the station kind, every material says stackable yes/no, a cooking recipe has a fire-or-range chart line, and the methods are in sync with the catalogue and its skill.
  - **Engine:** `processRate`, wired as the third engine in `methodRate`. Rate = whole actions a bag allows (tools and stackables take a slot each) × ticks + one bank trip per bag (`tripMinutes(bankTiles, 0, BANK_VISIT)` or `bankTrip(fire, BANK_VISIT)`), × success chance.
  - **Coins:** materials at `supplyPrice` (cost); the product at `dropValue` (gain, after tax; 0 when restricted). Either unknown → `costPerHour` null and no gain shown.
  - **Score:** same as gathering — time per XP less `coinTimeShare`, nothing on Fastest. Ties go to the station nearest the method's place.
  - **Calibration (tests):** the wiki guide rates (bronze axe 13.5k … adamant platebody 250k at Varrock West; gold items 1,350/h at Edgeville) lie within the model's range, with the fast end within 10%.
  - **Shared rule change:** `bankTrip`/`tripMinutes` take the bank seconds as a parameter. Combat keeps its 20–45 s, processing uses 3–15 s.
  - **Not yet:** Money page processing methods (smelt-steel-bars, pies…) on this engine; Firemaking (lines and moving), Runecraft, Prayer, Magic utility, wine; cook-on-the-spot (fishing + fire as one plan).
  - **Ranking fixes found by it (`trainingRouter`):**
    - Setup time by what is missing: a stop that only takes from the bank costs `BANK_SETUP_HOURS` (0.1 h); anything to buy costs `SETUP_HOURS` (0.25 h, unchanged). Owned supplies win at close speeds (`tests/trainingPriority.test.ts`).
    - The rate cache is keyed by the method object, then the state/prices/rules key. A custom list reusing an id no longer reads another method's rate.
    - One label rule for a method's point (`methodStep.pointLabel`): "Cooking: Tuna — Barbarian Village fire" whether the place is the catalogue's or a station the engine picked.
    - Test premise updated: `skillHandover` "owned banked recipe": 100 banked trout at Cooking 30 cover 7k of 88k XP, and tuna is now measured faster, so tuna is picked; at 25 the banked trout are taken.

- **2.79.1, Money ↔ Skills for processing:**
  - **Engine:** `funding/processAdapter.ts` → `processingRates.processPace`. A funding method of family `processing`/`production` with one certain output that the registry makes, at a registry station within 30 tiles of the method's `spot` (or no facility), is timed by the recipe: ticks / (success chance × output), slow end +10%. The evaluator keeps its own trips and sale time. `fundingContext` composes combat ?? gather ?? process.
  - **Data:** smelting recipes added from the wiki: bronze, iron (50% chance from the recipe note), silver, steel (1 iron ore + 2 coal), gold. Matched now: smelt-steel-bars and smelt-silver-bars at the Edgeville furnace.
  - **Effect (Smithing 40, test prices):** steel 565 bars/h vs 373 on the published pace (both include the evaluator's trips and sales).
  - **Unchanged:** the pie, pizza, chocolate, jug and shop methods (no skill recipe in the registry) keep the published pace.
  - **Tests:** `tests/funding/processAdapter.test.ts`.

- **2.79.2, live report fixes (owner, 2026-10-25):**
  - **(1) "Buy Anti-dragon shield" while training Defence.** Cause: `PrepAuto` led the arrow for the next *quest* step's preparation even while a tracked skill plan led the game. Fix in the shared decision: `prepQueue.decideAuto` takes `routeWaits` (a tracked plan, `useTracked`). It then sets no arrow, and returns `release` for an arrow a detour frame set itself (`frame.nav === navKeyOf(standing)`). `PrepAuto` calls `releaseNav`; the player's own arrow is never touched. Test: `tests/prepQueue.test.ts` "while a skill plan leads the game".
  - **(2) The card ignored the followed plan; other methods showed no coins.**
    - `trainingRouter.methodOfGuideStep` links a guide step to its catalogue method by what is trained: a combat NPC ↔ `npcNames`, a gathering object ↔ `objectNames`, same skill, overlapping levels. It is null when ambiguous (fishing spots).
    - `adviseTraining({ followed })` returns `followed` (that method's view with this player's reason). Every shown `MethodView` carries `reason` from the one formatter `reasonFor`.
    - `SkillDetail` passes the tracked plan's current step (`SkillRoadmap.useTrackedStep`) to `TrainingCard`. The card leads with "Your plan (the game follows it)" plus one "Recommended for you" line; the pick's count/time lines are hidden then.
    - "Other methods" prints `v.reason` (rate, gp/h, costs, first/locked).
    - Test: `tests/followedPlan.test.ts`.

- **2.80.0, cook on the spot (owner's T10 ask "fish cooked on the spot"):**
  - **Engine (composition, no new engine):** `skillingRates.alongRate(m, gatherSkill, processSkill, …)`. A gathering method's spot with a processing station within `ALONG_REACH` (15 tiles) whose recipe (of the second skill, open at its level, one input = the catch) takes the product.
    - Per catch: gather time + recipe ticks + the walk to the station once a bag + bank/drop of the result (`bankingPays` at the processed value; a burnt one is worth 0).
    - It returns both skills' XP/h.
  - **Decision (`methodPick.alongPlan`):** for a step with two goals (S6-02), it takes the combination when the hours to both goals are ≤ fishing then cooking at the cooking goal's own best method. Time only (it also spares buying raw fish; not counted), with today's levels.
  - **Step:** `TrainingPick.along` → one quick step "Cook the trout on the Barbarian Village fire beside the spot, then drop/bank them…", and `objectNames` + "Fire".
  - **Data:** salmon recipe (Cooking 25, 90 XP, own burn chart) from the wiki.
  - **Tests:** `tests/cookOnTheSpot.test.ts` (F30/C20 → along; F45/C40 → plain fishing because wine is faster later; salmon only from 25).

- **2.80.1:** tool upgrade suggestions check the known coins (`ToolUpgrade.short`).

- **2.80.2:** the bank-only ranking rule is general (was `kit === 'f2p-bow'` only).

- **2.80.3, Firemaking on the processing engine:**
  - **Data:** defs `light` = the action length ("Lighting any logs: 4 ticks per log", checked on Game tick/Action lengths) plus the Firemaking page's "Firemaking success chance" Normal line (low 64, high 512). Recipes with `light: true` read the log page's `{{Firemaking info}}` tinderbox version (level, XP), tools Tinderbox, `output: null`, `retry: true`. Methods fm-normal … fm-yew.
  - **Engine (`processingRates`):** a `retry` recipe charges failures as time (`ticks / chance`): every action ends in a success, the material is used once a success, and `output: null` has no value. Logs are a cost.
  - **Calibration test:** the wiki guide's 1,485 logs/h lies in range at willow/maple/yew levels.
  - **Approximation:** the wiki calls the lighting chance a crowdsourced belief ("citation needed"); the same line is used for every log. Lines are burnt "by a bank": a 3–15 s bank visit, no walk back along the line.
  - The `trainingRouter` "no speed" test now uses wine (still unrated).

## 5. Current continuation (Codex, local candidate)

Baseline remains released **2.80.3**, main `ae22ab7`; candidate branch `codex/engine-hardening-2-80-3`. See [CODEX_ENGINE_HARDENING_HANDOFF.md](CODEX_ENGINE_HARDENING_HANDOFF.md) for exact changes, verification and limitations. No candidate release/EXE exists yet. Historical release bullets above describe those releases only.

The owner brief's status:
- (a) Gathering upgrades and cash-shortfall disclosure were released. Local additions: shared melee/bow/ordinary staff eligibility and combat simulation, cost-only staff savings, and savings limited to the current method's forecast leg. Local advice now counts the shared acquisition allowance and reserves known missing next-trip kit costs via Funding. Actual detour routes, route fees, replenishment across the full goal and future purchases remain open.
- (b) Reserves: released in 2.78.1; no new autonomous purchasing or selling.
- (c) Shared gathering/combat/funding adapters: released. Processing costs, supplies and output now also share batch mechanics locally.
- (d) Real-session calibration: pending Claude's game acceptance.
- (e) Local processing additions: wine, explicit paid banked Prayer methods, Superheat iron, and four F2P rune altars. All use the shared registry/model; no step-specific formulas. General enchant/alchemy automation remains excluded by its manual target/budget safeguards.

**Next actions:**
1. Review the local candidate and obtain browser smoke, source Electron and isolated portable evidence in a working execution environment. Current Windows execution restrictions prevent these gates; do not weaken them.
2. Extend current next-trip kit reservation to actual acquisition routes, route fees and goal-wide replenishment if needed. Cost-per-effective-HP food ranking is now used by the existing fallback food suggestions, with explicit membership; automatic substitution across combat plans/preparation/shopping is still open.
3. Calibrate wine fermentation, altar travel, Prayer pace, Superheat and combat estimates against reachable real sessions. Do not grind or spend merely to force a test. Use docs/CLAUDE_IN_GAME_ACCEPTANCE.md.
4. Keep further utility Magic methods manual until exact expendable targets, prices, required skills/equipment and spell mechanics are verified.
5. Recheck latest main before publication, reconcile concurrent Claude work, run every gate and only then make a new version. Never overwrite 2.80.3.

Watch-outs:
- `fishingClimb` "the pick settles…" is an exhaustive test with an explicit 20 s timeout. Do not lower it.
- 2.80.2's first Release run failed only the first three `skill handover (390)` UI checks, 4 s after the preview server started. The 1280 px versions and the full local run of the same commit passed, and a rerun of the failed job passed. This is a cold-start timing flake in `scripts/ui-smoke.ts`'s first scenario. If it recurs, make that scenario wait for the app to settle; do not loosen its assertions.
- Releases: a `package.json` version push to main triggers Release. Wait for one Release run to finish before pushing the next version.

## 5b. What each engine knows, assumes and does not support

| Engine | Verified game facts (source) | Player observations | Model assumptions (bounded, disclosed) | Unknown / unsupported |
| --- | --- | --- | --- | --- |
| Combat estimate (`combatEstimate.ts`) | Monster stats, max hits, attack speeds, XP bonus (wiki infobox via build-combat-foes); food heals (wiki) | levels, worn gear, measured pace (combat log) | time between kills `[2,6]` s, eat threshold `max(2×maxHit, special+1)`, 15% slow-end margin, competition not modelled | prayer flicking, safespot pathing beyond the listed ones, manual special-attack avoidance, multi-combat beyond `groupAggro` |
| Combat spots / fight plans (`combatRoute/*`) | spawns (LocLine), always-drops, named banks, quest gates (wiki + route) | bank contents, quests done, adopted plan | bank trip = straight line (fast) / ×1.4 walking (slow) + 20–45 s banking + ladders; `SWITCH_MINUTES` 6; coins valued at the cowhide baseline, credited at most half the time; food priced at its buy price even when owned | travel by teleports for bank trips, loot beyond the sell drop, boss respawn variance beyond the listed range |
| Gathering (`skillingRates.ts`) | success low/high per tool (Skilling success chart), roll ticks (Action lengths), XP/level/respawn (info templates), tree despawn timers, spot spawns and counts, aggressive NPCs' levels and spawns (wiki, build-skilling) | levels, tools owned (bag/worn/bank), combat level for aggression | moving between trees 2.4–6 s, rocks 0.6–1.8 s, fishing spot moves every 250–530 ticks costing 3–8 s, drop 0.3–0.6 s an item, 10% slow-end margin, tool worn when Attack allows | competition and Forestry events, the Al Kharid toll and Port Sarim deposit boxes, banking by boat (Musa Point is drop-only), oak/normal trees without wiki spawns (drop-only), aggression tolerance after 10 min |
| Processing (`processingRates.ts`) | Wiki recipe/action lengths, burn/success charts, staff bonuses and requirements; consumed bone XP/timing; Superheat spell/rune/Smithing facts; rune output multipliers and exact altar exterior/interior/exit coordinates (shared builders) | levels, mode, held/equipped alternatives, prices, restrictions, objective | bank visit 3–15 s, 10% slow margin; wine waits once per documented 13-jug batch (continuous bank fermentation not simulated); altar arrival near exit portal, cross-area transition uses shared bank-trip allowance, walking only; thread one per item | uncalibrated altar arrival/route winding, teleports/pouches, continuous wine optimization, ranges in kitchens, general enchant/alchemy, Firemaking return walks; tools still require prep |
| Ranking (`trainingRouter.ts`) | catalogue brackets from the wiki guides | measured XP/h overrides | the 5% band as a tie on hours; `SWITCH_GAIN`; future path legs re-rated every 5 levels (`FORECAST_STEP`), with today's gear and tools | gear bought on the way (local upgrade advice does not yet simulate future purchases); see the Codex receipt for forecast repairs |
| Preparation / safety (`prepPlan.ts`, `readinessVerdict.ts`) | hazards from threats.json hit labels; items/quantities from the route | bag/bank/worn/noted from the plugin; untracked rows stay UNKNOWN | — | hazards other than dragonfire need a new `SAFETY_RULES` entry (a new mechanic, not data) |
| Value of coins (`lootValue.ts`) | GE prices and tax (live board, `netEach`), trade restriction list | restriction state | cowhide baseline: `fundingMethods.json` typical 260 hides/h × net hide price; it is NOT this character's best earning method, so it is capped (`COIN_SHARE_CAP` 0.5) and never used on the fastest objective | the cost of buying tools or gear is not yet in the ranking (open, block 1 continuation) |

Calibration against real sessions is pending: the measured pace (combat log, `measuredXph`) already overrides the model where it exists; a play session with recorded start stats, gear, method and supplies is needed for predicted vs observed XP/h, food, bank time and proceeds (NOT REACHABLE while the owner is away from the PC).

## 6. Open (not done)

- Latest local continuation: read the recovery/recipes/compact Skills section of CODEX_ENGINE_HARDENING_HANDOFF.md. Balanced is default; do not restore a duplicate skill menu, auto-expanded alternatives, or impossible bow+shield predictions. No release/portable/UI/game acceptance is claimed.
- Complete source-backed models for remaining guide-only Members skills. SKILLS_COVERAGE.md now explicitly distinguishes catalogue/guide coverage from model support. Route Money comparisons currently deduct food but not potion/armour acquisition; retain that limitation until the shared plan economics is extended.

- T10: actual acquisition routes/fees, goal-wide replenishment/future purchases, automatic food substitution across all consumers, and the static roadmap's "now" bracket versus the personal model pick. Local advice now reserves known next-trip kit costs, counts the shared acquisition allowance, and ranks fallback food suggestions by effective healing/cost with membership guards. These are not published yet.
- Processing: wine, paid banked Prayer, Superheat and four F2P rune altars are now implemented locally. General enchant/alchemy retains manual safeguards. Continuous wine fermentation, teleports/pouches and live altar travel calibration remain unsupported/unverified; see the receipt.
- Gathering approximations: tree/rock move seconds, spot-move cost, drop speed and the 10% slow-end margin are model assumptions; competition (other players) and Forestry are not modelled; oak and normal trees have no wiki spawns, so they are drop-only with no bank trip; the Al Kharid toll (10 gp unless Prince Ali Rescue) and the Port Sarim deposit boxes (no wiki coordinates) are not modelled; aggression tolerance after 10 minutes is not counted.
- Musa Point banking by boat and deposit box is not modelled; such spots are drop-only until it is added as data (`skilling.defs.json` `why`).
- Builder consolidation is implemented locally: combat foes, ranged gear, style gear and trainers now use scripts/wiki.ts. Before/after replay of the same recorded Wiki responses produced byte-identical output for all four; no related app data was regenerated in place.
- In-game acceptance still pending: live S5-08; T04 world hop/logout; T08 live restart; looking at 2.74.20–2.77 in the app (CLAUDE_IN_GAME_ACCEPTANCE.md).

## 7. Do not

- Do not re-add removed per-step mechanisms: `GE_PRIORITY_STEPS`, `SAFETY['S5-08']`, `styleGear.QUEST_STEP`, `FAIRY_RING_STEP`, the UpgradePrompt `S1-09` check, `KNOWN_SPOTS`/hard-coded trainers (now `trainers.defs.json`), the old `xp-only` plan key (mapped by `planKeyOf`).
- Do not store the automatic fight-plan choice while prices are offline; it locked in Brutus before loot was known.
- Do not give a feature its own price fetch, its own quest table, its own bank-distance maths or its own loot rule. Use the engines above.
- Do not add UI rows, tabs or panels to explain maths. Put the reason in one sentence.
- Do not modify the owner's other checkouts. Do not force-push. Do not publish the character name. Do not reference HDOS.

## 8. Verify and release

```
npm run build && npx vitest run && npm run check-data
cd runelite-bridge && JAVA_HOME=<jdk17> ./gradlew -q test
npm run test:ui            # long; the browser UI suite
```
Fixture docs: `UPDATE_FIXTURES=1 npx vitest run tests/defaultPlans.test.ts tests/skillsCoverage.test.ts`. A release is a `package.json` version push to main. Bump `package.json`, `package-lock.json` (2 places), line 1 of `CLAUDE_REDESIGN_HANDOFF.md` and `BridgeServer.PLUGIN_VERSION`. Add `release-notes/vX.md`. Then watch the Checks and Release workflows.

Release receipts (Checks and Release both green; the portable EXE's sha256 as published):

| Version | Commit | Portable EXE | sha256 |
|---|---|---|---|
| 2.78.0 | a45a7b6 | OSRS-Put-2.78.0-portable.exe, 102,063,235 B | e341aaee0d314f215e2af6db3388554d9d9be3f1d9e58468b8ba6ce85878da1d |
| 2.78.1 | 6a95df7 | OSRS-Put-2.78.1-portable.exe, 102,063,845 B | 4720cb99da427d0e6051f212cbeee87a7a747df03e0883e0bb73c01fdf4e5fa3 |
| 2.78.2 | b130ddf | OSRS-Put-2.78.2-portable.exe, 102,065,776 B | bd0193ee97e1f40b18fc0ca7cfb1e5b5a0f77255926620ebfa45278f150f0eb3 |
| 2.79.0 | 23da9f5 | OSRS-Put-2.79.0-portable.exe, 102,066,310 B | 63645fdcfae083b09988523cdd2686490fd8e55692d56d94aad64f0aa33723e6 |
| 2.79.1 | 8dc30e8 | no release of its own: pushed together with 2.79.2, which carries it | — |
| 2.79.2 | 570d479 | OSRS-Put-2.79.2-portable.exe, 102,068,589 B | 2b9c42121747e9661f837c02715efe21c89d6b2bdc9b29d1e4c3968d5228d486 |
| 2.80.0 | 6ea83b4 | OSRS-Put-2.80.0-portable.exe, 102,068,579 B | e8b828fe97cea449be300ead036f88cba049c54bd3b9c592057f21cee7336d6e |
| 2.80.1 | bda9cd5 | OSRS-Put-2.80.1-portable.exe, 102,068,427 B | 1d7ebab137f0b509e98763425d5e0d202b8bbac35d68e587ea825011ea067e14 |
| 2.80.2 | edd7dfd | OSRS-Put-2.80.2-portable.exe, 102,071,119 B | c4b28352aa81d1ef5a8f4b7bf1d30088227d53ed826eac963bd39ab1727662d5 |
| 2.80.3 | 69d7cf3 | OSRS-Put-2.80.3-portable.exe, 102,067,984 B | a79e2255697c2f3078d8c580186b683a0170314aa9714a594fe8a07268b9762d |
