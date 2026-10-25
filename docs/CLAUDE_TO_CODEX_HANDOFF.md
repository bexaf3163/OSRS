# Claude → Codex handoff (living document)

Read this first. Claude keeps this file current after every release. It says what Claude received from Codex, what Claude changed, which engine owns each concern, what is in progress and what is still open. The owner wants **one coherent product built on engines**: before changing anything, find the engine below that owns the concern and fix or extend that engine. Never add a parallel mechanism, a per-step patch or an old feature back.

## 1. Baseline received from Codex

- Codex delivered **2.74.3** (main `7ba9aeea`, tree `f5aa4d76`), described in [CLAUDE_NEXT_SESSION.md](CLAUDE_NEXT_SESSION.md). Codex's backlog is [CODEX_AUDIT_BACKLOG.md](CODEX_AUDIT_BACKLOG.md) (T01–T17). Its handoffs (`docs/CODEX_*_HANDOFF.md`) still describe the subsystems Codex built.
- Owner decision 2026-10-24: Claude owns the in-game tests ([CLAUDE_IN_GAME_ACCEPTANCE.md](CLAUDE_IN_GAME_ACCEPTANCE.md)).
- Claude released **2.74.4 → 2.77.0** on main. Current main at the time of writing: `a4c295a` (2.77.0). Every release has `release-notes/vX.md` and an entry in CLAUDE_NEXT_SESSION.md.

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
| What a drop or a minute is worth | `src/lib/lootValue.ts` (`coinsPerMinute` = cows-cowhide rate × net hide price, `dropValue`, `lootSecondsPerKill`) | `fundingMethods.json` |
| Combat estimate | `src/lib/combatEstimate.ts` (hit chance, attacks to kill, food, `SpotTerms`) | `combatFoes.json` ← `npm run build-combat-foes` |
| Combat training spots | `src/lib/combatRoute/spots.ts` (`spotsOf`, `bankTrip`, `termsFor`) | `scripts/trainers.defs.json` → `npm run build-trainers` → `trainers.json` (wiki LocLine spawns near a route step, named bank, always-drops) |
| Fight plan (route combat steps) | `combatRoute/plans.ts`, `pick.ts`, `selection.ts`; UI `CombatRoute.tsx` (verdict + ≤4 rows) | scoring: time × penalty + kills − loot/rate; `gainOver` margins |
| Skills page ranking | `trainingRouter.ts` (`personalize`, `compare`, `buildPath`, `adviseTraining`), `methodPick.ts` | `trainingMethods.json`. Combat methods get model rates from `combatRates.ts` (melee/ranged/magic + loot + arrow/rune cost). Sync test: every trainer spot has a Skills method and vice versa |
| Ranged arrows | `rangedAmmo.ts` (`rangedHit`, `arrowsForGoal`) | `rangedGear.json` |
| Travel | `travel.ts`, `travelInput.ts` (`networkUnlocked`), `detours.ts` (GE priority by place) | `transport.json` (`unlocks`, `oneTime` checked against the route by a test), `transportNet.json` |
| Item sources | `sourceRouter.ts` (`FREE_GIVERS` by NPC → `giverStepOf`) | majorLocations.json, f2p-items.json |
| Bank cleanup | `cleanup.ts` (`OBSOLETE.afterQuests` by game quest name) | test: every named quest is a route quest |
| Step rewards | `stepRewards.ts` (`rewardCoins`, `coinRewardAhead`) | check-data: reward numbers use comma thousands |
| Wiki reading for builders | `scripts/wiki.ts` (new in 2.78): one `wikitext()` fetch, `templates()`, `successCharts()`, `locLines()` | builders should migrate to it |
| In-game guidance | plugin: Quest Helper machines (`QhMachine`), `StepGuide`, one HUD | `questMachines.json`, `questStages.json` |

## 4. What Claude changed (2.74.4 → 2.77.0)

- **Quests, live fixes (2.74.4–2.74.16):** Melzar's Maze follows Quest Helper's rooms and keys. The lesser demon and Lost City are magic fights with required runes. Dragon Slayer S5-01 waits for all five questions, and S5-04…S5-07 follow game state. There is a death recovery path to Elvarg (volcano shortcut or hull repair). Stage 7 boss food is required where the game checks it. Only the nearest copy of a shared object ID is outlined. Every in-game card line is ≤225 characters. The free Anti-dragon shield comes from Duke Horacio.
- **App/UI minimalism (2.74.10–2.74.25):** one preparation panel; prerequisites named once; Skills is guide-first; the compact Bag/Now tabs say each thing once; Money details don't repeat.
- **Codex backlog items:** T01 profile conflicts and copy failures; T02 update cancel/retry, plus a real two-version update test; T03 members tool tiers on F2P; T05 owning the items meets acquisition steps; T06/T07 Demon Slayer in three phases; T09 FPS/overlay telemetry; T11 arrow counts; T12 GE buy-limit rounds; T15 plugin jar version gate; T16 advisories.
- **Skills content (2.74.18–2.74.21):** the wiki F2P training guides for every skill, "Other options", no outgrown methods.
- **T10, fight plan as one answer (2.74.23, 2.75.0):** trainer spot registry; per-spot bank trips; loot banked when it pays; quest-gated Brutus; one plan per spot; compact UI.
- **2.76.0:** the Skills combat methods are ranked by the same combat model for the character's levels and worn gear, with drops and arrow/rune costs. The Skills page and the fight plan agree, and the path under the card weighs every level the same way.
- **2.77.0, engine audit:** every step-code special case became a general rule (safety by hazard, GE priority by place, cleanup by quest name, free givers by NPC, fairy rings in transport data, coin tip by reward, plugin incantation hint by quest stage). Reward-number format was fixed and is now checked, and the guard test was added.

## 5. In progress (Claude, 2.78)

**One gathering/processing engine for the non-combat skills.** It works the same way as combat: the player's levels and best usable tool → success chance → actions per hour, then inventory, then drop vs bank (by `lootValue` rule) vs process on the spot, then XP/h and coins/h. Of all candidate spots, the best one wins: **the spot nearest a bank wins when that makes it faster or richer** (owner request).
- Facts come from the wiki through builders:
  - `{{Skilling success chart}}`: low/high per tool and resource, P(L) = (1 + floor(low·(99−L)/98 + high·(L−1)/98 + 0.5))/256, with cascades for multi-fish spots.
  - `{{Woodcutting info}}`, `{{Mining info}}`, `{{Fishing info}}`: level, XP, respawn.
  - Action lengths ("Game tick/Action lengths"): WC 4 ticks per roll; mining 8/7/6/5/5/4/3 ticks for bronze…rune pickaxes; fishing 6 ticks for net/cage/harpoon and 5 for bait/fly; cooking 4 ticks; firemaking 4 ticks; smelting and smithing 5 ticks.
  - The Woodcutting table gives tree despawn timers.
- Planned: `scripts/skilling.defs.json` → `scripts/build-skilling.ts` → `src/data/skilling.json` (resources, tools, spots per method with ObjectLocLine spawns, bank, count); `src/lib/skillingRates.ts`; a `methodRate` dispatcher shared with combat.
- Status: `scripts/wiki.ts` written, not committed yet. Nothing else of 2.78 exists yet.

## 6. Open (not done)

- T10: gear-upgrade variant (an upgrade's time saved vs its cost), food choice by cost per heal, and the static skill roadmap's "now" step that can differ from the personal pick (roadmap = wiki brackets in `skillGuide.ts`; the card = model).
- Skilling engine (section 5), then the processing skills on it (Cooking, Firemaking, Smithing, Crafting, Runecraft, Prayer, Magic utility).
- Musa Point banking by boat and deposit box is not modelled; such spots are drop-only until it is added as data.
- Older builders (`build-combat-foes`, `build-ranged-gear`, `build-style-gear`, `build-trainers`) each still have their own `wikitext()`. Move them to `scripts/wiki.ts`.
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
