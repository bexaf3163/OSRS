# OSRS Path — project handoff

Updated 2026-10-31. **This is the only current project contract, architecture map, work state, backlog and handoff.** Read the relevant section, not the whole history, on every small change. AGENTS.md/CLAUDE.md are entry-point pointers; README.md is the product introduction. Detailed technical inventories are linked on demand.

<!-- DELIVERY_START -->
## Delivery receipt

Published and independently verified Portable: **2.81.15**, source `24f6225fad2a5e9a9f54388e6531d5a0c32a6828`. Exact-source Checks **41226083568** and Release **41226083576** passed, including complete browser, Java, native-shell and isolated packaged-EXE gates.

Downloaded EXE: **102440744 bytes**. SHA256: `d97365179105ddd99db527fea8de979bedbfd02dd2202f0b6291f21a0cf5e956`. Actual download, asset digest, manifest, size and release-tag/source agree. The distributed canonical handoff was separately downloaded and digest/source/version/policy verified; the release contains only EXE, PROJECT_HANDOFF.md and SHA256SUMS.txt (plus GitHub's automatic source archives).

Shared multi-use material consumption, conservative partial-stock preparation, silver tiara progression and reconciled Crafting advice are shipped. Accepted Ledger/fonts and existing preparation/stock/funding behavior are preserved. All real-game acceptance remains Claude's; automated/native/packaged checks are not in-game evidence. Broader P2 Skills/Optional and P3 content/model reviews below remain open.
<!-- DELIVERY_END -->

## Documentation policy

- **Binding on Claude Code, Codex and every future contributor:** use this exact file in this repository for all current instructions, architecture decisions, implemented work, remaining tasks, verification and takeover. Do not create a second HANDOFF, NEXT_SESSION, acceptance/status diary, copied instruction document, separate repository or Downloads variant. Update the relevant section here, reconcile conflicts and remove stale statements; keep uncertainty and unfinished work explicit. Do not move information to another location or drop it merely to shorten the file. Git history holds superseded detail; operational logs/generated test artifacts and required legal notices are not competing project instructions.
- AGENTS.md and CLAUDE.md must remain tiny pointers here, without independently evolving rule/backlog copies. README.md is only the user/developer introduction. Maintain one canonical repository copy; a release or Downloads copy is a distribution snapshot with its version/source, not another editable authority.
- Before handing over, check that current source, this file, release version and test evidence agree. Do not leave missing tasks, contradictory instructions or unexplained unverified results. Preserve existing functionality and accepted design; documentation consolidation must not change program behavior.
- Update this snapshot in place; do not add another agent/session/handoff file or append a diary for every test/commit. Keep only the latest delivery receipt and concise completed-work history.
- Immutable release notes remain short changelogs, not parallel task/rule documents; existing specialized/generated technical references are read only when relevant. Do not create new standalone instruction/architecture/status files.
- New releases expose one PROJECT_HANDOFF.md, the normal Portable EXE and SHA256SUMS.txt. GitHub's automatically generated source archives are separate platform artifacts.
- Relevant older decisions and fixes are consolidated below. Superseded diaries/maps/guidelines are removed from the active checkout. Original documents remain in Git history at `f3112228e97be4a8058eec5e2f995956b575ff9c`; consult them only for a specific historical incident, not to determine today's task.
- SKILLS_COVERAGE.md and AUDIT_LEDGER.md under docs/ are technical inventories, not competing task lists. Open the matching row only when needed. Historical audit labels require current reproduction before new repair work.
- Local .codex/work-state.md is an ignored/untracked interruption checkpoint, not another published project contract. It can record exact running commands and unfinished changes without duplicating this document.

## Owner requirements that remain binding

1. Preserve Claude's accepted Ledger design and fonts. Do not restore an earlier redesign to make old tests pass.
2. Default training should be practical and balanced: useful XP, affordable supplies, reasonable net earnings, recovery and banking. XP and Money are alternative preferences, not a requirement to configure a complicated screen first.
3. Training must progress through worthwhile methods and equipment tiers. Do not turn a skill into one static monster/resource grind to the final level. A tier change is justified by capability, cost and benefit; it is not an arbitrary change every ten levels.
4. Use the shared engines. Adding a quest, monster, recipe or training method must inherit existing eligibility, preparation, ownership, budgeting, routing and completion contracts. New mechanics still need explicit shared modelling and tests; centralization is not proof that every future mechanic works automatically.
5. Unknown is not missing, zero, unavailable or owned. Preserve provenance, bank freshness and profile identity. Do not fabricate XP, quest completion, money, sale proceeds or equipment.
6. Purchases and gameplay remain manual. The program recommends, detects, records and guides; it does not buy, move, fight or eat for the player.
7. Windows desktop only. No mobile development or phone-only QA. Keep desktop resizing, OS DPI and accessibility.
8. Do not modify RuneLite Optimizer, PC-Tune or experimental graphics repositories as part of this task.

## Engineering and operating contract

- English only for UI, comments, docs and communication; use canonical OSRS names. Be concise; correctness, full implementation, compatibility, accurate state and verification outrank token savings. Do not expose internal reasoning.
- Inspect the relevant implementation and references before edits. Make focused changes, reuse existing registries/engines, preserve working behavior and update affected consumers together. No duplicate item database, bridge transport, state store or copied per-skill acquisition engine.
- Preserve saves, profile identity, notes, skips, selected plans, completion conditions, item/task/step IDs and explicit goals. A route skip is not proof of a game prerequisite. Reordering Doric/Knight's Sword remains deferred; no migration is authorized by documentation cleanup.
- UNKNOWN is not zero, missing, owned, connected or logged in. Distinguish bag/noted/bank/worn/usable quantities, doses and accepted alternatives; allocate physical stock once. Future simulated stats/gear never overwrite observed state or credit unearned quest XP/income.
- The app reads stats, equipment, cash, inventory and bank when supported; unread or stale facts remain labelled. Every recommendation checks actual skill, equipment, quest, spell, account-mode, source/access and budget constraints, not just a level or numerical item bonus.
- Preparation carries item/count/state/provenance/source/location/cost/priority/reason and physical carry/equip rules through one pipeline. Offer bank withdrawal before repurchase, accept usable owned equivalents, and keep current-trip requirements separate from future reserves.
- Shopping uses centralized allocations, sources, quotes, fees and optionality. No double spending, fictitious proceeds, automatic GP spending or repeated purchases of confirmed owned items. Manual ownership remains supported where game data is unavailable.
- Navigation has one current target; coordinate/floor/entrance, map, arrow, HUD and active phase agree. Verify actual transport eligibility, complete supplies and full detour cost. Never invent coordinates or transports. Map imagery can fail independently of directions.
- Desktop/app UI testing is allowed with isolated data. Codex does not perform real-game tests; Claude does reachable acceptance. The companion must not automate movement, combat, skilling, looting, eating, dialogue/item-use loops or GP spending. Previously authorized limited manual UI inspection is not permission for bot-like control.
- Keep the plugin lightweight: relevant event/dirty-state updates, caching/throttling, no repeated full scans/API reads/JSON parsing/expensive model work each tick. Heavy planning stays in TypeScript. Show GE/bank/navigation overlays only when relevant.
- External failures must not crash the app or corrupt state. Preserve actionable unavailable/retry states and operational logs/watchdogs. Retired Copy Report UI is not permission to delete actual diagnostics or save recovery.
- Preserve native updater digest/size validation, atomic writes, damaged/future-schema quarantine, pre-write external-revision guards, profile protection and backup receipts. Do not add watchers, automatic merges or locks from an old proposal without a reproduced current requirement.
- Mode changes must not reset progress. F2P-only plans cannot leak Members prerequisites; explicit alternate strategies must carry their own requirements. Unsupported mechanics/rates remain explicit.
- Keep JVM -ea and at least -Xmx1024m in the authenticated RuneLite launch. Preserve remaining JVM arguments. Jagex/RuneLite config.json does not override OSRS Path's direct Java arguments.
- No mobile development, graphics/PC-Tune/Optimizer work or unrelated refactors. Preserve accepted Ledger typography/layout, native DPI/resizing/accessibility and current functional controls.
- Run meaningful regression, type/build/data and applicable Java/browser/native/packaged gates. No weakened assertions or claimed PASS for skipped/unreachable scenarios. Source changes get a new coordinated version and normal release after verification; documentation-only receipts do not need an app rebuild.
- Work through clear authorized tasks autonomously. Do not force-push/reset/clean away valid work, merge unrelated branches, overwrite released EXEs or publish private account/authentication data. Reconcile newer main changes before publishing.

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

Cross-page activity selection lives in `src/lib/activeActivity.ts` with `useActiveActivity` in `readinessContext.tsx`. Gear and Shopping must use it rather than independently guessing the next quest/fight.

Do not construct independent plans in Path, Skills, Gear, Shopping and the plugin. Those are consumers/projections of shared state. A display fix must not silently change the underlying requirements or completion rules.

### Responsibility map

| Layer | Main entry points | Extension rule |
|---|---|---|
| Game link and facts | `src/bridge.tsx`, `src/lib/playerState.ts`, `src/playerStateContext.tsx`, `src/services/runeliteBridge.ts` | Preserve observed/saved/unknown distinctions and account boundaries. Inspect existing event processing before adding another scan or cache. |
| Requirements and readiness | `src/lib/requirements.ts`, `src/lib/readinessEngine.ts`, `src/readinessContext.tsx`, `src/lib/preflight.ts` | Evaluate the same physical and capability requirements everywhere. Ownership, usability, carrying and wearing are different facts. |
| Training catalogue and orchestration | `src/data/trainingMethods.json`, `src/lib/trainingRouter.ts` | Prefer data additions under an existing model. New calculations belong in a shared model/adapter, not an ID-specific UI branch. |
| Rates and equipment | `src/lib/methodRates.ts`, `src/lib/skillingRates.ts`, `src/lib/processingRates.ts`, `src/lib/rangedLoadout.ts`, `src/lib/magicPlan.ts`, `src/lib/styleGear.ts`, `src/services/gearAdvisor.ts` | Reuse complete equipment and combat/recovery comparisons. Keep model, measured and reference-rate estimates distinguishable. |
| Tool capabilities | `src/lib/toolTiers.ts`, `src/data/toolProgression.json` | A purchase catalogue is not a universal usability whitelist. Skill requirements and Attack requirements to wield a tool are separate. |
| Followed Skills and virtual steps | `src/lib/skillTrack.ts`, `src/lib/trackedTraining.ts`, `src/lib/methodStep.ts`, `src/trainingSessionContext.tsx` | Follow the actual selected goal and conservative game-mode scope. Preserve the return to the original quest/activity and stable phase identities. |
| Acquisition | `src/lib/prepPlan.ts`, `src/lib/prepQueue.ts`, `src/lib/prepRoute.ts`, `src/lib/prepEnvelope.ts`, `src/lib/sourceRouter.ts`, `src/lib/usePrep.ts` | Reuse banking/source selection, task detection, cancellation and resumption. Do not add a separate procurement workflow per skill. |
| Travel | `src/lib/travel.ts`, `src/lib/transport.ts`, `src/lib/travelInput.ts`, `src/lib/liveTransport.ts`, `src/lib/travelSupplies.ts` | Evaluate actual eligibility, complete supplies and the whole detour cost. Keep supported travel modes explicit; do not invent unavailable transports. |
| Quests, goals and completion | `src/data/questStages.json`, `src/data/goals.json`, `src/lib/questSteps.ts`, `src/lib/questItems.ts`, `src/lib/goals.ts`, `src/lib/triggers.ts`, `src/lib/next-step.ts` | Preserve quest entry/preparation, branches, observed progress and prerequisite semantics. Removing the old goals screen does not retire these engines/data. |
| Economy | `src/lib/funding/`, `src/lib/fundingPlan.ts`, `src/fundingContext.tsx` | Reuse quotes, freshness, volume/trade restrictions, budget and session handling. Cash is not the estimated value of equipment. Future earnings/sales are conditional. |
| App recommendations | `src/components/TrainingCard.tsx`, `src/pages/SkillDetail.tsx`, `src/pages/Skills.tsx`, `src/lib/f2pSkillAdvice.ts` | Train is the compact recommendation. Plan explains the same engine result. Explicit Calculator/Reference information must not become a competing default plan. |
| Quest/current-action display | `src/pages/PathWide.tsx`, `src/components/CockpitWorkspace.tsx`, `src/components/StepCard.tsx` | Preserve current instruction, preparation, quest branches, completion and original-route restoration. |
| Maps | `src/lib/map.ts`, `src/lib/useMapSources.ts`, `src/components/StepMap.tsx`, `src/components/WorldMapModal.tsx` | One preview, shared coordinates/source resolution, working full-map point selection and game navigation. Image failures do not imply that game directions are unavailable. |
| Knowledge UI | `src/components/WikiDrawer.tsx`, `src/lib/places.ts`, `src/lib/stepPlaces.ts`, reference/item/NPC data | Preserve item/NPC dossiers, pinning and source navigation. Reference information is not an independent authoritative training plan. |
| Plugin | `runelite-bridge/`, especially `BridgeServer`, `HudModel`, `OsrsPathGuideOverlay` | One in-game guide card. Current action, status and at most one warning; details on demand. Do not resurrect the old multiple-HUD layout. |
| Native shell and storage | `electron/main.cjs`, `electron/preload.cjs`, `src/lib/desktop.ts`, `electron/runelite-launcher.cjs` | Preserve atomic saves, recoverable damaged/external data, profile protection, backup history, updater and authenticated launcher behavior. |

### Extending content without repeating old fixes

1. Add factual catalogue/quest/spot/item data to the existing registry. Declare real prerequisites, kit and any special mechanic; a name/level and Wiki rate alone do not establish a supported model.
2. Reuse the owning rate/capability adapter. If the mechanic is new, extend that shared contract first; include a synthetic/new-content regression so the fix is not tied to one existing ID.
3. Let trainingRouter select phases and preparationNeeds resolve the physical current kit. methodStep projects this into the same requirements, current map target and goal demand consumed by the normal lifecycle.
4. Keep optional future-bank demand separate from current carrying/readiness. Existing goalNeeds/goalItemsRequired and aggregateShopping(wholeGoal) are forecast plumbing, not automatic budget-safe stocking. prepRoute/prepQueue must retain cancellation, ownership observation and original-activity restoration.
5. Verify the same action/kit/goal through Skills, Path, preparation, Shopping/funding and the single HUD. Update coverage/model limitations and the live acceptance ledger; do not create another UI-only calculator or copied per-skill acquisition loop.

### Important shared contracts and fixes to preserve

- Catalogue-backed followed Skills use the Path preparation, Shopping and funding lifecycle. The old guide-only path data is not evidence of a fully personalized model. See [SKILLS_COVERAGE.md](docs/SKILLS_COVERAGE.md).
- Explicit preparation/skill goals survive deep links and following a plan. A lower F2P checkpoint must not silently replace an explicit supported goal; a reference guide's level99 endpoint must not become the default goal either.
- F2P-only scope remains F2P even on an eligible members account. Planning projections must not mutate actual membership or equipment facts.
- Current-leg requirements are separate from conditional whole-goal demand. One inventory/batch can be ready while more supplies are needed later. Do not require a full goal's food/materials to fit in the current bag.
- `preparationNeeds` in `trainingRouter.ts` carries the selected model/upgrade kit into preparation. The UI must not reconstruct a different kit from a generic item table.
- Reusable tools are not repeatedly consumed. Shared allocations must not double-spend the same stock between activities.
- Black/Dragon tool capability validation uses the tool registry rather than treating the smaller F2P purchasing database as the list of usable tools.
- **2.81.10:** only a confirmed worn tool frees its inventory slot. Meeting Attack to wield it is not evidence it is worn. Forecast unowned upgrades as carried when that is what preparation asks for; update when equipment is actually observed.
- Magic clothing/staff and combat gear comparisons use the complete damage/recovery model. A larger attack/defence bonus does not by itself prove a faster or better setup. Strength versus Power amulets must be assessed against the actual setup/target.
- Keep current preparation's equivalent-or-better acceptance. Do not turn an upgrade into an unnecessary exact-item purchase or force an exact black-armour set when acceptable gear is owned.
- Model food/ammunition/potions, outgoing and incoming damage, eating/recovery, banking and supply costs. Killability is not the same as practical training efficiency. Never restore fixed claims such as “20 fish always covers60 kills.”
- Quest-XP alternatives use existing quest guides and prerequisites. Do not credit the reward before observed/manual completion, or send a completed/skipped quest back into the training path.
- Default F2P Prayer/Runecraft guidance is not a fabricated compulsory grind. Explicit manual/custom training remains distinct from recommended pre-membership preparation.
- Never let a stale async result overwrite a newer profile, selection, goal or live state. Reuse current ownership/freshness and session guards.
- Preserve saved route/step/phase identities and completion semantics. If requirements change, use the existing review/migration mechanisms rather than erasing marks or silently crediting new requirements. Historical route-reorder proposals are not completed work or an instruction to apply them blindly.
- A teleport stock-up suggestion needs the full missing recipe and a feasible acquisition trip, not one cheap rune while another essential rune is unavailable. Include the source/bank detour in any claimed walking-time saving. Check spellbook, level, membership, cooldown/charges and the actual equipped capability where applicable.
- The Java request limit is still **64 ×1024 bytes** (`BridgeServer.MAX_BODY`). Oversized requests must remain explicit failures. Do not remove the limit, silently truncate JSON or call a failed snapshot “shown in game.” Payload changes need boundary/UTF-8/refusal tests and protection of the previous valid target.
- Keep `-ea` and **`-Xmx1024m`** in `electron/runelite-launcher.cjs`. OSRS Path supplies JVM arguments itself; RuneLite's `config.json` does not replace that heap constant. Do not lower/remove it or alter unrelated JVM options.

## Accepted design and cleanup boundaries

The application is Claude's **Ledger**: dark outer shell, parchment/book pages, gold navigation; **Cinzel** headings and **EB Garamond** body text. The existing game HUD has its own established typography. Do not replace either with the other system's fonts.

Design entry points are `src/ledger/{Chrome.tsx,parts.tsx,icons.tsx,ledger.css,app.css,extras.css,fonts.css}` and the shell in `src/App.tsx`. Older foundation CSS still supports shared components. Preserve specificity and inspect every consumer before deleting it. `PROJECT_HANDOFF.md`'s2.48 description is historical, not the target design.

The 2.81.11 cleanup implements these owner decisions:

- Remove Appearance theme/density/view controls, custom font size, panel/look/solid settings, preview, Compact header/control/page and Inspector mode. Preserve the fixed accepted presentation and OS DPI/resizing.
- Retire custom zoom IPC/keys/automatic zoom. Retain the native header Pin through `getWindowPrefs`/`setAlwaysOnTop`. Keep unrelated `ui.json` backup preferences and window geometry. Reset retired per-origin zoom to100% when the page loads.
- Keep map/image magnification, native OS DPI and the duration formatter still used by combat plans. They are not the retired Appearance or split-table features.
- `WikiDrawer`'s active `DockedInspector` is the pinned knowledge dossier, not the removed global Inspector display mode. Trace consumers; do not delete functionality merely because a name contains “Inspector,” “zoom” or “goals.”
- Keep the active Training controls: Balanced/Fastest/Money/Relaxed, automatic preparation and Defence-at-1. They now have a Training settings tab; do not delete the engines behind them.
- Keep all five working RuneLite helper flags: places, bank highlighting, pace, level import and upgrades. Code presence and mocked tests do not prove their real-game behavior.
- Remove the Settings Copy Report diagnostic UI and exclusive collection/client-summary code. Preserve actual startup/error logs, Java telemetry/watchdogs and the offline analysis CLI.
- Remove the visible Journal stage-goal matrix, not shared internal goal data. Keep quests and session history; old goals hashes resolve into the surviving Journal.
- Hide the competing static roadmap/training table for catalogue-backed Skills. Keep useful reference facts, manual calculators and honestly labelled guide-only coverage. Do not delete legacy guide data without checking resume/compatibility consumers.
- A completed skill's canonical Plan must still explain that its checkpoint is reached; it must not become an empty pane when the static roadmap is removed.
- One Where preview replaces the duplicate. The compact Where card omits the full place list; the **full map retains the place picker**. Scope preview-only CSS with direct-child selectors so a nested dialog's picker is not hidden too.

The broken hardcoded2026 map URL returned404. The replacement resolves the Wiki's published atlas metadata and has a verified working **2019-10-31_1 archive fallback**. This is not current-world imagery. Preview tooltips/attribution disclose archive provenance; coordinates and game navigation remain separate. Replacing it with newer imagery requires verified projection and real tile evidence. Do not copy another atlas URL into the old coordinate scheme blindly.

## Current verification

2.81.16 local source:2,493 unit tests across208files, types/build/fresh16plugin jar, data0errors/0warnings and the complete browser suite passed. New regressions cover eight smelting input mixes/capacities, ordinary iron failure XP, four anvil tiers with one/three/five bars, unlock transitions, followed furnace readiness, Firemaking's five supported log tiers and the shared four-case processing UI flow. No runtime engine/transport code was changed; the recipe catalogue uses existing contracts. Exact-source CI still requires full Java, native-shell and isolated packaged-EXE gates before publication. Delivery evidence belongs in the receipt above; all real-game acceptance remains Claude's.

## Completed baseline — preserve, do not redo

| Batch | Implemented behavior |
|---|---|
|2.80.8–12|Protected persistence/recovery, backup receipts and pre-write external-revision guards; RuneLite heap minimum. Not an automatic merger/watcher/lock or power-loss guarantee.|
|2.80.13–17|Quest-entry food, physical alternative withdrawals, consumer-specific skill proofs, F2P checkpoints, acquisition fees separate from unit prices, one shared material allocator and method-selection integration.|
|2.80.18–2.81.3|Compact skill access, model-driven combat/gathering/processing, staged Optional/training, per-recipe feasibility/batches. Basic Firemaking, Prayer, Runecraft and Superheat adapters already exist.|
|2.81.16|Connected ordinary furnace smelting, practical partial-bar anvil products and true unlocks through existing models; reconciled Smithing claims; Firemaking/common browser progression coverage.|
|2.81.15|Shared multi-use material consumption/partial-stock safety; Crafting Thread and silver tiara progression; reconciled corresponding legacy advice.|
|2.81.14|Common F2P Cooking catch/recipe progression, verified Make-X timing/station targets, sustainable no-cash processing selection and reconciled legacy Cooking source; existing shared preparation/stock/funding lifecycle.|
|2.81.13|Contextual Journal/selected quest, Gear/current activity, compact Skills index/Calculator reference, and Shopping Checkout; shared activity selection and protected refill budget. Accepted Ledger/fonts unchanged.|
|2.81.4–6|Conditional processing/Ranged goal demand; one followed-Skills preparation/Shopping/funding lifecycle, with explicit goals and no fabricated XP.|
|2.81.7–10|Complete Magic gear comparisons, selected physical tools, quest-XP alternatives, conservative account scope, tool capability versus purchase catalogues, carried versus actually worn gathering capacity.|
|2.81.11|Retired duplicate UI controls/plans/report/matrix; preserved Ledger and active engines/storage/helpers; repaired shared maps with disclosed archival imagery and retry.|
|Current 2.81.12 source|Shared optional bank-stock forecast/budget selection, one GE order per item, active-skill shopping precedence and duplicate-step protection; consolidated documentation. Published and verified in the delivery receipt above.|

Known limits: acquisition/travel fees remain bounded allowances, gathering competition/Forestry and Musa Point boat banking are approximations, altar timing assumes the supported exit/transition model, and combat food estimates are not survival guarantees or calibrated per-bite simulations. General alchemy/enchant/splashing retain explicit target/setup/budget safeguards. No implied parity for unsupported Members/HDOS mechanics.

## Remaining work in priority order

### P0 — cleanup delivery complete

The earlier cleanup is published and verified; current delivery status is in the receipt at the top. Do not repeat or restore the retired UI. Keep the accepted design/cleanup section above honest about remaining factual/model reviews. Future release workflow deliveries also attach this takeover file.

### P1 — shared bank stock shipped; extend only missing models

Release 2.81.12 adds trainingStockNeeds → TrainingPick.stockNeeds → Step.stockItems → stockUpShopping. It reuses selected phase/model needs, inventory allocations, acquisition sources, live quotes and existing shopping/exchange payloads. The horizon is current kit plus the next two distinct useful kit/recipe configurations, not three arbitrary model-rate reviews. At most two future reusable items and six optional rows are selected.

Extras require an already-needed GE purchase, a live connection, a bank read in this session, known cash and usable current quotes. Mandatory purchases/fares plus a full current consumable refill are reserved first. Useful gear precedes extra consumables; partial affordable reserves respect GE limits. Future stock never blocks readiness/completion/funding, forces a new trip or changes the current training target. Owned future items are not repurchased, including tools below today's use level. Shopping uses one compact optional list and the same GE quantities go to the plugin; identical active/followed steps count once.

**Coverage limits:** reusable kits use shared method/tool/upgrade declarations across supported skills. Quantified extra consumables currently use supported processing and ordinary F2P Ranged forecasts. Unsupported Magic/melee/mixed-goal quantities are not invented. Optional potion stock is not selected; current potion refill costs are reserved in doses/pieces correctly. All of this needs Claude's live acceptance; extend missing model contracts rather than copying another skill's purchasing code.

### Contextual page improvements — 2.81.13

Journal now keeps filters/quest selection on the left and the selected quest's status, QP reward, current-part requirements and existing route action on the right. Completed/skipped quests offer Review route; all route quests complete offers existing Skills. Saved-only completion is labelled honestly. Session/resource history is retained in one closed section, not a whole book page; explicit session/legacy goals links still open it. Browsing never marks progress.

Gear and Shopping use the shared `resolveActiveActivity` / `useActiveActivity`: incomplete followed training, otherwise admitted live active route, otherwise the next route step. Completed/leftover synthetic activities never become fallbacks. This is cross-page context selection, not another training/acquisition engine. Gear compares melee only for the actual supported activity; other skills show current preparation from the existing readiness engine and all live equipment slots. It does not present the old sample cow/future fight as a current recommendation. Mandatory shopping and a quoted current consumable refill/fare reserve protect upgrade spending; unread refill prices cannot become zero.

Shopping keeps requirements on the left and an activity-specific Checkout on the right: current cost, checked cash, optional bank stock, refill allowance and confirmed shortfall. One primary action reuses funding, copy-order or preparation. Detailed budget calculations stay secondary. Skills keeps the same Ledger typography with a readable two-column icon index, a useful selection/tracked prompt instead of the unselected XP table, one existing Plan entry and a closed XP table in Calculator. Canonical phased training/model behavior is unchanged by this layout batch.

Targeted automated coverage includes cross-page followed Ranged context versus active route, non-melee gloves/equipment, poor/rich bank stock, Journal selection/filter/review/completed/unknown completion/session retention and unchanged progress. Local and complete exact-source CI/release evidence is recorded in Current verification and the delivery receipt. All real-game checks remain Claude's responsibility.

### P2 — finish staged Skills/Optional review using the existing engines

Use [SKILLS_COVERAGE.md](docs/SKILLS_COVERAGE.md) as the capability inventory. Review melee, Ranged and Magic as well as the peaceful skills; do not assume guide data means complete modeling. For each supported skill, verify:

1. Correct observed/saved/unknown level, target and account scope.
2. A practical first method and relevant kit, consumables, equipment restrictions and costs.
3. Automatic preparation/banking/acquisition/funding/resumption through the shared lifecycle.
4. Worthwhile method/equipment changes as observed levels rise, without restarting or losing progress.
5. Logical F2P stopping guidance and the Optional chapter's ordering before membership; check route-specific targets against current F2P advice instead of assuming every target is identical.
6. Correct next action/completion and no old static recommendation elsewhere contradicting the current plan.

Keep unsupported members mechanics and uncalibrated rates explicit. Add missing mechanics to shared contracts/adapters, with regressions that also cover new/synthetic content. Do not solve each skill by copying the Ranged implementation.

**Next confirmed Prayer data gap (not fixed in2.81.16):** pr-camdozaal currently has only the quest gate and starts at Prayer7. Primary [Raw guppy](https://oldschool.runescape.wiki/w/Raw_guppy) and [Guppy](https://oldschool.runescape.wiki/w/Guppy), checked2026-10-31, require Fishing7 with a Small fishing net, Cooking7 with a Knife/preparation table, and Prayer1 to offer. Add those declarative skill/kit gates and reconcile the matching guide; do not turn unavailable prerequisites into READY or claim a complete personalized Camdozaal process/rate model. Preserve untradeable fish/failure/sequence limitations explicitly. The same catalogue entry lacks place (methodPoint returns null), has an unsupported fixed2400XP/h, and legacy prayer-04 incorrectly says to offer raw fish. Reuse a verified named-location/guide mapping and correct catch→prepare→offer instructions; do not invent coordinates or call the incomplete activity a model.

The confirmed Thread consumption gap has a shared correction in the 2.81.15 source section below; use its verification/delivery status rather than assuming unreleased edits are already installed. Continue the six-point review for other skills and unsupported mechanics. One Crafting correction is not completion of the whole P2 backlog.

### Cooking progression and shared batch fixes — 2.81.14 source

Verified against the Wiki on 2026-10-31: [F2P Cooking](https://oldschool.runescape.wiki/w/Free-to-play_Cooking_training) and each recipe's live Recipe/Skilling success chart via the existing Wiki reader. Seven missing recipes now cover shrimps, anchovies, sardines, herring, pike, lobster and swordfish; the existing salmon recipe is now connected to its training family. Trout is usable from Cooking15, pike20 and salmon25. The three existing method families select usable owned fish or funded alternatives through the same processing model. No new per-skill buying/funding loop or design changes.

- The builder's shared `recipeTicks` reads ordinary Make-X timing including the Wiki's “Make-All is4 ticks” note; it must not import first-item one-tick timing as sustained cooking speed. Swordfish uses its **Fire** burn chart, not range/gauntlet bonuses. Existing recipes/station coordinates were unchanged by the rebuild.
- At **confirmed zero cash**, Balanced/Profit keep an executable kit ahead of an **unpriced processing batch**. This does not ban ordinary tool/spot investment or change Fastest/Relaxed preferences. Known affordable purchases still compete on their existing time/profit/setup rules. Missing prices are never guessed.
- Processing station scene targets are verified from the source page's object names. A multiple-name page needs an explicit validated selection in processing.defs.json; a future cooking range must not be labelled Fire merely because both use the cooking facility contract. `RateSpot.objectNames` flows through methodPick/withTrainingMethod and merges existing access hints.
- Owned compatible partial catches use the shared material allocator without a refill trip after every action. New recipe inputs enter the shared bank/inventory watch automatically. Burn-adjusted XP, current batches, conditional goal/stock demand, acquisition and return to the original activity use existing engines.
- Legacy Cooking guide content and its generator retain their IDs but now explain proper early unlocks, use the Barbarian Village fire instead of sending owned tuna to Karamja, and remove blanket cheap-wine/guaranteed Fishing-to-Cooking progress claims. Explicit saved goals remain explicit.

Source verification/release status belongs in Current verification and the delivery receipt. This completes these common F2P Cooking progression fixes, **not every Cooking recipe, Members mechanic or skill/model factual review**. Remaining P2 checks still apply to the other skills; all real-game checks stay with Claude.

### Crafting materials and jewellery — 2.81.15 source

Primary facts checked2026-10-31: [Thread](https://oldschool.runescape.wiki/w/Thread) has five uses per crafting action, irrespective of hides consumed; [Tiara](https://oldschool.runescape.wiki/w/Tiara) is F2P Crafting23,52.5XP, three ticks, one Silver bar and a Tiara mould at a furnace.

- The builder's shared consumableUses facts require the source evidence and matching numeric uses. Every registered recipe using that ingredient inherits its average quantity and a one-time allowance for an unread partly used first unit. Ordinary materials and reusable needles are unchanged.
- Shared consumption helpers round actual preparation quantities to whole items and conservatively invert available stock into executable actions. Partial-batch readiness, conditional whole-goal/stock demand and funding use that same allowance; average replacement cost uses only expected consumption. Do not use average fractions alone to guarantee an unknown partial spool's actions.
- The existing cr-gold family now includes silver tiaras from23 and remains useful through43, competing with other usable methods under the existing budget/priority rules. Names reflect gold and silver; recipe IDs and saved selections are preserved. The selected mould/bars/station flow through the existing acquisition and guide engine. There is no new Crafting UI, buying loop or compulsory tiara purchase.
- Corresponding legacy Crafting guide/generator and Reference jewellery advice no longer imply guaranteed profit or diamonds before43. An example starter leather batch requires26leather, six thread spools and one reusable needle, rather than arbitrary50thread. Main recommendations remain the dynamic planner.
- New synthetic multi-use tests cover every possible first-unit remainder, physical stock boundaries, ordinary inputs and invalid metadata. Real tracked Crafting tests cover partial thread, owned silver/mould, level unlocks, unchanged observed state and whole-goal demand. Browser cases exercise Skills→followed guide→Shopping at zero cash without unnecessary buying/funding.

Verification and release status are recorded above. This is a common F2P Crafting correction, not a claim that all jewellery, leather products, Members mechanics or remaining skills have been audited. All real-game acceptance remains Claude's.

### Smithing connection and Firemaking review — 2.81.16 source

Primary facts checked2026-10-31 through the existing Wiki reader/builder: [F2P Smithing](https://oldschool.runescape.wiki/w/Free-to-play_Smithing_training), each bar/dagger/warhammer Recipe, and the existing Firemaking definitions.

- Furnace recipes existed but had no Skills method dispatch. The new sm-smelting catalogue family connects ordinary bronze/iron/silver/steel/gold/mithril/adamantite/runite smelting to the existing processing, preparation, stock, pricing and guide lifecycle. No new skill-specific buying/funding engine or UI was added.
- Three missing ordinary higher-bar recipes use verified four/six/eight coal for mithril/adamantite/runite, with true unlocks50/70/85. Blast Furnace, catalysts and Superheat are separate mechanics, never imported as ordinary F2P furnace assumptions. Iron remains50% yield/XP without assuming a ring bonus; unsupported bonuses are explicit.
- Existing iron/steel/mithril/adamant family IDs now include daggers, warhammers and platebodies. Their first unlocks15/30/50/70 and each recipe's own level control eligibility. Feasible one/three/five-bar leftovers can be used without buying enough bars for a platebody. Recipe speed, material opportunity cost, output quotes and wallet remain part of the shared model.
- Legacy Smithing guide/source no longer promises a cheap sub-hour grind or mithril/adamant armour at40. Corresponding actual recipe thresholds and manual furnace-versus-anvil activities are explained; guide IDs/explicit goals are preserved. Generated coverage/default fixture inventories are refreshed.
- Added regression coverage for all eight furnace input mixes, whole bag capacities, iron failure XP, all four anvil tiers at one/three/five bars, unlock transitions and the actual followed furnace/preparation path. Existing reusable processing browser cases now cover Crafting, Smithing and Firemaking without duplicating a separate test flow per skill.
- Firemaking's five existing line-lighting families were reviewed and tested at actual log unlocks with an owned partial batch and reusable Tinderbox. This establishes those supported paths, not bonfire/Wintertodt modeling or live terrain/timing validation. Those and any unmodelled equipment effects remain outside this verification.

Verification/delivery status is recorded above; all real-game acceptance remains Claude's. Remaining P2/P3 work still includes gathering/Prayer/Runecraft and unsupported mechanics/visible-consumer checks. This section is not a full-project completion claim.

### P3 — finish content review and reconcile visible consumers

Review Path, Skills, Gear, Shopping, Money and Reference/search for stale recommendations, mismatched quantities, redundant controls and ambiguous unknown/missing states. Keep the concise default and reveal explanation only when useful. Useful factual tables can remain in Reference; competing default training plans cannot.

The cleanup already removes the competing catalogue roadmaps and qualifies static melee-order/Smithing/Ranged purchasing advice. DEFAULT_PLANS.md is a generated regression inventory: its legacy collection cases are explicitly historical, while its live S4-03 heading is derived from current route data. Do not mistake the old50-bone fixture for the current Giant-frog XP-only step. This is **not a claim that every Wiki fact, table, members method and price assumption has been revalidated**. Record exact remaining surfaces, source dates and model gaps; do not silently mark the old full-project audit backlog complete.

### P4 — Claude's real-client acceptance

Use the published verified Portable and restart its launched client so the actual loaded plugin version is known. Verify actual login/link state, not only a reachable port. Respect the owner's manual/limited-input testing constraints.

At takeover, run a short baseline smoke first (loaded version, app/client link, HUD, stats/inventory/bank provenance). Then implement the remaining source work and run the full matrix below. If the desktop is unavailable, continue independent source work and leave live evidence explicitly pending.

- Exercise current training → bank/GE/source → acquisition → equip/use current tier → next level/method/tier → refill/funding → resume. Include Ranged bows/arrows, Magic runes/staff/clothing and representative peaceful tools/processing.
- Open an unread bank, refresh a remembered bank, withdraw/equip/consume supplies and check both UI and HUD updates. Check insufficient coins and cancellation/recovery without resetting progress.
- Verify default Balanced behavior, alternate priorities, carried versus worn tools, mode restrictions and equivalent/better gear.
- Inspect single HUD collapsed/expanded/preparation/warning states, position persistence, clicks/dragging, one current action and current/next-phase agreement. Verify map selection and game navigation against actual locations.
- Inspect the accepted app layout at relevant desktop/DPI sizes: fonts, wrapping, clipping, scroll areas, tabs, dialogs and functional buttons. No mobile sweep.
- Check relevant available quest preparation/dialogue/completion and launcher/plugin compatibility. A completed quest or unreachable encounter is **not live-tested**; do not reset real progress or fabricate a replay. Record the limitation.
- For HDOS, verify only capabilities actually supplied by its adapter. Do not claim RuneLite parity without evidence.

Record scenario, app/plugin versions, starting facts, expected/actual result and screenshots where useful. Separate implemented, automated, native-shell, live and unverified evidence. Fix a confirmed shared bug at its owning layer and rerun affected checks.

### Consolidated live regression matrix — Claude owns every row

Record actual version/source/plugin/protocol, account mode, admitted facts, expected/actual result and evidence; mark PASS / FAIL / NOT REACHABLE. Restore reversible settings and original activity. Prior screenshots/older-build results are not proof of current behavior.

| Area | Required reachable checks |
|---|---|
|Launch/link/state|Authenticated app launch; loaded plugin/version, real login, World316 if appropriate; logout/hop/reconnect/restart, unread bank, profile switch and delayed old-session events.|
|Ranged|Stage/actual NPC level, compatible owned shortbow/longbow and one ammo stack, worn quantities, bow/armour/arrow unlocks, food bank detour, current target stability.100→99 arrows must not cause a trip; low-watermark/refill behavior remains.|
|Stock-up|Poor/rich/unknown-bank/remembered-bank cases; larger reserve plus useful next bows/tools at one GE visit; money held for current kit/refill; bank extras, later withdraw/equip without rebuy; optional stock never blocks progress.|
|Melee/combat|Default practical/Balanced spot versus viable XP/Money alternatives; real damage, food, bank time/net proceeds; Strength versus Power/weapon and armour tradeoffs, actual style and Defence preference.|
|Magic|Named spell/unlocks, rune quantities, elemental staff actually worn, full gear model and metal penalty. Superheat actual levels/unnoted iron/runes/staff, partial bag and bank coal; no stale NPC targets. Alchemy/splashing remain explicitly selected safe setups.|
|Gathering|Woodcutting/Mining/Fishing methods, named tools actually carried/worn and skill versus Attack requirement; future-tier ownership, useful upgrades, correct spot/bank/entrance/floor and stage transition. No false inventory-slot credit from Attack alone.|
|Processing/utility|Cooking/Smithing/Crafting/Firemaking and supported Members recipes, failure/inputs/output/fees, affordable partial batches, reusable tools and material alternatives. Smithing: furnace versus anvil, ore/coal bag capacity, ordinary iron failures and feasible one/three/five-bar stacks; Firemaking: log tiers, real clear ignition space and reusable Tinderbox. Crafting: one/two partial Thread spools without refill loops, no one-spool-per-item cost, silver/mould at23 and furnace guide; Cooking: owned catch/fire/unlocks/Make-X. Prayer/Runecraft default defer versus explicit goal; real altar entry/exit/timing.|
|Mixed/quest XP|Fishing→Cooking and Mining→Woodcutting handover, every declared goal retained, no unearned XP/quest credit. Actual quest preparation deep-link/goal/return; stop/cancel/funding restores original route.|
|Physical supplies|Noted food is owned but uneatable; correct bank withdrawal/unnote. Equivalent foods by healing still use real pieces/slots. Potions combine doses across sizes without pretending they were poured. Missing/unread facts stay distinct.|
|Quests/branches|Reachable Oracle/Dragon Slayer entry/dialogue/map parts, Shield of Arrav branches, partial quest milestones and encounter-entry food/gear guards. Completed encounters are NOT REACHABLE, never replayed/reset just for testing.|
|Travel/funding|Real teleports/unlocks/charges/runes/cash and whole detour versus walking; unsupported canoes/transport explicit. Money methods respect account restrictions, input cost, tax/liquidity and actual earned session GP; no assumed future sales.|
|HUD/map/UI|One collapsed/expanded guide, one leading risk warning, current/next-phase alignment, saved position/click/Alt-drag. One map preview, full-map point selection, actual arrow target. Accepted fonts/layout, wraps/scrolls/dialogs/buttons at desktop sizes/DPI; no mobile sweep.|
|Persistence/updater|Use isolated profiles for corrupt/future/external-file recovery, backups/profile protection and actual old→new EXE update/handoff; never risk the owner's only save. Existing native automated proof does not establish a new live-game scenario.|

## Development and release procedure

- Read the project instructions and current git status before changing files. The Codex checkpoint `.codex/work-state.md` is local agent state, not a tracked release artifact. Do not reset/clean valid work or import unrelated branches.
- Use existing Node/JDK/Gradle setup. Standard gates include `npx tsc --noEmit`, `npm test -- --run`, `npm run check-data`, `npm run build`, `npm run test:ui`, `npm run test:e2e`, and the full Java/packaged-Portable CI gates. Inspect workflow commands rather than guessing them.
- Browser tests use port4179: do not run two browser runners or rebuild `dist` underneath an active runner. Native E2E uses isolated data/a bridge stub; never point it at the real profile.
- Retiring a feature includes exclusive UI/state/handlers/IPC/styles/imports/tests. Keep shared consumers, persisted progress, backups and operational diagnostics. A CSS selector can affect a nested dialog even when the parent feature looks unrelated.
- Preserve meaningful regression coverage. Adapt obsolete mode/layout assertions to surviving user actions; do not restore an obsolete screen just to satisfy a test.
- At a recoverable verified batch, main and a normal Portable are authorized. Update the handoff/receipt after exact-source CI and artifact verification; never call “asset exists” sufficient evidence of release success.
- Keep explanations short and spend effort on implementation/verification. If interrupted, checkpoint the exact next action and distinguish local WIP from published code.
- Do not publish raw authentication material, real account/bank snapshots or private session logs. Use isolated fixtures and redact identifying game screenshots.
