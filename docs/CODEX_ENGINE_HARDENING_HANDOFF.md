# Engine hardening — Codex continuation, 2026-10-26

## Verified preview continuation — 2026-10-27

Production source **2748da5** includes repairs9e26279/1613c6e/82604a8/59d1052: net combat costs, funding certainty, unread-bank quest guards and remaining-phase supplies. Carrying readiness stays phase-specific; whole-goal Shopping/Funding/cleanup retain future food and armour. No new menus or parallel engines.

Passed: **2,221 unit tests /188files;1,037 browser checks;639 Java tests /82suites;66 source Electron E2E checks;68 isolated portable E2E checks**, TypeScript/build and data0errors/warnings. Electron44.9.3 matches the lock. Browser fixtures now await an identified Entrana snapshot and retain unknown armour pricing instead of asserting positive gross profit. Production was not changed for these test repairs.

Audit portable: `OSRS-Path-audit-test-2748da5.exe`,102,075,217bytes, SHA256 `BBBE82B41F7D24186B50DF26EB5376CE72CA8BD8459BF0C9F971F24E59D0BD6F`. Bundled/rebuilt plugin SHA256 `0CEFB2B5C5A90A07BA0F6DB6E7D8DA0B34B250E0FBE9996A97BFBA8A03CFE4ED`. Internal app/plugin version remains2.80.4; identify audits by source and filename. Stable2.80.4 stays unchanged.

Owner authorized publishing ready batches. Main pushes now build and publish separate audit prereleases only after all Checks jobs pass, including source/packaged E2E. No hourly timer. Check Actions for actual publication; pushing is not proof of a published EXE.

New fixes are **not live-verified**. Existing live evidence covers released2.80.4 login/sync and collapsed/expanded HUD only. Remaining: coordinated food substitution; acquisition travel/fees; goal-wide potion/future-purchase simulation; source-backed remaining Members models; live combat/food/quest/lifecycle acceptance. Preserve UNKNOWN and saved progression. Older pending verification/publication text below is historical and superseded here.

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

1. Obtain browser smoke, source Electron and isolated portable acceptance in a working execution environment. Check narrow/large Skills layouts, existing upgrade sentence, navigation/preparation, single HUD and login lifecycle. Do not change Windows security or weaken gates to force a PASS.
2. Claude performs reachable live tests in CLAUDE_IN_GAME_ACCEPTANCE.md. Unit tests do not validate real XP/h, food consumption, profits, route winding or altar arrival. Do not grind/spend merely to force inaccessible scenarios.
3. Altar timing assumes arrival near the known exit portal and uses the existing transition allowance. Walking/banking only: no pouches, teleports or run-restoring effects. Validate actual transitions/directions in game. Rune yield changes proceeds, not XP/essence.
4. Fallback food ranking, next-trip kit reserves and a shared acquisition allowance are implemented. Actual acquisition routes/fees, goal-wide replenishment, future purchases and automatic food substitution across all consumers remain open. Combat still has bounded eating assumptions and is not a survival guarantee; minimum effective-healing bounds are not a calibrated per-bite simulation.
5. Complete remaining guide-only Members models from verified sources, plus route potion/armour economics. Do not claim all peaceful skills are fully personalized. General enchant/alchemy retains manual expendable-target/budget safeguards. Do not fabricate uniform recipes or defaults. Continuous wine banking optimization and further Members coverage remain outside this candidate.
6. Existing gathering approximations remain (competition/Forestry, tolls/deposit boxes, Musa Point boat banking); see the main handoff. Static roadmap brackets may differ from the personalized pick. The four previously listed duplicate Wiki readers are consolidated and replay-verified locally.
7. Before publishing: inspect latest main and reconcile Claude's concurrent work; preserve saves/IDs/unknown ownership; run every gate; then make a new version and release receipt. The owner requested the verified source changes on main. No version bump or portable release is included; runtime gates remain outstanding.
