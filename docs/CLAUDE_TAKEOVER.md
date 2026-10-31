# OSRS Path: architecture, completed work and takeover plan

Updated 2026-10-31. Read this together with [CLAUDE_NEXT_SESSION.md](CLAUDE_NEXT_SESSION.md), which records the latest published version and exact artifact receipt. Historical audit documents are context, not an instruction to repeat completed work.

## Current delivery boundary

- Published and verified: normal Portable **2.81.10**, source `73b56c66c59a377d1e46d88ff86e3c7eb6f5eeff`. Checks41141688623 and Release41141688525 passed. Download:102442918 bytes, SHA256 `7aad6ce696f3e5ec00939020d789bf73652d8d08d4ab969965e4ac2721e274b8`. Receipt commit `656c5d3` is on main.
- **The subsequent UI/content cleanup is currently local WIP, not yet a verified release.** Its implementation and verification state below must not be confused with the published10 artifact. Update this boundary after publication.
- All real-game acceptance belongs to Claude. Browser mocks, native-shell tests, Java tests and rendered HUD fixtures are not in-game evidence.

## Owner requirements that remain binding

1. Preserve Claude's accepted Ledger design and fonts. Do not restore an earlier redesign to make old tests pass.
2. Default training should be practical and balanced: useful XP, affordable supplies, reasonable net earnings, recovery and banking. XP and Money are alternative preferences, not a requirement to configure a complicated screen first.
3. Training must progress through worthwhile methods and equipment tiers. Do not turn a skill into one static monster/resource grind to the final level. A tier change is justified by capability, cost and benefit; it is not an arbitrary change every ten levels.
4. Use the shared engines. Adding a quest, monster, recipe or training method must inherit existing eligibility, preparation, ownership, budgeting, routing and completion contracts. New mechanics still need explicit shared modelling and tests; centralization is not proof that every future mechanic works automatically.
5. Unknown is not missing, zero, unavailable or owned. Preserve provenance, bank freshness and profile identity. Do not fabricate XP, quest completion, money, sale proceeds or equipment.
6. Purchases and gameplay remain manual. The program recommends, detects, records and guides; it does not buy, move, fight or eat for the player.
7. Windows desktop only. No mobile development or phone-only QA. Keep desktop resizing, OS DPI and accessibility.
8. Do not modify RuneLite Optimizer, PC-Tune or experimental graphics repositories as part of this task.

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

### Important shared contracts and fixes to preserve

- Catalogue-backed followed Skills use the Path preparation, Shopping and funding lifecycle. The old guide-only path data is not evidence of a fully personalized model. See [SKILLS_COVERAGE.md](SKILLS_COVERAGE.md).
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

Design entry points are `src/ledger/{Chrome.tsx,parts.tsx,icons.tsx,ledger.css,app.css,extras.css,fonts.css}` and the shell in `src/App.tsx`. Older foundation CSS still supports shared components. Preserve specificity and inspect every consumer before deleting it. `PROJECT_MAP.md`'s2.48 description is historical, not the target design.

The local cleanup implements these owner decisions:

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

## Verification state for the local cleanup

- Coordinated2.81.11 types/build and data validation passed (0 errors/0 warnings); the fresh Java suite passed647 tests with no failures/errors and produced the plugin jar.
- Final feature-tree unit run: **2404 tests /202 files passed**. Later changes only corrected browser assertions and documentation/comments, including3 passing coverage-ledger generator checks.
- Dedicated cleanup, F2P Skills and quest-map navigation scenarios passed. They cover legacy saved preferences, retained training/helpers/updater UI, completed Plan state, single map, retry and point navigation.
- Native-shell E2E passed, including real pin IPC, legacy zoom retirement without losing backup settings, progress/profile protection and damaged/external-data recovery. It uses isolated test data and a bridge stub, not the real character.
- The complete local browser run passed906 checks; two assertions counted the embedded Journal quest pane incorrectly and were corrected to check each book leaf explicitly. The corrected complete core run passed, including Journal at1000/1440px; fresh native E2E passed. The generated coverage ledger now also distinguishes canonical/guide-only/passive views (3 generator tests passed). Exact-source complete CI and the new Portable receipt remain required; this is not yet a published cleanup.
- No real-game verification is claimed.

## Remaining work in priority order

### P0 — finish and release the cleanup

Finish the complete browser regression run without restoring removed features or deleting surviving functional coverage. Check every affected navigation surface, reference/empty/completed states and map actions. Keep [UI_CLEANUP_REVIEW.md](UI_CLEANUP_REVIEW.md) honest about pending data reviews.

Then coordinate package/lock/Java plugin versions, build a fresh jar, run the relevant full gates, publish main + normal single-EXE Portable, await exact-source Checks/Release, download and compare the EXE/hash/manifest/size/tag source, and update this document's delivery boundary. Do not overwrite an existing release asset.

### P1 — shared useful buy-ahead and bank stock

Latest owner request: when buying supplies, consider a sensible larger ammunition/material reserve and the **next couple of useful equipment/tool/bow tiers** so the player does not repeatedly return to the Exchange. Future items can stay in the bank.

Reuse milestone/conditional whole-goal demand, allocations, acquisition sources, Shopping, quotes and funding. Avoid a second per-skill shopping system. Honor the actual stopping goal, availability/unlocks, already owned equivalents, known bank stock, price freshness and cash after current-kit/food/travel reserves. Unknown bank/price/cash is not permission to spend. Do not assume future earnings.

Whole-goal demand is currently established for supported processing and Ranged cases, not every Magic/melee/gathering/mixed-goal mechanic. Where a forecast is absent, extend the owning shared model contract; do not manufacture quantities from a static guide.

Future stock must not become a current wear/carry requirement, a red missing-item warning or a readiness blocker. Do not buy tiers beyond the goal or buy redundant grades. Present one concise shopping/trip recommendation, not a new stack of menus. Detect the resulting owned/banked stock and avoid repeated purchase requests. Verify poor/rich/unread-bank/already-owned/partially-filled scenarios and multiple skills with synthetic content.

- Do not launch funding or force a verification/bank detour solely to afford optional extras when the current activity can proceed.
- Do not assume future levels in unrelated skills or quest unlocks just because the trained skill will rise.
- Future bank stock must not pollute the current training NPC/resource/map target. At the relevant threshold, withdraw owned stock rather than suggesting the same purchase again.
- Reuse existing reserve/refill and quantity semantics. Do not create a shopping trip after every arrow or food item is consumed.

**Not implemented yet.** The existing whole-goal demand is a foundation, not proof that economical multi-tier purchase routing already works.

### P2 — finish staged Skills/Optional review using the existing engines

Use [SKILLS_COVERAGE.md](SKILLS_COVERAGE.md) as the capability inventory. Review melee, Ranged and Magic as well as the peaceful skills; do not assume guide data means complete modeling. For each supported skill, verify:

1. Correct observed/saved/unknown level, target and account scope.
2. A practical first method and relevant kit, consumables, equipment restrictions and costs.
3. Automatic preparation/banking/acquisition/funding/resumption through the shared lifecycle.
4. Worthwhile method/equipment changes as observed levels rise, without restarting or losing progress.
5. Logical F2P stopping guidance and the Optional chapter's ordering before membership; check route-specific targets against current F2P advice instead of assuming every target is identical.
6. Correct next action/completion and no old static recommendation elsewhere contradicting the current plan.

Keep unsupported members mechanics and uncalibrated rates explicit. Add missing mechanics to shared contracts/adapters, with regressions that also cover new/synthetic content. Do not solve each skill by copying the Ranged implementation.

### P3 — finish content review and reconcile visible consumers

Review Path, Skills, Gear, Shopping, Money and Reference/search for stale recommendations, mismatched quantities, redundant controls and ambiguous unknown/missing states. Keep the concise default and reveal explanation only when useful. Useful factual tables can remain in Reference; competing default training plans cannot.

The cleanup already removes the competing catalogue roadmaps and qualifies static melee-order/Smithing/Ranged purchasing advice. This is **not a claim that every Wiki fact, table, members method and price assumption has been revalidated**. Record exact remaining surfaces, source dates and model gaps; do not silently mark the old full-project audit backlog complete.

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

## Development and release procedure

- Read the project instructions and current git status before changing files. The Codex checkpoint `.codex/work-state.md` is local agent state, not a tracked release artifact. Do not reset/clean valid work or import unrelated branches.
- Use existing Node/JDK/Gradle setup. Standard gates include `npx tsc --noEmit`, `npm test -- --run`, `npm run check-data`, `npm run build`, `npm run test:ui`, `npm run test:e2e`, and the full Java/packaged-Portable CI gates. Inspect workflow commands rather than guessing them.
- Browser tests use port4179: do not run two browser runners or rebuild `dist` underneath an active runner. Native E2E uses isolated data/a bridge stub; never point it at the real profile.
- Retiring a feature includes exclusive UI/state/handlers/IPC/styles/imports/tests. Keep shared consumers, persisted progress, backups and operational diagnostics. A CSS selector can affect a nested dialog even when the parent feature looks unrelated.
- Preserve meaningful regression coverage. Adapt obsolete mode/layout assertions to surviving user actions; do not restore an obsolete screen just to satisfy a test.
- At a recoverable verified batch, main and a normal Portable are authorized. Update the handoff/receipt after exact-source CI and artifact verification; never call “asset exists” sufficient evidence of release success.
- Keep explanations short and spend effort on implementation/verification. If interrupted, checkpoint the exact next action and distinguish local WIP from published code.
- Do not publish raw authentication material, real account/bank snapshots or private session logs. Use isolated fixtures and redact identifying game screenshots.
