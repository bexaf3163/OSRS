# Clear Path redesign: feature matrix

Every capability of the 2.47.0 application and the RuneLite addon, with where it lives now. Nothing is removed: a row says
"moved" when only the way to reach it changed. The status column is the state of this branch, not an intention.

Legend for the verification column: **U** = vitest unit test, **J** = Gradle/JUnit test, **S** = `npm run test:ui`
scenario (real browser, stub bridge), **V** = looked at in a screenshot (`redesign-shots/`), **-** = unchanged code path,
covered by the earlier suites.

Simulated versus live: everything the browser checks runs against a stub RuneLite bridge, and the Java checks run against
fixtures and rendered images. No check here ran against a live RuneLite client.

## Shell and navigation

| Existing capability | Was | Now | State / data source | Verification | Status |
|---|---|---|---|---|---|
| Path, Skills, Reference sections | Header tabs | Header tabs with visible labels (row 2 of the header below 1320 px, bottom bar below 900 px) | route | S, V | done |
| Goals, Quests pages | Own header tabs | **Journal** tabs *Quests* and *Stage goals*; `#/quests` and `#/goals` still open their tab | route, progress | U (`journalTabOf`), S | moved |
| Session and resource journal | Settings > Progress | **Journal > Session** (the Settings block stays) | bridge session, ledger | S | moved |
| Gear page | Emoji icon button | **Gear** section tab | gear advisor | S | moved |
| Shopping page | Emoji icon button | **Shopping** section tab | shopping list | S | moved |
| Search (`/`) | Header button | unchanged | search index | S | kept |
| Settings | Header icon | unchanged | settings | S | kept |
| F2P / Members switch, QP and progress ring | Header | unchanged | store | S | kept |
| RuneLite link indicator | Header ("Linked") | Header: *RuneLite connected*, *Waiting for character*, *Connecting...*, *RuneLite offline* | bridge state + `inGame` | U (`linkState`) | changed text |
| Zen / Inspector | Header toggle, Settings | unchanged control; Zen folds the raw data, Inspector opens it (Details tab) | features | S | kept |
| Old deep links `#/step/<id>`, `#/skills/<id>`, `#/reference/<id>` | Router | unchanged | route | S (94 pages at 390 and 1280) | kept |
| Interface scale and font size | Settings > Look | unchanged; window auto-adapt now only scales **up** on large windows | `ui.json`, `--text-scale` | - | changed |
| Always on top | Settings > Look | unchanged | `ui.json` | - | kept |
| Compact Path view | none | Header button, Settings > Look switch; *Full workspace* returns | `features.compact` | U, S, V | new |

## Path workspace

| Existing capability | Was | Now | State / data source | Verification | Status |
|---|---|---|---|---|---|
| Route rail with stages, locks, QP | Left column (wide) / accordion list (narrow) | Left column (wide) / **Route drawer** (narrow) | steps, progress | S, V | moved |
| Selected versus current step, "to the current step" | Rail | Rail and drawer | next-step | S | kept |
| Previous / next step | Footer | Footer | - | - | kept |
| Review banner (V2 changes) | Top of the page | Top of the page (wide and narrow) | progress.reviewedV2Steps | - | kept |
| Account sync plaque | Narrow only | Top of the page at every width | bridge quests | - | kept |
| Tracked skill card | Top of the page | Top of the page | skillTrack | S | kept |
| Gear banner | Top of the page | Top of the page | gear advisor | - | kept |
| Current action and place | Mixed into the step card | **Current action** block above the tabs; names the live instruction only with evidence, otherwise "Starting point" | sub-step finder, navTarget | S, V | new |
| Readiness verdict, Fix, Start the step | Status line with *More* accordion | Status line; details are in the Preparation tab | readiness engine | S | moved |
| Quest walkthrough, dialogue options, sub-step hero | Step card | **Steps** tab: overview rail, dialogue, lead button, folded full walkthrough | questStages | S | moved |
| Required / recommended items, bring, money, training, magic, upgrades, gear, food, branches | Step card and *More* tabs | **Preparation** tab | readiness, one-trip plan | S | moved |
| Future preparation (needed now / later / do not take now) | Folded section | **Preparation** tab (one-trip card) | prepPlan | S | moved |
| Step map, transport options, Show in the game, preflight panel, pacing | Step card and *Route and game* tab | **Travel** tab | stepPlaces, travel net, bridge | S | moved |
| NPC and place plaque, links, rewards, requirements, level targets, notes, raw fields | Step card | **Details** tab | step data | S | moved |
| Manual completion, skip, remove mark | Large *Done* button | Quiet *Mark as manually completed* action in Steps; undo toast unchanged | store | S | changed |
| Recovery banner and mode | Status block | Status block (always above the tabs) | recovery engine | S | kept |
| Wiki dossier | Pinned third column | On-demand drawer; **Pin to the side** (remembered) | wiki service | S | changed |
| Preview versus active map target | World map modal | unchanged modal; link status wording | navTarget | S | kept |
| Floor labels (Ground, 1st, 2nd, 3rd) | Place strings | unchanged | step data | - | kept |
| Target saved while offline | Showed as live | *Target saved. Waiting for RuneLite* | `linkState.targetStatus` | U, S | fixed |

## Skills, Gear, Shopping, Journal, Reference, Settings

| Existing capability | Was | Now | State / data source | Verification | Status |
|---|---|---|---|---|---|
| Skill registry, manual level entry, live sync | Skills page | unchanged; cards keep their own height | progress, bridge stats | S | kept |
| Skill page: levels, plan row, training card | One long page | **Overview** tab | skills.json, trainingRouter | S | moved |
| Leveling roadmap | Drawer from the Skills card | **Roadmap** tab (the drawer stays on the Skills page) | skillGuide | S | moved |
| XP calculator | Same page | **Calculator** tab | xp | S | moved |
| Training plan table, intro, sections | Same page | **Reference** tab (plan link from Overview jumps there) | skills.json | S | moved |
| Roadmap filters, Track / Stop, restore quest guidance | Drawer | same component, F2P Only is the default on a free account | skillTrack | U (`defaultGuideMode`), S | fixed |
| Melee focus (which skill to train) | Lagging skill | Route goal first, then the next stage goal, then the generic row | goals | U (`trainingFocus`) | fixed |
| Gear: worn slots, combat numbers, last known | Gear page | **Current equipment** (unknown shown as *? Not checked*) | gear advisor | S, V | regrouped |
| Gear: do now, save up, armour | Gear page | **Recommended improvements**; *Consider buying* until the bank is seen | gearAdvisor | S | changed |
| Gear: roadmap and prayers | Gear page | **Future unlocks** | gearRoadmap | S | regrouped |
| Shopping: range, unfinished only, copy, bank sync, partial quantities, manual marks | Row list | Semantic table: Item, Required, Owned, To obtain, Source, Estimated cost, Action; stacked below 900 px | shopping, holdingFor | U, S | changed |
| Shopping: unverified items | Counted as purchases | Separate group, count, budget and copy section | `summarizeShopping` | U | fixed |
| Quests filters All / Done / Available / Blocked | Quests page | Journal > Quests | progress | S | moved |
| Stage goals table, splits | Goals page | Journal > Stage goals | goals.json | S | moved |
| Reference articles, transport, plugin catalogue | Reference | unchanged content; grouped index and contextual links from the Details tab | reference.json | S | kept |
| Reference food advice | "Go fishing and cook" | Matches the route, which buys food | reference.json | U | fixed |
| Profiles, backups, export / import, reset, undo | Settings > Progress | unchanged | store | S | kept |
| Updates, diagnostics, launcher, feature switches | Settings > App / RuneLite | unchanged | desktop bridge | S | kept |

## RuneLite addon

| Existing capability | Was | Now | State / data source | Verification | Status |
|---|---|---|---|---|---|
| Guide panel (240 px), compact and open states | `OsrsPathGuideOverlay` | unchanged geometry | StepGuide.View | J | kept |
| Steps / advice tabs | One row, a click toggled | Two labels: **Steps** and **Advice · N**, each clicked separately | adviceTab | J (`tabStrip_aClickSelectsTheLabelItLandsOn`) | changed |
| Hover explanation | Appended to the plate, resized it | **Tooltip beside the plate**, kept inside the canvas | Row.hint | J (`OverlayTooltipTest`) | changed |
| Quest item count | "In your bag: 2 of 2 items" | "Quest items in your bag: 2 of 2" with a hover that names the scope | StepGuide.items | J | fixed |
| Unchecked bank item | "bank not opened" | "? not checked, bank not opened" | Have.UNKNOWN | J | changed |
| HUD (190 px), danger, preflight block, recovery, pace | HUD overlay | unchanged | - | J | kept |
| Dock bar, bank checklist, GE helper, shop overlay, arrow, highlights, radar, sounds | Overlays | unchanged | - | J | kept |
| Click handling (Alt move, menu, bank over the plate, world map) | `GuideMouse` | unchanged | - | J | kept |
| Swing sidebar | `OsrsPathPanel` | same layout; item status uses the shared vocabulary | StepGuide | J | kept |
| Plugin config keys | `OsrsPathBridgeConfig` | unchanged | - | J | kept |
| Protocol 6, bridge on 127.0.0.1:38282 | - | unchanged | - | J | kept |
