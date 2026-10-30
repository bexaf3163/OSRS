# Engine hardening — Codex continuation, 2026-10-26

## Desktop-only scope — owner decision, 2026-10-28

No mobile/phone development or phone-only QA. Keep Windows desktop resizing, DPI/text scaling, themes and accessibility. See the authoritative desktop-only scope in [PROJECT_GUIDELINES.md](../PROJECT_GUIDELINES.md).

## Current continuation — 2.80.14

Use [CLAUDE_NEXT_SESSION.md](CLAUDE_NEXT_SESSION.md) for the authoritative current scope, verification and portable receipt.14 contains F2P Skills checkpoints and desktop-only QA; future-only food-alias work is parked and excluded. Older receipts below are historical; do not repeat completed work or restore mobile QA.

## Current continuation — 2.80.13 quest-entry preparation

Preserves Claude2.80.12 heap fix (`e3f8642`, receipt`4e86414`): keep `-Xmx1024m`, `-ea` and other launcher arguments. Earlier2.80.11 receipts below remain historical.

Implemented through existing engines:
- `entryFoodStep` promotes only explicitly recommended food matching the confirmed current quest entry guard, only when no global food budget exists. Readiness, preparation, Shopping, cleanup protection and funding consume the same projected steps. Future previews, mismatched/disconnected cursors and existing declared budgets are unchanged; entry food returns to optional after entry.
- Lost City: selected Fire Strike strategy checks Magic13, distinguished from official quest unlock requirements. Four Tuna (40 nominalHP) are an explicitly labelled guide setup buffer, not a Wiki quantity or full-fight survival estimate. Entry alternatives are Trout/Salmon/Lobster. Existing65-cast allowance is labelled as the guide's allowance, not the Wiki Crumble Undead cast estimate. Do not bring the dungeon axe onto Entrana.
- Quest entry guards name actual physical alternative withdrawals/notes through existing food allocation (e.g.5Salmon for4Tuna). Bank freshness/UNKNOWN and realHP caps remain; Java and TS match. Food warning healing is a lower bound after equivalent rounding.
- Consumer dependency equivalence checks only skills that its training producer can supply. Other missing or unknown skills remain independent blockers. No producer completion/save mutation or quest/item bypass is inferred.

Final local checks passed:2257 TypeScript tests/191 files,647 Java tests, 1037 full browser checks,92 source Electron checks, build/TypeScript, data0errors/warnings and rebuilt pluginJAR. The browser test covers confirmed entry→inside and physical Salmon withdrawal; units cover shared Shopping/funding protection and UNKNOWN cases. Published and verified: source2de5c6479d551acdb372d9084af8b71f42b6bb6d; Release40727983099 and Checks40727983660 succeeded. Actual downloaded OSRS-Put-2.80.13-portable.exe102085790bytes, SHA25668ede58e0c3782842d7eed3f8556632b79a21d57574a91ba564484dee219b0ed, matching GitHub digest and downloadedSHA256SUMS. Actual game acceptance remains assigned to Claude.

Remaining: known-mode food usability (Mackerel/Cod/Bass must not count as edible F2P alternatives); acquisition travel/fees, goal-wide supplies/future-purchase economics and source-backed remaining Members models. These are separate follow-ups, not claimed solved. Do not duplicate engines or infer unavailable inventory/membership facts.


## Current continuation - 2.80.11 published (2026-10-28)

Normal releases2.80.8-2.80.11 are published; all their Checks/Release workflows succeeded. Each EXE below was downloaded and hashed; its hash matches GitHub's asset digest and the downloaded SHA256SUMS. No preview releases were substituted.

| Version | Source | Release / Checks | EXE bytes | SHA256 |
| --- | --- | --- | --- | --- |
|2.80.8|6795a624cdc0634501214381995a899ea0b89c73|40589844389 /40589844345|102082401|71b0ad15bed53d8eb7f6338da6115136ce0aa8cc47462535ba83f531e3178d27|
|2.80.9|a15567a4bd3894a594a47b430980e554778e5a37|40590735860 /40590735962|102081268|ba9ea5a1b3d1bbb94375de2e91c744f9f1d4d40dc3ae726e979ede33ea22393d|
|2.80.10|0786ab4a6dc6e66f15c1fca42919d41581179ad4|40592783566 /40592783510|102081647|f50b94c8ac6653b6b8531ecab530b018415152c2deaf73fb906f58bd4fa724c3|

|2.80.11|398fdc9eed7c56d174d0c9fc30d7a17afe38798a|40674526384 /40674526398|102083285|88f439f834f8a54ae581a12577ee4a1109022b726750d15c508909b7f3cf6978|

Delivered engine repairs (do not rebuild):
-2.80.7/8: shared food holding/allocation across readiness, departure, Shopping, funding and Java Checklist/quest guards. Sum healing before rounding; cap by real HP; preserve unread-bank uncertainty, exact quest ingredients and manual ownership keys; allocate one physical stack once without mutating snapshots. Merged alternatives must satisfy every source.
-Physical foodCarry selects carried pieces before notes/bank; preparation slots, bank targets and withdrawals name actual food.34Trout covering26Salmon-equivalents occupy34slots. Bag/notes/bank partial healing receives cumulative credit; current/upcoming deadlines do not duplicate withdrawals. Notes require a bank; packing remains a conservative estimate.
-2.80.9: skipped damaged/unsupported sources and protected current-day/latest destinations are reported through existing Settings warnings while healthy files continue copying. Protected bytes remain untouched; first-write kept/skipped outcomes do not falsely clear warnings. No changed save format or added panels.
-2.80.10: backup-history persistence follows the actual write receipt and retries unchanged diagnostics after a failed ui.json write. Primary-save success remains independent. Native source acceptance passed87checks including a fully new process retaining first-write warnings. This is not a claimed portable restart or power-loss test.

Verification already delivered:2.80.8 local2239TS/646Java/1035browser/75sourceElectron checks;2.80.9 local2242TS/53focused-profile-UI/81sourceElectron;2.80.10 local2242TS/87sourceElectron. Each normal release CI repeats full units/Java/browser/packaged gates. Current npm audit reports0advisories across376dependencies; the earlier eight-moderate result is historical, with no force fix or dependency edit.

Additional native acceptance: profile-list Merge preserves every character and both raw original lists; native/browser lists agree after reload. First-write-copy errors/history are tested. Real update2.80.5->2.80.6 passed40549572912: download/digest/install/automatic restart, oldEXE/cleanup removal, healthy recheck and byte-identical S1-01 save. Do not repeat this completed normal update test as unfinished.

Published2.80.11 extends the same native file/writer pipeline:
-Compare the actual file with its last-read revision before any primary or session-copy write. Unread existing files, external replacements/deletions/creations and read errors do not authorize overwrite. Successful physical writes alone advance the revision.
-The existing progress warning retains browser edits and explains export/reload. Before admitting a changed source on reload, retain its exact bytes as <name>.external-<time>-<uuid>.json. If retention fails, keep the source protected. The shared guard covers progress and character-list files.
-Final local acceptance:2247TS tests/190files,92sourceElectron checks,53focused profile-UI checks, build/TypeScript,data0errors/warnings and rebuiltJar passed. Native acceptance covers the actual warning/export/reload path and exact external-byte retention, alongside all earlier backup/conflict/history/restart cases. Normal2.80.11 Release/Checks and packaged acceptance passed; actual downloaded EXE receipt is in the table above.

Limits/open work: this is pre-write detection, not filesystem watching, automatic conflict merging or cross-process locking. Interrupted-write/power-loss recovery, broader historical audit cases, acquisition travel/fees and verified Members coverage remain open. Finite owned Strength doses/costs are already shared/tested; do not invent mandatory goal-wide potion purchases. In-game acceptance belongs to Claude. Preserve one compact Balanced default and existing route IDs/saves.


## Local continuation — remaining combat supplies, 2026-10-27

- Resolved combat picks now retain food for all unfinished phases and the remaining equipment phase's usable armour alternatives. Defence eligibility is projected in a copy through the existing armour policy; no actual player level or account inventory is changed.
- Runtime goalItemsRequired projects purchases from that plan. Current itemsRequired remains the current carrying/equipping checklist. Whole-goal Shopping, funding and cleanup protection use the same projected requirements; the bridge watches future supplies without adding them to the immediate checklist.
- The current phase's more conservative food estimate can raise the goal allowance; completing a phase removes its demand. Zero-food plans do not retain a mandatory food purchase. New training-method, unknown-level and goal-reached projections clear superseded combat purchases. Goal quantity updates do not resend the HUD on every kill.
- Regression coverage: armour phase retains later food, whole-goal Shopping versus immediate readiness, cleanup reservation, watched-but-not-required future food, completed-phase demand, quantity updates/resend stability and method handover. The historical split-plan test now counts both training and later collection food rather than asserting the current phase alone costs one quarter as much.
- Full unit run: 2,220 tests / 188 files passed; subsequent method-handover regression (26-test file) passed. TypeScript/build and data 0 errors/warnings passed. No Java source changed since full639-test verification. Source Electron E2E passed in an isolated profile/mock bridge, including native save/read/backup recovery. Electron44.9.3 runtime installed successfully with the working task TEMP; plugin jar rebuilt from current source. Full browser suite is running against Chromium1247; collect its final result before publication. Browser/runtime blocks described in older sections are superseded by these current results.
- These fixes are local only; running2.80.4 remains unchanged. Still open: automatic food substitution across all consumers, acquisition travel/fees, goal-wide potion replenishment/future purchase simulation and remaining source-backed Members models. Do not treat this projection as a complete acquisition-time or future-economy simulator.

## Local continuation — quest purchase guard, 2026-10-27

- Reproduced in real released RuneLite: the current Dragon Slayer recovery line showed Plank as Not checked in the app, while the game said Buy Plank. The plugin had an earlier-session bank snapshot.
- Shared TS/Java Preflight now distinguishes an unread bank from a current checked-empty bank. Without a named free source, it leads to Check your bank before recommending a purchase. Known sources remain available; sufficient bag/worn items still satisfy the guard. Owned notes still lead to a bank. No encounter protection was removed.
- Plugin ignores the earlier-session bank snapshot for this pre-entry acquisition decision. The HUD uses Check bank for / bank not checked. A blocked line with no resolvable corrective target clears automatic navigation instead of falling through to the encounter tile. No protocol or saved-profile migration.
- Verified final source: 2,217 Vitest tests / 188 files; full Java 639 tests / 82 suites, 0 failures/errors; TypeScript/build and data 0 errors/warnings. The new code has not replaced the running2.80.4 client and is not yet live-verified. Browser/portable checks remain pending for this local continuation.

## Local continuation — funding certainty and live acceptance, 2026-10-27

- Funding tiers now retain their own unknown-ownership counts. A covered known subtotal cannot produce a next-trip COVERED verdict while other NOW supplies are unchecked. Unknown SOON supplies do not invalidate a fully checked free next trip. Whole-goal details mark incomplete ownership/quotes as not fully checked and label only the known part.
- This extends the existing need/assessment pipeline; no new panel, catalogue or funding engine. Final verification: 2,216 Vitest tests / 188 files, TypeScript/build, data 0 errors/warnings. Java testClasses passed earlier in this continuation; no Java changes. Full multi-phase goal purchases and automatic food substitution remain unfinished.
- Owner explicitly authorized live entry on World316 through the already-running OSRSPath-launched RuneLite session. Selected316, entered via Play Now / Click here to play, no credentials entered. Bridge status confirmed plugin2.80.4, protocol6, inGame true and current stepS5-08. App changed Waiting to Connected, received live43QP and29,192gp, and showed personalized Money suggestions. No method was started, no purchases/combat/travel performed.
- Show in game sent current S5-08; one compact HUD appeared, with banked Anti-dragon shield warning and plank acquisition guard. Header click expanded the same card; readable text, no duplicate HUD. Desktop subsequently matched the live recovery instruction, Stage2of2, with its overview marker. This is a real released2.80.4 check, not acceptance of local fixes or a replay of Elvarg.
- Live follow-up to investigate: quest-stage Plank row is Not checked, but Java Preflight directs Buy Plank when inventory lacks it and bank snapshot is unavailable/incomplete. Existing Preflight tests intentionally expect EXCHANGE for a null bank. Review app/plugin known-state parity before changing that shared guard; do not fabricate bank absence or remove encounter protection. Files: Preflight.java/check/reason, HudModel.java, app preflight.ts.
- Native world entry and collapsed/expanded warning layout have now been exercised. Saved-position/Alt-drag, bank refresh, combat/food calibration, completed/unreachable encounters and new source browser/portable checks remain unverified.

## Local continuation — combat economics, 2026-10-27 (not in released 2.80.4)

- Combat route net/ranking includes consumed food, opened Strength doses at replacement value, and only needed usable armour purchases. Owned consumables still cost money to replace; owned equivalent/better armour is not purchased again. Unknown bank/quotes prevent a fictitious zero cost.
- Reuses doses, supplyPrice, armourItems and requirementCost; no duplicate item policy or preparation engine. Future Defence eligibility is projected in a copy; live state and saved choices remain unchanged. Armour stops consume no doses; phase dose consumption is bounded by starting stock.
- Existing folded comparison shows net profit/loss or Not priced, replacing gross proceeds in the same field. Money explanation matches its net-cost ranking. No additional panels, controls or HUDs.
- Verified: 2,209 Vitest tests / 186 files, TypeScript/build, check-data 0 errors/warnings and Java testClasses. No Java production edits; existing compiler/bundle warnings remain. Focused cost/display suite: 143 tests; subsequent small-loss formatting and Gear checks: 50 tests. Added browser-smoke assertions require net/unknown in every existing comparison row; their execution remains pending.
- Native released-EXE check: owner-approved 2.80.4 launch, Skills icon grid, direct Defence page, Gear, Shopping and Money viewed at 1266x853. Layout/text readable; saved levels/equipment and unknown live ownership clearly distinguished. RuneLite opened automatically; no login, gameplay, spending, completion or profile edits performed. This validates the released UI only, not these local economics changes.
- Still required: browser/packaged checks for this new source batch and live acceptance by Claude. Armour acquisition travel time, fees, full-goal replenishment/future purchases and coordinated automatic food substitution remain open. Potion consumption remains the existing fight-time model, not a tick-accurate walk/bank decay simulation.
- Native follow-up fixed: Gear labels its neutral Cow comparison as no supported opponent selected, rather than falsely claiming no fight remains. Quest threats outside the legacy Gear catalogue are not silently modeled as melee encounters; extending actual boss comparison support remains open.

## Verified portable delivery — 2.80.4, 2026-10-27

- Release source: main3f4291199a2c2b37a956a78b302d2f3943624799. [Release40431062397](https://github.com/bexaf3163/OSRS/actions/runs/40431062397) and [Checks40431062437](https://github.com/bexaf3163/OSRS/actions/runs/40431062437) succeeded. Full data/unit/build/Java/browser, source Electron and isolated portable checks passed; no gate was bypassed.
- [Portable EXE](https://github.com/bexaf3163/OSRS/releases/download/v2.80.4/OSRS-Put-2.80.4-portable.exe):102,074,955bytes. SHA256:486d80cd0a9c5d9efdaa0f7b43e8e17975999391b5e6068f88e8bccf914ee746. Codex downloaded the published EXE and independently matched this hash to SHA256SUMS and the GitHub asset digest.
- Release attachments include CLAUDE_NEXT_SESSION.md, CODEX_ENGINE_HARDENING_HANDOFF.md and CLAUDE_IN_GAME_ACCEPTANCE.md. Build-time attachments precede this final receipt; the main-branch receipt supersedes historical pending/runtime-blocked wording.
- The failed predecessor's two ranged-navigation assertions had no Hitpoints fixture. The corrected fixture supplies HP30, retains all navigation/readiness assertions and adds the equipped-bow/banked-food regression. No production model or release gate was weakened.
- Live RuneLite testing remains Claude's responsibility. Remaining Members models, route potion/armour economics and coordinated full-goal supplies remain open. Release success does not mean that backlog is complete.


Baseline: main `ae22ab7` / released **2.80.3**. Branch `codex/engine-hardening-2-80-3`. This is a **source-only handoff for main**, not a release receipt; runtime acceptance remains outstanding. No installed player data, active plan, graphics client or other checkout changed. Do not discard the working tree.

## Implemented

### Forecast and shared upgrade advice

- `trainingRouter.buildPath` sums XP/time across every forecast level and selected method, with the existing five-level model refresh. Total includes legs beyond the six displayed. Unknown/invalid future rates suppress the total. Retained-method hysteresis compares its current forecast rate, rather than its old first-leg rate.
- Measured pace belongs only to the starting method; it is not attributed to another recommendation when a different method is followed. Mixed projections use “across your plan” in the existing time line. No extra UI panels or controls.
- Upgrade savings stop at the current method's planned switch. This is a current-rate comparison, not an upgrade-aware simulation of all future levels and purchases.
- Gear and training share `trainingWeapons` melee eligibility. Bow/staff variants share StyleGear requirements and the existing ranged/spell/combat models. Two-handed simulations remove the shield and update both equipment representations without mutating the source state.
- Owned/untracked items are not suggested for purchase; advice waits if a better usable owned weapon should be equipped first. Unknown Members bows/powered staves do not acquire a fictitious F2P upgrade.
- Balanced scoring considers time, consumables and purchase price; unknown costs are not free. Fastest remains time-first; relaxed suggests no purchase. Staff savings can be expressed as net gp after purchase without inventing faster combat. Known cash shortfalls remain disclosed in the existing sentence.
- Six ordinary staves were added via `build-gear --items-only`, using Wiki bonuses and verified StyleGear requirements. All original 135 gear objects were compared unchanged. No monster refresh was included.

### Shared processing mechanics and content

The registry now has **40 recipes, 9 stations and 26 methods**; the training catalogue has **93 entries**. New content uses the same model, preparation and funding adapter:

- Wine: thirteen two-tick mixes plus one shared twenty-tick fermentation wait. Success chart affects XP/output; failed wine still consumes ingredients. This follows the documented batch; continuous fermentation while banking is not simulated.
- Prayer: `pr-bury` keeps its ID and passive purpose, but loses the false paid-burying XP/h. New `pr-banked-bones` / `pr-banked-big-bones` are explicit paid methods, with 28 unnoted bones, bank visits, source-verified 4.5/15 XP and two-tick burying. No invented sale output or free supplies.
- Superheat iron: Magic43, Smithing15, three ticks, 53 Magic XP, Nature1/Fire4, guaranteed iron output. It does not inherit furnace iron's 50% failure. An owned usable Staff of fire substitutes Fire runes only with an explicit equip requirement. Authored 25-ore batch preserved.
- Runecraft: Air/Earth/Fire/Body keep existing method IDs; one inventory action, XP per essence, level-dependent rune yields, Rune/Pure essence alternatives, talisman versus worn tiara. Each recipe is tied to its exact altar and bank. Navigation starts at exterior ruins; bank timing uses verified exterior/interior/exit coordinates and shared bankTrip, not an invented straight line across map regions.
- Shared bag selection reuses owned alternatives first, otherwise priced alternatives. Authored interchangeable groups and batch counts remain intact (including mixed raw meat and 26-tuna handover). Modelled expected XP/input drives action count, including failed wine.
- Money uses the same batch/wait/output rules and cannot borrow another nearby station for a station-specific recipe.
- Gathering upgrade variants now return their actual consumable cost, instead of assuming faster tools necessarily save inputs per goal.

### Verification reliability

- UI smoke's cold-start skill handover waits for its actual prep-plan destination instead of a fixed 1.3-second delay. Assertions unchanged. The browser test itself remains unrun in this environment.
- SKILLS_COVERAGE was regenerated by its explicit fixture command and checked again normally; no assertions or release gates were weakened.

### Offline planning continuation

- Optional upgrade savings now subtract the shared acquisition allowance, crediting a preparation trip already needed so it is not counted twice. Small training gains cannot justify a longer purchase detour; cost-only savings must cover that time value when the coin baseline is known.
- The same declarative requirements now drive readiness and a missing next-trip kit reserve. Funding's existing quote and potion-package rules price it, reusing owned alternatives/stock. An offered replacement tool is not reserved a second time. Known cash that covers the upgrade but not its kit produces one clause: “only X gp after the kit”. Unread stock, missing prices and overlapping allocations stay unchecked; no free reserve or invented affordability. This is not the whole goal's replenishment budget or route fees.
- Food facts now include explicit Wiki membership. `build-threats --foods-only` refreshes those facts without changing any opponent data; all twelve threats were compared unchanged. Fallback FoodAdvice filters unusable Members food and orders existing suggestions by price per effective healed HP, using the shared price board and supply-price rules. No new panel.
- Ordinary food healing in the combat estimate is capped by the health a living player can be missing. The existing early-eating margin remains. Fallback advice also stops claiming that a nominal large heal covers a hit larger than that capacity. Automatic food substitution through every preparation/Shopping/HUD consumer remains open; nominal healing equivalence elsewhere has not been comprehensively changed.
- Four older builders now import the shared `scripts/wiki.ts` reader. Before/after runs replayed identical recorded source responses with writes redirected to audit output; combatFoes/rangedGear/styleGear/trainers outputs were **byte-identical**. App files were not refreshed by that experiment. Shared-reader tests cover exact source preservation, redirect flags, throttling, transient HTTP retries and explicit permanent/API failures.

## Training continuation: recovery, recipes and compact skill access

- Ranged and strike Magic now share melee's incoming-hit distribution and recovery calculation: food consumed, eating ticks, passive regeneration, free monk healing and the trainer's bank journey affect XP/h and costs. Missing HP/Defence, unsafe targets and unsupported incoming attack styles do not produce a personalized prediction. Contact combat is conservative: no safespot is inferred from prose. Magic landed zeroes use the same hit distribution in timing and counterattacks.
- Ordinary bows replace the worn weapon, ammunition and shield before both recovery and whole-goal arrow calculations. This fixes false protection/accuracy from an impossible melee-plus-bow kit. The player's equipment is not mutated. Accurate below Ranged5/Rapid afterwards matches the starter guide, with explicit style overrides preserved.
- Loot pickup/banking slows spending per hour along with XP/h. Magic now shares the combat loot rule. Unknown supply prices remain null; owned food/ammo/runes still have consumption costs.
- Processing registry: **64 recipes, 9 stations, 34 catalogue methods**. Added Wiki-backed Fletching unstrung bows/arrow shafts and Herblore3-dose potions, selected by actual level and membership. Multi-recipe methods name the concrete selected product; tools and physical batch inputs enter the same requirements ledger. Super combat potion is deliberately excluded from automatic selection until exact4-dose ingredient preparation is supported; do not substitute arbitrary dose-equivalent bottles.
- Default remains **Balanced**, preserving explicit saved preferences. The compact training card has **XP / Balanced / Money** controls using the existing feature store. Money ranks known positive proceeds after modeled supplies; unknown costs are never treated as free. Shared gathering/processing selection honors Money inside a grouped method, not only between catalogue entries. No confirmed positive income means a disclosed Balanced fallback. High-risk training does not beat a non-high-risk alternative solely on Money.
- Confirmed missing next-trip kit costs above known bag+bank coins lose to feasible alternatives; the card says how much must first be earned if that is the only method. Unknown coins/stock/quotes never become a fabricated deficit. This reuses Funding's allocation/package rules and does not budget the entire goal.
- Route combat plans use the same Money loot-keeping rule, bank/pickup time and positive income ordering. Explicit player selections persist; a better Money plan is offered. Automatic changes still wait for the existing safe trip boundary. Their current net figure is explicitly **after food**, not a claim that potion/armour acquisition is included; completing those economics remains open.
- Skills overview: compact individual icons, including direct Attack/Strength/Defence entry, no duplicate skill rail. One recommendation appears immediately. Legacy grouped URLs work; invalid subskill selections are ignored. Levels, roadmap, alternatives and plan details start collapsed; manual level entry remains available and unknown levels get an explicit instruction. Visiting another skill does not change the followed in-game plan.
- Tests cover mode persistence/legacy saves, exact direct-skill focus, unknown versus unaffordable kit, restricted/unpriced revenue, synthetic new recipes/resources inheriting Money, ranged/Magic recovery and virtual bow equipment. Smoke scenarios were updated to open the intentionally collapsed roadmap/level editor, retain their original assertions, and check direct Defence/Balanced/no duplicate menu at480/1000/1440px. These browser scenarios are **not executed** here.
- Coverage receipt now separates guide bracket coverage from model dispatch counts by skill. Agility/Thieving/Farming have guide-only catalogue rates; Construction/Hunter/Slayer/Hitpoints use guide rows. Even a model-backed entry may need readable real state or fall back for unsupported equipment. Full personalized Members coverage remains unfinished.

## Evidence

- Lockfile dependencies installed with npm ci: Vite8.3.3, Vitest5.0.5.
- Final full Vitest: **2,198 passed / 185 files**, including food eligibility/value, purchase-kit budgets, acquisition time, healing-cap and shared-fetch regressions. All assertions/release gates retained.
- TypeScript/production build passed; existing large-bundle warning remains visible. check-data: **0 errors, 0 warnings**.
- Full Java suite: **637 tests, 0 failures/errors**. No Java production files changed in this batch.
- Relevant logs: `../osrs-audit-temp/training-final-*`, `objective-java.log`, `member-processing-build.log`, `planning-data.log`, `builder-equivalence.log`, `food-membership-build.log`, `runecraft-processing-build.log`. Runtime logs and agent state must not be committed.
- Browser smoke **blocked, not passed**: missing default Playwright browser; install fails EPERM during destination canonicalization; existing Chromium exits 0xC0000022 before tests.
- Electron install **blocked, not passed**: Windows denies destination canonicalization. No candidate portable EXE was built or tested.
- Native game/desktop inaccessible. No new visual/game PASS, FPS result, or UI screenshot is claimed.

## Important limits and remaining work

1. Earlier runtime blockers are resolved: browser, source Electron and isolated portable checks passed on the published releases listed above. Repeat relevant gates for new changes; do not present the old environment blocker as current. Live HUD/game acceptance still belongs to Claude.
2. Claude performs reachable live tests in CLAUDE_IN_GAME_ACCEPTANCE.md. Unit tests do not validate real XP/h, food consumption, profits, route winding or altar arrival. Do not grind/spend merely to force inaccessible scenarios.
3. Altar timing assumes arrival near the known exit portal and uses the existing transition allowance. Walking/banking only: no pouches, teleports or run-restoring effects. Validate actual transitions/directions in game. Rune yield changes proceeds, not XP/essence.
4. Fallback food ranking, next-trip kit reserves and a shared acquisition allowance are implemented. Actual acquisition routes/fees, goal-wide replenishment, future purchases and automatic food substitution across all consumers remain open. Combat still has bounded eating assumptions and is not a survival guarantee; minimum effective-healing bounds are not a calibrated per-bite simulation.
5. Complete remaining guide-only Members models from verified sources, plus route potion/armour economics. Do not claim all peaceful skills are fully personalized. General enchant/alchemy retains manual expendable-target/budget safeguards. Do not fabricate uniform recipes or defaults. Continuous wine banking optimization and further Members coverage remain outside this candidate.
6. Existing gathering approximations remain (competition/Forestry, tolls/deposit boxes, Musa Point boat banking); see the main handoff. Static roadmap brackets may differ from the personalized pick. The four previously listed duplicate Wiki readers are consolidated and replay-verified locally.
7. Before publishing: inspect latest main and reconcile Claude's concurrent work; preserve saves/IDs/unknown ownership; run every gate; then make a new version and release receipt. The owner requests verified batches on main as normal portable releases; record each actual release receipt. Earlier unreleased-candidate wording is superseded by the published receipts above.


## Shared staged training — 2.81.2

Add content through trainingMethods and existing tool/StyleGear/gear/recipe/spell registries. `from` is entry capability; `suggestedFrom` is the automatic recommendation floor. Set `introductory: true` only when an activity should retire at its `to`; otherwise efficient older methods remain eligible. Useful unlocks can split stages without forcing a new NPC/location. Future forecasts advance only the trained skill and retain other actual prerequisites. Conditional Ranged kits live in copied state and must never become observed ownership. Stage `needs` and `untilLevel` must reach preparation and the game together; final completion goals stay unchanged. Full internal forecasts must not be truncated to the compact UI preview.

Regressions: trainingStages.test.ts (generic new content, actual Ranged thresholds, tool review, secondary-skill locks, no live mutation), rangedLoadoutPlan/rangedPreparation (kit, budget, arrow value), optionalPreparation (real checkpoint/handover), and ui-smoke ranged-preparation (actual posted game guide and current bow milestone). Live acceptance remains Claude's task. Future acquisition/consumable funding is still approximate; do not claim guaranteed affordability or a calibrated survival forecast.


2.81.2 delivery receipt: main source `6c2e4f41e33180fa4f7bb21d3ae849e952a49990`; Checks `40973832545` and Release `40973832590` succeeded. Downloaded normal Portable `102439126` bytes, SHA256 `f6c5eed9c79dcad468d6dcd9a07149e123323c050e0c9e3d1e48aea0f2a8ad1b`, verified against asset digest and manifest. Current takeover and outstanding live/unsupported-model work: docs/CLAUDE_NEXT_SESSION.md. Ledger design/fonts retained.


## Processing feasibility and recipe identity — 2.81.3

Use existing processing recipes, tools/access/staff declarations, shared requirementCost/itemRequirement and physical stock. Prefer confirmed feasible first batches over unconfirmed or proven unfundable ones; current sale forecasts are never starting funds. A partial batch must use its own banking timing and disclose unassumed replenishment. ModelRate.exactNeeds prevents personalize from broadening a resolved recipe into different mechanics. Inferred mixtures require identical registered XP/timing/access and cannot borrow one output's price. Cash updates reuse the existing complete rateKeyOf; no parallel cache or finance system. Tests: processingRates/materialStock/memberProcessing/funding processAdapter and ui-smoke processing-budget. Full depletion/acquisition models remain separate work.

Processing ETA now explicitly assumes future supplies and excludes purchasing time; batchActions is observed-plan metadata, not a whole-goal funding claim.

2.81.3 verified delivery: main source `5e13bd3330e913fc85d8c19074b5fd00d8087b24`, Checks `40977812554` and Release `40977812561` succeeded, including full final-tree browser and isolated Portable gates. Downloaded EXE `102440650` bytes, SHA256 `05b3f9a1e114f10007ad224e3a0c0bccf8d85f2b28a13f157bd2aa13c225ae60`, matches asset digest, manifest and source. Current continuation/remaining work: docs/CLAUDE_NEXT_SESSION.md.


## Conditional processing goal demand — 2.81.4

ModelRate.consumables comes from the existing processing engine's resolved inputs, after staff substitution. buildPath integrates processingActions using its existing rate samples without splitting the visible stage merely for a burn-rate change. processingGoalNeeds is aggregation only: complete supported path, expected action inputs, max reusable tools, safe whole quantities; incomplete/ambiguous paths stay unestimated. Advice→pick→step.goalItemsRequired uses existing Shopping/funding accounting, while itemsRequired keeps the first bag. A multi-goal route only exports a whole-step projection for its final unresolved skill. Regression: processingGoal.test.ts covers newly declared recipes, partial XP/sampled actions, fractional inputs, unsupported/overlap cases, immutable observed state, route shopping and separate minimum/objective/unknown funding. No future profit or purchase-fee/reinvestment model is implied.

2.81.4 verified delivery: source `bdf49d151f62d452dd472b42feed752d47370a75`; Checks `41022636385` and Release `41022636301` succeeded. Actual normal Portable `102439114` bytes, SHA256 `d9266db3bf9dd0793d3906eb081eac14c92965ec4bd29075fb5bd5cfb75ff492`, matches asset digest, manifest and source. Current takeover/limits and Claude-only live acceptance: docs/CLAUDE_NEXT_SESSION.md.


## Supported F2P Ranged goal demand — 2.81.5 candidate

Use rangedKitOf for one order-independent kit interpretation, goalArrows for staged shots/losses, and the existing styleRecovery with an explicit whole-leg kill horizon for food. Preserve the default current-rate horizon. rangedGoalNeeds must reject incomplete/unknown/unsupported paths and must never grant simulated gear/HP/cash. Shared mergeGoalNeeds sums consumed materials and maxes reusable/preparation buffers; do not create an independent stock or finance ledger. Route wholeGoal projection still requires the final unresolved skill; current checklist and minimum funding remain one bag. Arrows assume safe recovery; food uses a conservative model estimate, not a safety promise. Tests: rangedGoal.test.ts, rangedAmmo/combatSustain/processingGoal, UI ranged-preparation (Train has no extra disclosures; Plan contains food/ammo and assumptions). No trainer-ranking change.
