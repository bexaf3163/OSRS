# OSRS Path — Clear Path redesign handoff

Read this before modifying desktop presentation, RuneLite overlays, or packaging. It supplements `PROJECT_GUIDELINES.md`; it does not replace the existing architecture or the user's current instructions.

## Accepted scope and baseline

The user selected **Clear Path**. Preserve existing functionality and closely follow the visual references. The user explicitly declined adding the illustrative Loadouts, Comparison, and Price tracking features. Do not create placeholder pages, dead controls, or new engines to reproduce those incidental mock labels.

The released redesign baseline is **2.48.3**, commit `ec9586f420e1b1269aaee42dad5efbb464f7f2c5`, following `21b1db6824ef2769e0c27ab58174e01e7fdb489b`. Start future work from current GitHub `main`, preserving any later commits. An older local checkout may contain an earlier, staged design candidate: do not force-push it over newer work, reset someone else's files, or restore old CSS over the redesign. Merge concurrent work deliberately.

Reference board names supplied to the user:

1. `01-desktop-clear-path.png` — desktop navigation, route rail, action hero, walkthrough/preparation/reward columns.
2. `02-runelite-overlay-states.png` — compact/expanded guidance, critical warnings, bank and exchange overlays.
3. `03-secondary-workspaces.png` — Skills, Gear, Shopping, Journal.
4. `04-adaptive-and-utilities.png` — Settings, Search, compact and light views.

The illustrations contain example quest data and condensed instructions. Keep canonical route data, exact quantities, unknown states, rewards, and full instructions from the project. Do not replace real data with mock values to match a picture. Do not claim literal pixel equality without matching viewport, font settings, theme, and state.

## What was implemented

| Area | Implementation and preserved access |
| --- | --- |
| App frame | Gold compass and OSRS Path identity; game mode and quest points on the left; six stacked icon/label sections; bridge state, search, settings on the right. Mode selection uses the existing store. |
| Path | Route rail, action hero, embedded readiness/actions, then Steps / Preparation / Travel / Details. Steps contains the canonical numbered overview and preparation/reward side column. Full walkthrough, dialogue, critical warnings and explicit manual completion remain available. |
| Compact Path | Current action, preparation items and an expandable Instruction and completion section. Full workspace restores all four views. Existing recovery and critical warnings must remain visible. |
| Skills | Shared skill sidebar, actual skill glyphs, level-to-goal heading, four existing views, method/location cards, Calm/Efficient controls, connected roadmap milestones. Level editing, live XP and route links remain accessible. |
| Gear | Six slots with local item artwork or empty silhouettes; improvements and future unlocks; Combat details is an expandable section also opened by the sidebar. Known equipment and last-known snapshots remain distinct. |
| Shopping | Existing stage range/unfinished controls, ownership filters, table, and budget/copy/sync summary below it. UNKNOWN items are unverified, not confirmed purchases. |
| Journal | Existing Quests / Stage goals / Session views and old route aliases. Selected quest preview, requirements disclosure, and View route. Availability comes from route dependencies, not inventory readiness. |
| Reference | Existing grouped content and sections, with matching sidebar navigation. All guides and plugin filters remain accessible. |
| Settings | Appearance / RuneLite / Progress and copies / App sidebar. Theme, density, view, font controls and live preview; advanced panel style, window behavior and interface zoom remain in a disclosure. Profiles, import/export/reset, backups, account sync, diagnostics and updates are preserved. |
| Search | Heading, large input, existing grouped results, item/generic glyphs, clear action, keyboard navigation and Escape. Item inspection and Wiki search use the original systems. |
| Native overlays | Stronger gold current action, quest marker, collapse chevron, document/speech tab glyphs, blue/gray Glass palette. Critical HUD messages have a prominent red band; their existing conditions and full text are retained. |

## File map

- `src/App.tsx`, `src/components/CompassMark.tsx`, `HeaderProgress.tsx`, `ModeToggle.tsx`, `Icons.tsx`: header identity, navigation and existing mode controls.
- `src/components/SectionShell.tsx`: presentation-only sidebar for existing section routes/anchors; `SkillGlyph` uses bundled RuneLite icons.
- `src/clear-path.css`: the final geometry and palette layer. It is imported **after** `src/styles.css` in `src/main.tsx`. Keep this import order and inspect cascade specificity before adding overrides.
- `src/components/StepWorkspace.tsx`: current action and the four step views. Do not repeat the old large readiness bar below the hero.
- `src/components/StepCard.tsx`, `QuestOverview.tsx`, `QuestPreparation.tsx`, `StepStatus.tsx`: original step content arranged into those views; compact/manual completion access.
- `src/pages/SkillDetail.tsx`, `src/components/TrainingCard.tsx`: skill views and cards; calculations stay in existing training/skill engines.
- `src/pages/Gear.tsx`, `Shopping.tsx`, `Quests.tsx`, `Settings.tsx`: their original functions with the new workspace presentation.
- `src/components/SearchBox.tsx`, `WikiDrawer.tsx`, `src/data/iconAssets.json`: search and cached artwork resolution. A failed icon source must not prevent a subsequent source from loading.
- `public/item-icons`, `public/skill-icons`, `public/fonts`: bundled artwork and Inter variable font. Keep source mapping and license notices in `THIRD_PARTY_NOTICES.md`, the RuneLite BSD notice, and Inter's OFL file.
- `runelite-bridge/.../OsrsPathGuideOverlay.java`, `OsrsPathHudOverlay.java`, `OverlayCard.java`, `OverlayAlert.java`: native presentation. Existing protocol, guide selection, hit regions, navigation, safety and supported font choices are preserved.
- `runelite-bridge/.../OverlayLayoutTest.java`: native bounds tests and exported Classic/Glass render examples.
- `electron/main.cjs`, `scripts/e2e-electron.ts`: development-only isolated desktop checks. Test profiles/home and fake bridge ports must never use the player's real profiles or live plugin.
- `scripts/ui-smoke.ts`: production browser interaction, presentation and width checks.
- `.github/workflows/release.yml`: builds portable EXE, checks the real Electron shell before publication, and serializes release jobs.

## Follow-up findings from the live desktop audit

The actual Windows app 2.48.3 and installed RuneLite client were opened and inspected. The bridge plugin connected with protocol 6. Main desktop workspaces, skill overview/calculator, Journal views, Search, Path's four views, shopping summary, gear fold and settings were navigated without marking quests, changing levels, purchasing, or controlling the character.

Corrections made after that inspection:

- The 130px label/control grid is scoped to **Appearance**. Applying it to every Settings block squeezed RuneLite launch/remove-hints buttons into tall, narrow columns. RuneLite actions and explanatory checks retain their natural full rows. Density controls align with other appearance controls; plain-text profile inputs use the theme's existing form styling.
- A connected client at its login screen does not mean live guidance. `targetStatus` accepts the current `inGame` signal; the action hero, step verdict, overview, Travel hints and navigation badges use it. Saved targets and resend/clear actions remain available. Settings explains that guidance resumes when the character logs in. No bridge transport or state engine was replaced.
- Gear distinguishes a connected client waiting for character data from a disconnected client. No unknown item, equipment, XP or bank data becomes zero or missing.
- The current route code cannot wrap at the hyphen. Sticky sidebars/previews account for the larger, wrapped header when text exceeds 120%.

### Live world inspection — 2026-10-13

The user explicitly authorized selecting World 316 and pressing Play with the saved session, without entering credentials. RuneLite was launched through **OSRS Path's Launch RuneLite with the bridge** action. It was not launched separately through Jagex Launcher. The saved-session Play Now and welcome-screen Play actions successfully opened the world.

The installed portable app was updated from 2.48.3 to **2.48.4 through Settings → App**, then RuneLite was closed and relaunched through the app. Settings confirmed app 2.48.4 / plugin 2.48.4 / protocol 6 compatibility and the character being in the game. Existing profile, route and preferences survived the update. World 316 was selected again because the newly launched client initially chose a different world.

Observed live:

- The Glass quest guide rendered its quest marker/name, stage metadata, progress bar, large gold action, blue distance line and Steps/Advice controls legibly. The current example was Below Ice Mountain, stage 7 of 8, with the Ancient Guardian / four pillars action.
- Steps and Advice could be selected. After expanding the list, Advice displayed the detail and preparation advice, including the do-not-take-now item. Returning to Steps worked.
- The header chevron collapsed the guide to its quest header and expanded it again. The micro HUD appeared while the guide was collapsed. Compact reveal state reset after the app/client restart; the configured Glass style and overlay position survived.
- At the observed approximately 1678 × 1068 game window, the guide remained at the player's existing left-side position, clear of the central character, minimap and bottom game controls. Its expanded list remained above the bottom controls. No forced position reset or global default change was justified by this view.
- The cyan arrow and distance were visible. Their visible presence is confirmed; actual travel/path correctness was not tested by moving the character.
- Desktop connection/profile indicators responded to login. Closing the client returned the desktop to offline/saved guidance and unverified preparation items; reconnecting restored live inventory readiness. This validates the 2.48.4 waiting-versus-live fix in the installed app.

No character movement, combat, purchases, skilling, quest marking, bank opening or exchange interaction was performed. Alt-drag was not exercised. Bank/exchange/critical-warning cases remain fixture-tested acceptance scenarios, not live-world passes. Do not claim literal pixel equality or complete live functional coverage from this inspection.

### Priority finding: quest instruction versus navigation target

The live check exposed a remaining semantic mismatch, reproduced after restarting both the app and plugin on 2.48.4: the native guide said **Defeat the Ancient Guardian or mine 4 pillars**, while the desktop hero and overview marked **Talk to Willow (south of Ice Mountain)** as the current instruction/in-game line.

The source explains why these can differ: `useSubStep` in `SubStepHero.tsx` resolves only `findSubStep(step, navTarget)`. `findSubStep` matches the navigation label/tile to canonical walkthrough lines. Native `refreshGuide()` instead uses the quest value and `stageTracker.cursor()` when building `StepGuide.View`. The `/status` response exposes `navTarget`, but does not expose that current quest cursor. Temporary navigation is intentionally independent of the quest cursor, and `followStage()` preserves the player's selected destination while the stage is unchanged.

**Recommended focused follow-up:** expose a validated, optional current quest-instruction identity from the existing plugin guide/cursor through the existing bridge status, and let the desktop resolve that identity against canonical stage data. Keep the navigation target separate and clearly labelled. Do not infer quest completion from a tile, clear the player's destination merely to make headings agree, introduce a second quest engine, or replace quest data with display text. Gate current instruction on in-game state and matching active step; handle completed quests, previous-step inspection, old plugins, missing/invalid identity and late status replies. Add a regression with a later quest stage plus a navigation target at the first NPC, as well as logged-out and completed cases. This follow-up was identified, **not implemented in 2.48.4**.

## Invariants to retain

1. Reuse `playerState → readinessEngine → preparationPlan → UI consumers`. Do not put independent readiness logic into JSX or Java renderer classes.
2. Preserve `PRESENT | MISSING | UNKNOWN`. Offline, logged-out, stale or unseen bank data stays unknown. A saved navigation target is not a visible live arrow.
3. An initial quest NPC/location must not replace the current later sub-step. The hero uses the existing sub-step resolver; last-known/live status must be stated accurately.
4. Keep canonical quest instructions, completion triggers, safety warnings, preparation timings, quantities, costs, route alternatives, and recovery behavior. Never infer new coordinates from decorative mockups.
5. Preserve all profile/progress/manual-ownership settings and route aliases. Presentation changes are not data migrations.
6. Preserve Glass/Classic, light/dark/system theme, 90–150% text, interface zoom, density, compact mode, always-on-top and RuneLite font choices.
7. Keep the current bridge protocol and local transport. Native selection/resend/clear actions configure hints; they must not automate movement, combat, purchases, eating or skilling.
8. Keep native critical warnings visible even when the guide is collapsed or Smart reveal is enabled. Alt-drag positions and existing overlay configuration should survive updates.
9. Leave all user-facing UI, comments, release notes and project documentation in English with canonical OSRS names.

## Verification and release workflow

Before completion, run the checks required by `PROJECT_GUIDELINES.md`: build, unit tests, data consistency and Gradle testClasses; run full Java tests for plugin logic/rendering changes. Run `npm run test:ui` for presentation/interaction changes and `npm run test:e2e` where a real Electron process can start.

The 2.48.3 baseline passed 893 TypeScript tests, 444 Java tests, production browser scenarios at 390/1280px and header checks from 320–1920px with 100%/150% text. GitHub Windows additionally verified local font loading, six workspaces, bridge connection, character profiles and atomic progress persistence. Local sandbox failure to start Electron was reported honestly and the real shell check ran in GitHub before release.

For visual acceptance, check both themes, 100%/150% text, wide and narrow viewports, compact/full transitions, offline/connecting/waiting-character/in-game states, readiness unknown/ready/missing, and critical/recovery states. Inspect actual screenshots, not just test counts. Check that long labels do not hide controls, step codes do not split, and sticky panels remain below the header.

For native acceptance after authorized login, inspect compact/expanded Steps and Advice, collapse/expand, Alt-drag positioning, bank checklist, exchange checklist, critical warning, distance and world marker. Use fixtures for cases that would require risky gameplay; clearly identify those as simulated rather than live. Restore any temporary configuration changes. The live record above is the actual coverage, not a blanket pass for this checklist.

Before pushing, re-read remote `main` and preserve later changes. Update `package.json`, the root and package entries in `package-lock.json`, the plugin version and release notes consistently. Never force the branch back to the baseline.

A release is finished only after GitHub Checks and Release succeed, its tag targets the intended commit, the portable asset exists and its downloaded SHA-256 matches the asset digest. Update an existing portable installation beside its existing `OSRS-Put-data`, or use Settings → App. Running an EXE from a different folder can create a separate data directory.

## Remaining work, not new promised features

- Resolve the confirmed current quest-instruction / navigation-target mismatch described above.
- Alt-drag and live bank/exchange/critical states were not exercised; use safe fixtures or an explicitly authorized suitable live scenario.
- Use screenshot evidence to make small spacing/position corrections if needed; avoid another broad redesign.
- No new Loadouts, Comparison, or Price tracking engine is part of this redesign scope.
