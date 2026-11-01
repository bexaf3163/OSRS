# OSRS Path — project handoff

Updated 2026-11-01. **This is the only current project contract, architecture map, work state, backlog and handoff.** Stable rules come first, changing state (remaining work, verification, receipt) last. Read the section a change needs. AGENTS.md and CLAUDE.md point here; README.md introduces the product.

## Documentation policy

- **Binding on Claude Code, Codex and every future contributor:** keep all current instructions, decisions, implemented work, remaining tasks, verification and takeover state in this one file. Never create another handoff, next-session, acceptance or status diary, copied instruction file, separate repository or Downloads variant. Update sections in place, reconcile conflicts, remove stale statements and keep uncertainty explicit.
- Stay within **5,000 words** by removing repetition and narrative, never by dropping a fact or moving it elsewhere. Keep only the current delivery receipt; Git history and the immutable release notes hold the rest.
- AGENTS.md and CLAUDE.md stay tiny pointers; a release copy of this file is a snapshot. Before handing over, check that source, this file, release version and test evidence agree.
- docs/ holds references, not task lists: SKILLS_COVERAGE.md, AUDIT_LEDGER.md (reproduce a row before repairing) and the generated COMBAT_AUDIT.md, DEFAULT_PLANS.md and FUNDING_COVERAGE.md. Removed documents and old release-note links resolve in Git history (`f3112228e97be4a8058eec5e2f995956b575ff9c` and later). `.codex/work-state.md` is Codex's ignored checkpoint.

## Owner requirements that remain binding

1. Preserve Claude's accepted Ledger design and fonts. Never restore an earlier redesign to make old tests pass.
2. Default training is practical and balanced: useful XP, affordable supplies, reasonable net earnings, recovery and banking. XP and Money are alternative preferences, not a screen to configure first.
3. Training moves through worthwhile methods and equipment tiers, justified by capability, cost and benefit. No static grind to the final level and no arbitrary change every ten levels.
4. Use the shared engines. New quests, monsters, recipes and methods inherit eligibility, preparation, ownership, budgeting, routing and completion contracts. A new mechanic still needs explicit shared modelling and tests.
5. Unknown is not missing, zero, unavailable or owned. Preserve provenance, bank freshness and profile identity. Never fabricate XP, quest completion, money, sale proceeds or equipment.
6. Purchases and gameplay stay manual. The program recommends, detects, records and guides; it never buys, moves, fights or eats for the player.
7. Windows desktop only. No mobile development or phone-only QA. Keep desktop resizing, OS DPI and accessibility.
8. Do not modify RuneLite Optimizer, PC-Tune or experimental graphics repositories in this work.

## Engineering and operating contract

- English only for UI, comments, docs and communication, with canonical OSRS names. Correctness, full implementation, compatibility, accurate state and verification outrank token savings.
- Inspect code and references before editing. Make focused changes, reuse registries and engines, keep working behavior, update every consumer together. No duplicate item database, bridge transport, state store or per-skill acquisition engine.
- Preserve saves, profile identity, notes, skips, selected plans, completion conditions, item/task/step/phase IDs and explicit goals. A route skip is not proof of a game prerequisite. Reordering Doric/Knight's Sword stays deferred.
- UNKNOWN is not zero, owned, connected or logged in. Distinguish bag, noted, bank, worn and usable quantities, doses and accepted alternatives; allocate physical stock once; never let simulated future stats or gear overwrite observed state.
- The app reads stats, equipment, cash, inventory and bank where supported and labels unread or stale facts. Recommendations check real skill, equipment, quest, spell, account-mode, source/access and budget constraints, not just a level or bonus.
- Preparation carries item, count, state, provenance, source, location, cost, priority, reason and carry/equip rules through one pipeline: bank withdrawal before repurchase, usable owned equivalents accepted, current-trip needs separate from future reserves.
- Shopping uses central allocations, sources, quotes, fees and optionality: no double spending, fictitious proceeds, automatic GP spending or repurchase of confirmed owned items. Manual ownership stays where game data is missing.
- Navigation has one current target; coordinate, floor, entrance, map, arrow, HUD and phase agree. Verify real transport eligibility, supplies and full detour cost; never invent coordinates or transports.
- Desktop UI tests use isolated data. Codex runs no real-game tests; Claude does reachable acceptance. Never automate movement, combat, skilling, looting, eating, dialogue or item-use loops, or GP spending; earlier limited UI inspection is not permission for bot-like control.
- External failures never crash the app or corrupt state. Keep actionable unavailable/retry states, operational logs, watchdogs and save recovery.
- Keep updater digest/size validation, atomic writes, damaged/future-schema quarantine, pre-write external-revision guards, profile protection and backup receipts. No watchers, automatic merges or locks without a reproduced requirement.
- Mode changes never reset progress. F2P-only plans never leak Members prerequisites; explicit alternate strategies carry their own. Unsupported mechanics and rates stay explicit.
- The RuneLite launch (`electron/runelite-launcher.cjs`) keeps `-ea`, at least `-Xmx1024m` and the other JVM arguments; RuneLite's config.json does not override them. The bridge request limit stays **64 x 1024 bytes** (`BridgeServer.MAX_BODY`): oversized requests are explicit failures, never silently truncated or called "shown in game". Payload changes need boundary, UTF-8 and refusal tests and keep the previous valid target.
- Work through authorized tasks autonomously. Never force-push, reset or clean away valid work, merge unrelated branches or overwrite released EXEs.

## Change hygiene — binding for every AI or human change

Every fix, feature, removal or redesign (app, plugin, data, tests, CSS, docs, CI) leaves the project at least as simple as before. A change that fails a listed check is not finished. If a rule blocks legitimate work, change it here with the owner; never bypass it.

1. **Put it where it belongs:** `src/app` shell, `src/state` providers, hooks and storage-backed stores, `src/ui` and `src/ledger` shared pieces, `src/features/<page>`, `src/domain/<area>` engines, `src/services` IO, `src/data` typed access over JSON in `authored/` (by hand) and `generated/`. A unit test named after one module sits beside it; scenario, audit and golden tests stay in `tests/`, browser scenarios in `scripts/test/ui/scenarios/<feature>.ts`, scripts in one purpose folder of `scripts/` (`data` for generators, `check`, `test`, `release`, `dev`). No catch-all folder and none above 25 files, tests not counted. [`npm run check-structure`]
2. **Size budget.** Soft 600, hard 1,000 lines for TS, Java and CSS. A touched file above 600 lines must not grow; split it by concern. No merging modules into big files and no one-line files without a reason (breaking a cycle is one). [check-structure]
3. **One source of truth.** Versions change only through `npm run bump -- X.Y.Z "summary"`. Generated data comes only from the command `src/data/manifest.json` names for it, and code outside `src/data` imports data only through `src/data/index.ts`. Bridge payload fields are listed once in `tests/bridgeContract.test.ts`: tsc checks the list against `ActiveStepPayload`, that test checks every field the app sends is on it, and the plugin's `BridgeContractTest` matches its DTO fields to the generated copy. Page links come only from `hrefTo` in `src/domain/pages/pages.ts` and window-storage keys only from `STORAGE_KEYS` in `src/domain/persistence/storageKeys.ts`. [check-structure]
4. **One-way layers, no cycles.** `app → features → ui/ledger → state → services → domain → data/types`. Domain areas depend bottom up: persistence and text, items, player and travel, market and quests, combat, training, prep, economy, readiness, guide. A feature may reuse another feature's component, never back. `domain` has no React and no network or desktop IO. No import cycles between files or folders. Type-only imports use `import type` (under `verbatimModuleSyntax`, `import { type X }` still loads the module). Modules that Node loads from `scripts/` or `electron/` keep the extension on relative imports. [check-structure, strict in CI]
5. **Reuse before adding.** Extend the existing engine, parser, normalizer, allocator or component. A second implementation of a concept is a defect.
6. **Remove in the same change.** Retiring something deletes its exclusive code, CSS, tests, fixtures, assets, data and docs in the same commit. [`npm run knip`, `npm run dead-css`]
7. **CSS.** Ledger CSS holds tokens, base and fonts only. No new `:root:root`, `:root .la-*` overrides or `!important`. A CSS or layout change needs a base-versus-head screenshot diff with no unexplained pixels (`npm run perf -- <repo> dist <port> shots`, then `npm run pixeldiff`). [dead-css]
8. **Tests.** Wait for conditions, never fixed sleeps (except a commented product timer); browser scenarios use `settle(page)`, which waits until no short timer, request or React work is pending [check-structure]. Never weaken or delete an assertion to make a change pass; adapt an obsolete one to the surviving behavior. Unit test files that mock modules or replace globals run isolated automatically (`vitest.config.ts`). Generated fixtures and documents come only from `npm run fixtures`.
9. **RuneLite plugin.** One HUD. No per-tick or per-frame scans, JSON parsing, API reads or allocations without a dirty flag; heavy planning stays in TypeScript and overlays show only when relevant. Plugin-only assets (the HUD fonts) live in `runelite-bridge/src/main/resources/`, not `public/`.
10. **Performance does not regress.** For engines, providers or bridge handling, run `npm run perf -- <repo> dist <port> timing` twice on base and head and compare with `scripts/test/perf-compare.mjs`; over +10% per-update or start-up main-thread time needs an owner decision. Memoize by identity; no expensive work in render.
11. **One contract document,** as the documentation policy says.
12. **Verify before merge.** `npm run verify:quick` on every change; all gates before a release. Report skipped or unreachable gates; never claim them as passed.
13. **Dependencies and assets.** No new dependency, font, image or data file without a consumer; remove it with its last consumer. [knip]

Audit lessons: `runelite-bridge/build.gradle` copies `src/data/` files; `public/fonts/OFL.txt` licenses the Ledger fonts; adapt tests that assert on retired things; prove CSS removals with a pixel diff; time everything twice and page switches with `SWITCH_IDLE=2500`.

## How the system is connected

```text
RuneLite observations / verified saved profile
                 ↓
bridge.tsx → PlayerState + provenance / account / freshness
                 ↓
catalogue facts + requirements + capability registries
                 ↓
trainingRouter: eligibility → model rates/costs → priority → phased path
                 ↓
methodStep / trackedTraining / training session
                 ↓
current-leg needs ──→ readiness → preparation queue
whole-goal needs ──→ allocations / Shopping / funding estimates
                 ↓
bank → available source / GE → funding if necessary → resume original activity
                 ↓
canonical current action / next phase → app + bridge payload → single Java HUD
                 ↓
new observed levels / inventory / equipment / bank / quest state recompute the plan
```

Cross-page activity selection is `resolveActiveActivity` in `src/domain/quests/activeActivity.ts` (`useActiveActivity` in `src/state/readinessContext.tsx`): incomplete followed training, else the admitted live route, else the next route step; completed or synthetic leftovers never become fallbacks. Path, Skills, Gear, Shopping and the plugin only project shared state, and a display fix never changes requirements or completion.

### Responsibility map

| Layer | Main entry points | Extension rule |
|---|---|---|
| Game link and facts | `src/state/bridge.tsx` (parts in `bridge*.ts`), `src/domain/player/playerState.ts`, `src/state/playerStateContext.tsx`, `src/services/runeliteBridge.ts` | Keep observed/saved/unknown and account boundaries; reuse event processing before adding a scan or cache. |
| Requirements and readiness | `src/domain/player/requirements.ts`, `src/domain/readiness/` (`readinessEngine.ts`, `preflight.ts`), `src/state/readinessContext.tsx` | Same requirements everywhere. Owning, using, carrying and wearing are different facts. |
| Training catalogue and orchestration | `src/data/authored/trainingMethods.json`, `src/domain/training/trainingRouter.ts` | Data under an existing model; new calculations in a shared adapter, never an ID-specific UI branch. |
| Rates and equipment | `src/domain/training/` (`methodRates.ts`, `skillingRates.ts`, `processingRates.ts`), `src/domain/combat/` (`rangedLoadout.ts`, `magicPlan.ts`, `styleGear.ts`, `gearAdvisor.ts`) | Reuse complete equipment and combat/recovery comparisons. Keep model, measured and reference rates apart. |
| Tool capabilities | `src/domain/items/toolTiers.ts`, `src/data/authored/toolProgression.json` | A purchase catalogue is not a usability whitelist. Skill and Attack requirements are separate. |
| Followed Skills and virtual steps | `src/domain/training/` (`skillTrack.ts`, `trackedTraining.ts`, `methodStep.ts`), `src/state/hooks/useTracked.ts`, `src/state/trainingSessionContext.tsx` | Follow the selected goal and conservative mode scope; keep the return to the original activity and stable phase IDs. |
| Acquisition | `src/domain/prep/` (`prepPlan.ts`, `prepQueue.ts`, `prepRoute.ts`, `prepEnvelope.ts`, `sourceRouter.ts`), `src/state/hooks/usePrep.ts` | Reuse banking, sources, task detection, cancellation and resumption. No per-skill procurement. |
| Travel | `src/domain/travel/` (`travel.ts`, `transport.ts`, `travelInput.ts`), `src/domain/readiness/` (`liveTransport.ts`, `travelSupplies.ts`) | Real eligibility, complete supplies, whole detour cost, explicit supported modes. |
| Quests, goals and completion | `src/data/authored/questStages.json`, `goals.json`, `src/domain/quests/` (`questSteps.ts`, `questItems.ts`, `goals.ts`, `triggers.ts`, `next-step.ts`) | Keep quest entry/preparation, branches, observed progress and prerequisite semantics. |
| Economy | `src/domain/market/` (quotes, GE tax, prices, loot value, need pricing), `src/domain/economy/` (`funding/`, `fundingPlan.ts`), `src/state/fundingContext.tsx` | Reuse quotes, freshness, volume/trade limits, budget and sessions. Cash is not equipment value; future earnings are conditional. |
| Item keys | `src/domain/items/itemKey.ts` (memoized `nameKey`), `src/domain/market/shopConstants.ts` (`SAVE_GP`) | Import-free leaves; never re-create `nameKey`. |
| App recommendations | `src/features/skills/` (`TrainingCard.tsx`, `SkillDetail.tsx`, `Skills.tsx`), `src/domain/training/f2pSkillAdvice.ts` | Train is the compact recommendation; Plan explains the same result. Calculator and Reference never compete with it. |
| Quest/current-action display | `src/features/path/` (`PathWide.tsx`, `CockpitWorkspace.tsx`, `step/`, `prep/`, `combat/`) | Keep current instruction, preparation, branches, completion and route restoration. |
| Maps | `src/domain/travel/map.ts`, `src/state/hooks/useMapSources.ts`, `src/features/map/` (`StepMap.tsx`, `WorldMapModal.tsx`) | One preview, shared coordinates and sources, full-map point selection, game navigation. |
| Knowledge UI | `src/features/reference/WikiDrawer.tsx`, `src/domain/travel/` (`places.ts`, `stepPlaces.ts`), reference/item/NPC data | Keep dossiers, pinning and source navigation. Reference is not a training plan. |
| Plugin | `src/domain/guide/inGameTarget.ts` (what the plugin shows for a step), `runelite-bridge/` (`BridgeServer`, `HudModel`, `OsrsPathGuideOverlay`, `GuideFont`; `OsrsPathBridgePlugin` holds the services, shared state and event handlers, which call into its `Plugin*` section classes) | One guide card: current action, status, at most one warning, details on demand. Never resurrect the multiple-HUD layout. |
| Native shell and storage | `electron/main.cjs`, `preload.cjs`, `runelite-launcher.cjs`, `src/services/desktop.ts` | Keep atomic saves, recoverable damaged/external data, profile protection, backups, updater, authenticated launcher and `startup.log` (first-paint time). |
| Tooling | `scripts/check/check-structure.mjs`, `verify-quick.mjs`, `bump.mjs`, `perf.mjs`, `perf-compare.mjs`, `pixeldiff.mjs`, `dead-css.mjs`, `knip.json`, `vitest.config.ts` | The guards of the hygiene rules. Extend them instead of adding parallel checks. |

### Extending content without repeating old fixes

1. Add factual data to the existing registry with real prerequisites, kit and mechanics; a name, level and Wiki rate are not a model.
2. Reuse the owning adapter. For a new mechanic, extend the shared contract first, with a synthetic-content regression.
3. trainingRouter selects phases and `preparationNeeds` resolves the current kit; methodStep projects it into the requirements, map target and goal demand of the normal lifecycle.
4. Keep optional future-bank demand separate from current carrying and readiness. goalNeeds, goalItemsRequired and `aggregateShopping(wholeGoal)` are forecasts, not budget-safe stocking. prepRoute/prepQueue keep cancellation, ownership observation and restoration.
5. Verify the same action, kit and goal through Skills, Path, preparation, Shopping/funding and the HUD; update coverage notes and the live matrix.

### Important shared contracts and fixes to preserve

- Catalogue-backed followed Skills use the Path preparation, Shopping and funding lifecycle; guide-only data is not a personalized model. Explicit preparation and skill goals survive deep links; a lower F2P checkpoint never replaces an explicit supported goal, and a guide's level-99 endpoint never becomes the default.
- F2P-only scope stays F2P on a members account; projections never change real membership or equipment facts.
- Current-leg needs are separate from conditional whole-goal demand; a goal's supplies need not fit in the current bag. `preparationNeeds` carries the selected model and upgrade kit; the UI never rebuilds a kit from a generic table.
- Reusable tools are not consumed and stock is never spent twice. Black/Dragon tool validation uses the tool registry. Only a confirmed worn tool frees its slot; the Attack level alone is no evidence (2.81.10).
- Magic and combat gear use the complete damage/recovery model; a bigger bonus proves nothing and Strength versus Power amulets are judged on the real setup. Preparation accepts equivalent-or-better gear, never forcing an exact item or full black set.
- Model food, ammunition, potions, damage in and out, eating, banking and supply costs; killability is not efficiency. Never restore fixed claims like "20 fish always covers 60 kills".
- Quest-XP alternatives use existing guides and prerequisites; no reward before observed or manual completion, and no completed or skipped quest back into training. Default F2P Prayer and Runecraft guidance is not a compulsory grind; explicit custom training stays distinct.
- Stale async results never overwrite newer profile, selection, goal or live state. Changed requirements use the existing review/migration mechanisms, never erased marks or silent credit; old route-reorder proposals are not instructions.
- A teleport stock-up suggestion needs the full recipe and a feasible acquisition trip, counts the source/bank detour, and checks spellbook, level, membership, cooldown/charges and the equipped capability.
- Preparation UNKNOWN (2.81.17, `prepRoute`/`prepPlan`): required unread facts never mark READY, finish a detour or invent tasks; required non-item gates count toward UNKNOWN, item/coin uncertainty counts once, optional unknowns never block, and readiness views hide a misleading ready percentage.
- Stock-up (2.81.12): trainingStockNeeds → TrainingPick.stockNeeds → Step.stockItems → stockUpShopping covers the current kit and the next two distinct kit/recipe configurations, at most two future reusable items and six optional rows. Extras need an already-needed GE purchase, live connection, bank read this session, known cash and usable quotes. Mandatory purchases/fares and a full refill are reserved first, gear before extra consumables, within GE limits. Future stock never blocks readiness, completion or funding, forces a trip or changes the target; owned future items are never rebought. The plugin gets the same GE quantities; identical steps count once. Extra consumables are quantified only for supported processing and ordinary F2P Ranged (no invented Magic/melee/mixed quantities or optional potions; refills reserved in doses).
- Processing (2.81.14–16): `recipeTicks` reads Make-X timing ("Make-All is 4 ticks"), never first-item timing. Station targets come from the source page's object names (multiple names need a validated selection in processing.defs.json; a range is never labelled Fire) and flow through `RateSpot.objectNames`. Owned partial batches use the shared allocator without a refill per action; new inputs join the bank/inventory watch. At confirmed zero cash, Balanced/Profit keep an executable kit ahead of an unpriced batch; prices are never guessed.
- Multi-use materials (2.81.15): consumableUses needs source evidence and matching numbers (Thread: five uses per crafting action). Recipes inherit the average plus a one-time allowance for an unread partly used first unit; preparation rounds to whole items and inverts stock conservatively; replacement cost uses expected use. Never promise an unknown partial spool's actions from averages.
- Manual references (2.81.18): manualSetup keeps fi-monk, fi-karambwan and mi-motherlode out of defaults and forecasts until their mechanics, access and routes are modelled; IDs and reference facts stay.

## Accepted design and cleanup boundaries

The app is Claude's **Ledger**: dark shell, parchment pages, gold navigation, **Cinzel** headings and **EB Garamond** text (subsets in `src/ledger/fonts`). The HUD's default Ledger plate uses Cinzel and EB Garamond; Classic and Glass keep **Sora**. Design entry points: `src/ledger/{Chrome.tsx,parts.tsx,icons.tsx,ledger.css,app.css,extras.css,fonts.css}` and `src/app/App.tsx`. Older CSS (`styles.css`, `clear-path.css`, `modern-path.css`, `cockpit.css`) still styles shared components; check consumers and pixel-diff before removing more.

2.81.11 to 2.81.13 cleanup decisions that stay:

- Removed: Appearance theme/density/view controls, custom font size, panel/look/solid settings, preview, Compact modes, the Inspector display mode, custom zoom (a retired per-origin zoom resets to 100%), the Copy Report UI and the Journal stage-goal matrix. Kept: OS DPI/resizing, the header Pin (`getWindowPrefs`/`setAlwaysOnTop`), `ui.json` backup preferences and geometry, map/image magnification, the `splits.ts` duration formatter, `WikiDrawer`'s `DockedInspector` (pinned dossier), logs, telemetry/watchdogs, the analysis CLI and shared goal data. Trace consumers; never delete by name ("Inspector", "zoom", "goals").
- Training settings keep Balanced/Fastest/Money/Relaxed, automatic preparation and Defence-at-1. The five RuneLite helper flags stay (places, bank highlighting, pace, level import, upgrades); mocked tests do not prove their real-game behavior.
- Journal: filters left; status, QP, current-part requirements and route action right; Review route for completed/skipped quests; saved-only completion labelled; one closed session history; browsing never marks progress; old goals hashes open it.
- Skills hides the static roadmap for catalogue-backed skills but keeps reference facts, calculators and labelled guide-only coverage; a completed skill's Plan says its checkpoint is reached. Two-column icon index, one Plan entry, XP table in Calculator.
- Gear compares melee only for a supported current activity; other skills show current preparation and live equipment, never the old sample cow. Mandatory shopping and a quoted refill/fare reserve protect upgrade spending; unread prices never count as zero. Shopping: requirements left, Checkout right (cost, checked cash, optional bank stock, refill allowance, shortfall), one primary action through funding, copy-order or preparation.
- One Where preview; the compact card omits the place list and the **full map keeps the place picker**. Preview-only CSS uses direct-child selectors so a nested dialog's picker stays visible.

Maps read the Wiki's atlas metadata with a verified **2019-10-31_1 archive fallback** (old imagery, disclosed in tooltips; the hard-coded 2026 URL returned 404). Newer imagery needs a verified projection and real tiles; never paste another atlas URL into the old coordinate scheme.

## Development and release procedure

- Read this file and `git status` first.
- Gates: `npx tsc --noEmit`, `npm test`, `npm run check-data`, `npm run build`, `npm run test:ui`, `npm run test:e2e`, `runelite-bridge/gradlew -p runelite-bridge test jar` and the CI packaged-Portable gate; CI also runs `check-structure` (strict, with a shrinking known debt), `knip` and `dead-css`.
- Browser tests use port 4179: one runner at a time, finish `dist` rebuilds first, never rebuild under a running suite. Electron e2e uses isolated data and a bridge stub. Screenshots go to the ignored `audit-temp/`.
- Retiring a feature removes its exclusive UI, state, handlers, IPC, styles, imports and tests but keeps shared consumers, saves, backups and diagnostics; a selector can reach a nested dialog. Adapt obsolete assertions to surviving actions; never restore an obsolete screen for a test.
- Release: `npm run bump -- X.Y.Z "summary"` (package, lock, `PLUGIN_VERSION`, notes stub), finish `release-notes/vX.Y.Z.md`, push to main. When every Checks job passes, its release job publishes vX.Y.Z from the exact EXE the portable job verified, with this file (receipt filled in) and SHA256SUMS.txt, then downloads the assets and fails unless they match; existing releases are never overwritten. A release counts only when that job succeeds; "asset exists" is not success.
- Structural work goes on a branch, rebased and merged after gates and live checks; large moves need a freeze window with the other agent idle. If interrupted, checkpoint the next action and separate local WIP from published code.
- Never publish authentication material, real account or bank snapshots or private session logs; use isolated fixtures and redacted screenshots.

## Remaining work in priority order

### P2 — finish staged Skills and Optional review with the existing engines

Review melee, Ranged, Magic and the peaceful skills against docs/SKILLS_COVERAGE.md. For each supported skill verify: (1) level, target and account scope; (2) a practical first method with kit, consumables, restrictions and costs; (3) automatic preparation, banking, acquisition, funding and resumption; (4) worthwhile method and equipment changes as levels rise; (5) logical F2P stopping guidance and Optional order per route target; (6) correct next action and completion with no contradicting static advice.

Add missing mechanics to shared contracts with synthetic-content regressions, never per-skill copies. Open: models for the three manual references, Camdozaal full-cycle rates (catch chances, failures, phases), bonfire/Wintertodt Firemaking, remaining gathering/Prayer/Runecraft edge cases. The four Runecraft adapters (altar surface entry, talisman/tiara, rune/pure essence, per-essence XP versus multiple-rune yield) and the Firemaking, Prayer and Superheat adapters exist; do not rebuild them.

### P3 — finish content review and reconcile visible consumers

Review Path, Skills, Gear, Shopping, Money and Reference/search for stale recommendations, mismatched quantities, redundant controls and unclear unknown/missing states; Reference keeps factual tables, never a competing plan. Static melee-order, Smithing and Ranged purchasing advice is already qualified. In the generated DEFAULT_PLANS.md, legacy collection cases are historical and the S4-03 heading comes from route data (the 50-bone fixture is not the Giant-frog XP-only step). Record unrevalidated Wiki facts, members methods and prices with source dates.

### P4 — Claude's real-client acceptance

Use the published Portable and restart its client so the plugin version is known; verify real login and link, not a port; respect the owner's limited-input rules. Smoke first (version, link, Ledger HUD, provenance, one current action in app, arrow and HUD), then the matrix. Without the desktop, leave live evidence pending. For HDOS, verify only what its adapter supplies. Keep implemented, automated, native-shell, live and unverified evidence apart, and fix confirmed shared bugs at their layer.

### Consolidated live regression matrix — Claude owns every row

Record versions, account mode, facts, expected and actual result and evidence as PASS, FAIL or NOT REACHABLE; restore settings and the original activity. Older evidence proves nothing.

| Area | Required reachable checks |
|---|---|
| Launch/link/state | Authenticated launch, plugin version, real login (World 316 if fitting); logout, hop, reconnect, restart, unread bank, profile switch, late old-session events. |
| Ranged | Stage/NPC level, owned shortbow/longbow and one ammo stack, worn quantities, bow/armour/arrow unlocks, food detour, stable target; 100 → 99 arrows causes no trip; low-watermark refill. |
| Stock-up | Poor/rich/unknown/remembered bank; reserve and next bows/tools in one GE visit; kit/refill money held; banked extras used without rebuy; never blocks. |
| Melee/combat | Balanced default versus XP/Money; real damage, food, bank time, net proceeds; Strength versus Power, weapon/armour tradeoffs, style, Defence preference. |
| Magic | Spell unlocks, runes, worn elemental staff, full gear model, metal penalty; Superheat levels, unnoted iron, partial bag, bank coal, no stale NPC targets; alchemy/splashing only as selected setups. |
| Gathering | Methods, tools carried/worn, skill versus Attack requirement, upgrades, spot/bank/entrance/floor and stage change; no slot credit from Attack. |
| Processing/utility | Failures, inputs, outputs, fees, partial batches, reusable tools; Smithing furnace/anvil, coal capacity, iron failures, 1/3/5-bar stacks; Firemaking tiers, space, Tinderbox; partial Thread spools without refill loops, silver/mould at 23; Cooking catch, fire, Make-X; Prayer/Runecraft deferral versus goal; Camdozaal gates, net/knife, path, prepared offerings, unread → known without false READY; altar timing. |
| Mixed/quest XP | Fishing → Cooking and Mining → Woodcutting handover, goals kept, no unearned credit; quest deep-link/goal/return; stop/cancel/funding restores the route. |
| Physical supplies | Noted food owned but not eatable; withdrawal/unnote; equivalent foods still use real pieces/slots; potion doses combine without pretend pouring. |
| Quests/branches | Oracle/Dragon Slayer entry, dialogue, map parts, Shield of Arrav branches, milestones, encounter food/gear guards; completed encounters NOT REACHABLE, never replayed. |
| Travel/funding | Teleports, unlocks, charges, runes, cash, whole detour versus walking; money methods respect restrictions, input cost, tax/liquidity and real session GP. |
| HUD/map/UI | One collapsed/expanded Ledger guide with its tabs, one warning, phases agree, saved position, click, Alt-drag; one map preview, point selection, real arrow target; Ledger fonts, wraps, dialogs at 100/125/150% DPI. |
| Persistence/updater | Isolated profiles for corrupt/future/external-file recovery, backups, profile protection and a real old → new EXE update; never risk the owner's only save. |

### P5 — project optimization (2026-11, verify-first)

Each batch releases after all gates and its Go threshold, and live acceptance follows on the published Portable (owner decision 2026-11-01); re-run `npm run perf` and `check-structure` after it. Alternate timing-pair order: identical builds timed up to +10% script and +36% blocking when second. Next is the full plugin live matrix, closing **S8**. Caches and context selectors (R3, R4, R8) wait until per-update script time passes 50 ms.

Rejected after measuring: deferred PathWide scroll (slower start), lazy pages (3.8% page-only code), a V8 code cache (moves the `localStorage` origin), domain barrels, merged tiny modules, parallel Java render tests (shared font cache), an automatic CSS split per feature (S9: run-time class merges and file order changed computed styles, chevrons 18 → 20 px; merge the design layers by hand, comparing computed styles page by page). The React hooks lint needs TypeScript 5 beside TypeScript 7, so it stays an occasional review. Its remaining findings are deliberate content keys. Ask the owner before deleting `docs/OWNER_ARMOUR_PRICING_DATES_REQUEST.md`, `CODEX_ROUTE_CONTINUATION_REVIEW.md`, `route-reorder-proposal.md`, `readiness.md` or `inventory-cleanup.md` (kept by owner decision 2026-11-01). Prune merged remote branches and `audit-test-*` pre-releases, but never delete normal `v*` releases.

## Completed baseline — preserve, do not redo

| Batch | Implemented behavior |
|---|---|
| 2.80.8–17 | Protected persistence/recovery, backup receipts, external-revision guards, RuneLite heap minimum (no merger, watcher, lock or power-loss guarantee); quest-entry food, alternative withdrawals, skill proofs, F2P checkpoints, separate acquisition fees, one shared material allocator. |
| 2.80.18–2.81.10 | Model-driven combat/gathering/processing with staged Optional training and per-recipe batches; Firemaking, Prayer, Runecraft and Superheat adapters; one followed-Skills lifecycle with explicit goals; complete Magic gear comparisons, physical tools, quest-XP alternatives, conservative account scope, carried versus worn capacity. |
| 2.81.11–13 | Retired duplicate UI, plans, report and matrix; repaired maps; shared optional bank stock, one GE order per item, active-skill shopping precedence, duplicate-step protection; contextual Journal, Gear and Shopping Checkout; compact Skills index. |
| 2.81.14 | F2P Cooking: shrimps, anchovies, sardines, herring, pike, lobster, swordfish added and salmon connected (trout 15, pike 20, salmon 25); swordfish uses its Fire burn chart. The legacy Cooking guide keeps its IDs, explains early unlocks, uses the Barbarian Village fire instead of sending owned tuna to Karamja and drops cheap-wine and guaranteed Fishing-to-Cooking claims. |
| 2.81.15 | Thread consumption and silver tiaras in cr-gold from 23 to 43 (Tiara: Crafting 23, 52.5 XP, 3 ticks, one Silver bar and a Tiara mould at a furnace). Jewellery advice no longer promises profit or diamonds before 43; the starter leather example is 26 leather, six thread spools, one needle. |
| 2.81.16 | sm-smelting connects bronze to runite furnace smelting (mithril/adamantite/runite need 4/6/8 coal, unlocks 50/70/85; iron 50% yield, no ring bonus). Iron/steel/mithril/adamant families add daggers, warhammers and platebodies (unlocks 15/30/50/70) and use 1/3/5-bar leftovers. Blast Furnace, catalysts and Superheat stay separate. Firemaking's five line-lighting families tested at log unlocks with partial batches and a reusable Tinderbox. |
| 2.81.17 | `pr-camdozaal` admits Prayer 1 with Below Ice Mountain, Fishing 7, Cooking 7, Small fishing net and Knife at (2968,5808,0). Catch, prepare, offer: cavefish need Fishing/Cooking 20, tetras 33, all offered at Prayer 1. Unsupported 2400 XP/h and raw offerings removed; passive collect-and-bury uses manual setup. Shared preparation UNKNOWN fix. |
| 2.81.18 | Manual-reference boundary for monkfish, karambwan and Motherlode; the priority test uses equal-rate synthetic methods; one duplicate F2P browser run removed. |

Known limits: fees are bounded allowances; gathering competition, Forestry and Musa Point boat banking are approximations; altar timing assumes the supported exit model; food estimates are no survival guarantee. Alchemy, enchanting and splashing keep target/setup/budget safeguards. No implied parity for unsupported Members or HDOS mechanics. Facts checked against the OSRS Wiki on 2026-10-31.

## Current verification

2.81.19 (optimization batches 1 and 2; owner's Windows PC, at least two runs per build): per-update script 70.3 → 20.5 ms, start-up blocking −53…−74%, page switches within +0.7 ms, web build −26%, unit run 72 → 9 s, axe 0 on nine pages, screenshots identical apart from known noise. Real-game acceptance is pending (P4).

2.81.20–30 (S1, S3–S8, S10, C1, S11, X2, X8, X9; no visible change): code in `app`, `state`, `ui`, `features` and `domain` (largest folder 139 → 19 files), 0 layer violations (from 29); one list each for page links, storage keys and the 131 bridge payload fields; browser scenarios per feature with `settle()` and two workers, 874 of 874 checks in 131–158 s over three runs (from 319 s); data JSON in `authored/` and `generated/` behind `src/data/index.ts` (files importing JSON directly 49 → 0), its manifest tied to each generator; splits: `OsrsPathBridgePlugin` 4,231 → 797 lines plus eight section classes, `HudModel` 1,175 → 468, `ActiveTarget` 1,078 → 298, `src/types` in seven topic files (bundle byte-identical), `runeliteBridge.ts` 627 → 522, `BridgeServer` 1,162 → 796, `bridge.tsx` 881 → 60 (state in `bridgeCore.ts`), `styles.css` in 14 files (byte-identical); files over 1,000 lines 5 → 0; knip fails on dead exports (15 removed). Local gates pass (2,519 unit, 874 browser, 95 Electron, 648 Java).

2.81.31 (owner's pick): the HUD's default Ledger plate (ring, step code, NOW stamp, tabs Now/Prepare/Next/Advice) from the same card rows; drawn once per change, then copied (84–254 against 154–634 µs per frame); 653 Java tests. Real-game check pending.

<!-- DELIVERY_START -->
## Delivery receipt

Each release carries its receipt in its own copy of this file (version, source, EXE size and SHA-256), written by the release job in Checks, which then downloads the published assets and fails unless they match. Nothing is recorded here by hand; real-game acceptance stays in P4.
<!-- DELIVERY_END -->
