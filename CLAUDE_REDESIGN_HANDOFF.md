# OSRS Path — Modern Path redesign handoff

Read this before modifying desktop presentation, RuneLite overlays, or packaging. It supplements `PROJECT_GUIDELINES.md`; it does not replace the existing architecture or the user's current instructions.

## Accepted scope and baseline

The user initially selected **Clear Path**, then on 2026-10-13 explicitly selected the **Modern dark** preview to reduce clutter. The current released implementation is **2.48.8**, following the 2.48.5 Modern Path evolution below. Preserve existing functionality and closely follow the accepted reference `docs/design-preview/modern-dark.png`. Do not restore the dense 2.48.3/2.48.4 layout over it. The user explicitly declined adding the illustrative Loadouts, Comparison, and Price tracking features. Do not create placeholder pages, dead controls, or new engines to reproduce those incidental mock labels.

## Review fixes — 2.48.9

An independent review of 2.48.3–2.48.8 (code, built app at 390–1440 px in both themes, live World 316 guide) found and fixed:

- The desktop "What to do now" read the quest cursor only from `/status`, requested at login/reconnect: it froze on the line seen at login and showed "Starting point" on the next quest. `BridgeServer.setQuestInstruction` now broadcasts the existing STATUS event when the cursor changes (the app already re-reads `/status` on STATUS). Protocol 6 is unchanged.
- `.section-nav-item` kept `width:100%` from the sidebar era, so every local section strip showed only its first link above 700 px. `.tabs-top` kept `order:3` from the old header below 1200 px and at large text, which put the sections under Settings in the sidebar. Both are reset in `modern-path.css`. When relocating an element, check the old rules that still match its class.
- The open guide drew a warning twice (the alert rows are set in another size than the list's own rows, so `rows.contains` never matched) and repeated the action as a "Details:" row. `OsrsPathGuideOverlay.sameAlert` / `repeatsAction`.
- The " or " split is one rule on both sides (`GuideList.alternativeAt`, `alternativeAt` in `src/lib/subStep.ts`): no split inside a bracket or after a colon.
- `QuestOverview` scrolls its own list to the current line.

`scripts/ui-smoke.ts` now checks strip links in view, the sidebar order at every width and text size, and that the action moves with the cursor on a STATUS event. Not changed, known: the open guide can cover the chat buttons when its list is long; the header is 156px tall at large text; two distances are shown in an instance (Death's Office).

## Modern guide typography — 2.48.8

The user rejected the inconsistent game-guide fonts after the 2.48.7 native inspection. Glass guide text now uses the desktop's bundled **Inter**, loaded once by `GuideFont`. `runelite-bridge/build.gradle` copies `public/fonts/Inter-variable.ttf` and its OFL license into the plugin's `com/osrspath/bridge/fonts` resources. No OS font installation, external font fetch or settings/profile migration occurs. Classic mode still uses the selected RuneLite font; the guide's large-text scale remains available.

The modern guide has a consistent 14px regular / 13px metadata / 16px bold action hierarchy at normal scale. Action sizes are rounded through one helper shared by layout and painting. `RowComponent` paints the ready-made canonical rows directly, avoiding RuneLite `LineComponent`'s game shadow. A graphics copy scopes antialiasing/fractional-metrics settings to the guide; it does not change the game's renderer. Guide tooltips and the Glass arrow label use the same typeface. Other RuneLite/game interfaces are not reskinned.

Inter covers the warning/check/direction symbols but lacks some advice glyphs (for example the lightning bolt). `GuideFont.metrics` and `GuideFont.draw` therefore use the local Dialog fallback only for the unsupported code point, never for the surrounding sentence. Their advances agree; metrics are cached by font and render context. Missing font resources degrade safely, while tests assert that the packaged resource actually loads as Inter so an unnoticed packaging fallback cannot pass.

Click-to-expand behavior, hit regions, the saved resized width/position, canonical instructions, recovery/critical alerts, readiness, navigation, protocol and the confirmed desktop quest cursor are unchanged. `GuideFontTest` guards font packaging, integer sizing/scaling and fallback advances. Native layout tests additionally draw Inter at standard/narrow widths and normal/large sizes. `ModernGuideTest`'s exports now use the actual bundled Inter.

Local verification: production build, data consistency (zero errors/warnings), and all 895 TypeScript tests passed. The first full Java run exercised 450 tests; its only failure was the font-boundary suite using a different text-antialiasing context for measuring versus painting. The harness now uses the runtime's antialiasing and glyph-aware metrics. The final relevant 12 tests (all eight native layout tests plus the font and modern-guide tests) passed; testClasses/jar passed. The other Java tests were unaffected and passed in the full run. Native compact/expanded Inter renders were visually inspected. Keep measurement and painting render contexts aligned; do not hide clipping by changing assertions or clipping away text.

## Modern expandable RuneLite guide — 2.48.7

The user approved combining the compact/expanded modern addon preview into one clickable card. `OsrsPathGuideOverlay` now uses the existing `GuideList` rows and hit regions with a presentation-only `GuideDisclosure`: Steps/Advice open details, selecting the same tab closes them, switching tabs stays open, and changing route-step identity resets the disclosure. Hover no longer changes the card's height. Existing full-list/docked behavior, global header collapse, fonts, font scale and saved placement remain supported.

The default guide width is 300px; an explicitly resized width still wins. Glass guide rendering uses `OverlayCard.paintGuide`, a flat charcoal surface with a minimum alpha of 235/255 and restrained border, without changing other cards' Glass rendering. The current canonical instruction is light text; alternative clauses are muted. Stage and distance share header metadata; quest position uses a segmented bar. This bar represents the stage position, not inventory-readiness percentage or inferred completion of the current stage. No canonical instructions, requirements or progression values are invented for the mock.

Warnings and recovery alerts survive closed details, the Advice view and the header-only collapse. Noncritical detours are excluded from the closed card and remain available in the existing expanded controls/Advice. Manual next/back/resume, temporary place/transport navigation, bag/item states, and tooltip details reuse the original systems. Empty Advice has an explicit message. `GuideMouse` continues consuming card press/release/click events and respecting Alt-drag, menu, bank/widget and world-map precedence.

While the Glass guide is actually on screen, the directional marker uses 65% of its configured diameter and omits duplicate same-level distance; floor/underground and Nearby feedback are retained. With the guide hidden, the standalone marker retains its configured diameter and distance. The normal navigation accent is periwinkle; approaching/arrival/layer warning colors remain semantic. No movement, clicking into the world, purchases, item use or quest marking is added.

The native rendering previews `docs/design-preview/runelite-modern-{compact,expanded}-2.48.7.png` are exported by `ModernGuideTest` from the actual Java2D implementation with fictional data. They are not account screenshots. `GuideDisclosureTest` checks click transitions/reset; `ModernGuideTest` checks canonical requirement/warning retention and one distance/tab row across disclosure states. The broader native layout suite checks the existing quest/item/place texts with supported fonts, large text and narrow widths.

Local final verification for 2.48.7: production build and data consistency passed (zero errors/warnings), all 895 TypeScript tests passed, and Gradle testClasses/test/jar passed with **448 tests across 56 suites**, zero failures/errors/skips. Native rendered compact/expanded previews were visually inspected. The full layout suite passed supported fonts, normal/large text, standard/narrow widths and existing hover/collapse scenarios.

Final release verification: GitHub Checks `38429485499` and Release `38429485452` succeeded. Tag `v2.48.7` targets `90bfa22f8140d362f3242a6d1a323e10e24a1649`. The portable EXE is 101435661 bytes; the downloaded SHA-256 matches `f7ecae9e0b8f117fe1bc012364d9a5c230622aee8f068793b5153e8eb3ca327a`. The real isolated Windows Electron run verified bundled Inter, all six workspaces, bridge/profile display, diagnostics and atomic progress persistence without console errors.

The existing installation was updated through Settings → App to **2.48.7**. Its route selection, 39/46 quest points and dark desktop were preserved. RuneLite was automatically launched through OSRS Path, World 316 selected and the saved Play actions used without credentials. **Live native acceptance:** the modern compact guide appeared at the saved position and saved resized width; clicking Steps expanded downward, clicking Advice switched to the existing two tips, and clicking Advice again returned to the compact state. The player's position did not change from these UI clicks. The smaller periwinkle arrow was visible without duplicate distance below it. Both desktop and guide continued to show the Ancient Guardian / four pillars (Mining 10) instruction at stage 7 of 8. The guide was left compact. No progress marks, movement, purchases, combat or inventory actions were automated. Live critical/recovery/bank/GE states and Alt-drag were not exercised; their rendering/retention was checked with fixtures/native tests.

Desktop presentation, the 2.48.5 quest cursor/status identity, protocol 6, route data, readiness and existing profile/settings files are unchanged. Version strings in package/lock/plugin are synchronized to 2.48.7. The 2.48.6 live/release evidence below is historical; use the 2.48.7 release and native click record above for the current addon.

## Modern Path evolution — 2.48.5

- `src/modern-path.css` is imported **after both** `styles.css` and `clear-path.css`. It provides the charcoal/periwinkle palette, restrained surfaces and responsive desktop shell. Light/system, Classic, font scaling and compact view remain supported; no profile/settings migration occurs.
- `App.tsx` places the existing six section links and mode picker in a sidebar, with quest points and Settings below. Connection, Search and existing utility actions stay in the header. Below 1000px the existing bottom navigation and mobile header remain available. Compact Path retains its established presentation.
- `PathWide.tsx` portals a concise route summary into the sidebar. **All stages** opens the existing `RouteDrawer` with the full canonical rail, stage expansion and step selection. No route state or dependency engine is duplicated. The previous/next controls and Wiki pin/drawer behavior remain accessible.
- (2.50.0: replaced by `CockpitWorkspace.tsx`; this paragraph is the 2.48 state) `ModernStepWorkspace.tsx` presents the action prominently and keeps Preparation / Steps / Travel / Details collapsed initially. Selecting a view opens its original `StepBody`; selecting again closes it. Keyboard navigation is supported. Manual completion, remove/skip marks and full walkthrough/dialogue remain in Steps. Recovery and critical step warnings stay outside collapsed views.
- Other pages reuse their existing controls; their section navigation is a horizontal local strip instead of a second permanent sidebar. Shopping switches to labelled rows when its **available container width**, rather than screen width, is too narrow for the table.
- The confirmed quest cursor is now an optional `questInstruction` identity on the **existing `/status`** endpoint: `{ stepId, stageAt, lineIndex, peeking }`. The plugin forwards its existing `StepGuide.StageView` / stage-tracker selection; it does not create a new quest engine. Completed, logged-out, empty or mismatched selections return no identity. Protocol 6 remains compatible with older consumers/plugins.
- The desktop validates that identity and resolves it against canonical quest-stage data. The current action, canonical overview and suggested NPC use it independently of a temporary navigation destination. Old plugins fall back to the prior navigation resolver with the explicit **Navigation target** caption rather than pretending that target proves current quest progress. Latest status requests supersede older delayed replies.
- The native overlay appearance itself retains the previously audited Clear Path style. This version's Java change concerns reporting the existing cursor, not game automation or a second overlay redesign.

The original Clear Path implementation/audit below is historical context. Its named files and data invariants still apply where this evolution does not supersede presentation. The 2.48.4 World 316 inspection is historical evidence; it is not a claim that the 2.48.5 cursor reporting has already been exercised in the live account.

Local 2.48.5 verification: production build, data consistency (zero errors/warnings), 895 TypeScript tests and 445 Java tests passed; final Gradle testClasses/jar passed. Production UI scenarios passed, including all 94 routes at 390/1280px, header widths 320–1920px at 100%/150% text, collapsed initial views, canonical later instruction versus earlier navigation, manual completion, keyboard disclosure navigation, logged-out guidance and existing preparation/profile/shopping flows. Dedicated captures inspected the new Path at 1440/390px and at 1000px with 150% text.

GitHub Checks `38416232751` and Release `38416232994` succeeded for 2.48.5, including the real isolated Electron shell, six workspaces, bundled font, bridge/profile display and atomic progress persistence. The release tag targets `96f58b1f82fca1691f323614ca00244f42853984`. The downloaded portable asset is 101433241 bytes and matches SHA-256 `329c7b2b22b753fc11ba6af5b9f65e6852bbe2931ea7ed2ce548b58bf20d4dd2`.

The installed Windows app was then updated through Settings → App to 2.48.5. Its existing profile and route survived. RuneLite was restarted through the application's automatic launch, World 316 was selected and the saved-session Play actions opened the world without credentials. **Live confirmation:** the native guide and the desktop hero both displayed the Ancient Guardian / four pillars instruction and stage 7 of 8. The former Willow/current-instruction mismatch no longer reproduced. No character movement, quest marking, purchases or combat were automated.

### Sidebar refinement — 2.48.6

The installed Electron inspection exposed a horizontal scrollbar inside the sidebar, although the document itself did not overflow. The old top-navigation `margin-left: 12px` still applied to the relocated navigation. Version 2.48.6 explicitly resets that margin and permits brand wrapping at increased text sizes. UI checks now measure the **sidebar's own** scrollWidth/clientWidth at desktop widths with 100%/150% text; checking only document overflow misses this defect. No quest-cursor logic changed after the live 2.48.5 check.

The 2.48.6 production build, data consistency, 895 TypeScript tests and Gradle testClasses/jar passed. Its full production UI run passed, including the additional internal sidebar bounds checks at 1000–1920px with 100%/150% text. The earlier 445-test Java pass covers the unchanged cursor logic; the only subsequent Java change is the synchronized plugin version string.

Final 2.48.6 release verification: GitHub Checks `38421760082` and Release `38421759969` succeeded, including the real isolated Windows Electron check. Tag `v2.48.6` targets `5c380f7137ff2ca12cb18ab7cae9e46aa9179dbc`. The downloaded portable asset is 101433509 bytes and matches SHA-256 `21f48547d6c68b22123bbe509119bbfbf0a9b6db6e00c92c8e98e0901f2fafab`.

The existing installation was then updated through Settings → App to **2.48.6**. The actual installed window confirmed that the sidebar's horizontal scrollbar is gone, Dark theme is selected, and the existing 39/46 quest points and S3-04 route selection survived. RuneLite launched automatically through OSRS Path; World 316 and saved-session Play were used again. Both the game guide and desktop showed the Ancient Guardian / four pillars instruction at stage 7 of 8. Detailed views were left collapsed. No movement, marking, combat or purchases were performed. Live bank/GE/critical states and Alt-drag remain outside this inspection's coverage.

The public screenshot `docs/design-preview/modern-implemented-2.48.6.png` is a capture of the compiled UI with fictional QA fixtures, not the player's account screenshot.

### Historical Clear Path baseline

The original released redesign baseline was **2.48.3**, commit `ec9586f420e1b1269aaee42dad5efbb464f7f2c5`, following `21b1db6824ef2769e0c27ab58174e01e7fdb489b`. Start future work from current GitHub `main`, preserving any later commits. An older local checkout may contain an earlier, staged design candidate: do not force-push it over newer work, reset someone else's files, or restore old CSS over the redesign. Merge concurrent work deliberately.

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

- The current quest-instruction / navigation-target mismatch is addressed by 2.48.5's validated cursor identity and was confirmed in the live World 316 inspection. Keep testing updated app/plugin pairs; an already running old plugin does not gain the identity field until restarted.
- Alt-drag and live bank/exchange/critical states were not exercised; use safe fixtures or an explicitly authorized suitable live scenario.
- Use screenshot evidence to make small spacing/position corrections if needed; avoid another broad redesign.
- No new Loadouts, Comparison, or Price tracking engine is part of this redesign scope.

## Path layout and walkthrough fallback — 2.49.0

Asked for by the owner after 2.48.9 ("inconvenient, a lot of empty space"; "the addon shows nothing in the game on Shield of Arrav").

- `ModernStepWorkspace` is tabs, not disclosures: Steps is selected from the start. On a wide column (58rem and up, measured on the parent, so large text and a pinned dossier count) `QuestPreparation` stands in `.modern-rail` beside the action and `StepBody` gets `noAside`; narrower, the list stays inside Steps. The rail is drawn only when it has something to say.
- `QuestPreparation` returns null when there is nothing to bring and no reward; the walkthrough panel is not drawn empty; a step without stage data shows `quickSteps` open (`.quest-quick`).
- Preparation tab: `OneTripCard plain` (no chip copy), `ReadinessPanel bare` (drops only the UNKNOWN heading, named problems keep theirs), `StepStatus headline` drops the offline "target saved" note that the current action already shows.
- The overview list box ends at the window bottom (`max(17.5rem, 100dvh - 44rem)`) and `QuestOverview` puts the current line at its top.
- Plugin: `ActiveTarget.prepare()` builds `Stage.manual(guide.steps)` for a QUEST_COMPLETED step that arrives without stage data (only S3-05 today). `stageValue` is 0 for it, the cursor moves only with "done" (`StageTracker.needsManualStep`), the reached line is saved in config key `walk.<stepId>` and restored once per session. No quest instruction is announced for it. Nothing in the protocol changed.
- `steps.json` S3-05: 18 short lines instead of 5 paragraphs (two were over 500 characters and never reached the game). `stepGuide` sends up to 40 quick-path lines (was 15 and the last).
- Regression review of 2.48.3–2.48.9 against 2.48.2: no component or screen removed, guide/HUD visibility rules unchanged, data unchanged apart from `iconAssets.json`.

Not done: map points and highlights for the Shield of Arrav lines (needs Quest Helper data for both gangs), the desktop does not follow the hand-advanced line.


## Cockpit and Companion strip — 2.50.0

Asked for by the owner after 2.49.0 ("I don't like the design of the program and how it gives information"); chosen from five mockups: Cockpit for the big window, Companion strip as the compact mode. Presentation only: the readiness engine, navigation actions, bridge and plugin rules are the existing ones.

- `CockpitWorkspace` (`PathWide`) replaces the tab workspace: one screen, three columns on a wide window (action + walkthrough | verdict + stage list | Where + reward), two on a medium one, one on a narrow one. Preparation, Travel and Details are `StepDrawer` panels (buttons, or P / T / D keys; Esc closes). `ModernStepWorkspace` is deleted.
- `CompanionStrip` (`PathCompact`): four tabs Now / Bag / Route / More on the same step state; "Full workspace" goes back.
- `lib/stageScope.ts` + `useStageScope`: when the game confirms the quest line, items the quest used up in earlier stages are folded away ("Used earlier in this quest"), not listed as Missing, and the verdict and percent follow. The stage-unaware engine is untouched; the scope is applied in the presentation layer. An item no stage lists stays until past the last stage with an `items` list (Beer at stage 15 is bought inside a line).
- `ShowInGame` is the one primary button (the live line's own target when confirmed, otherwise the step's); `StepStatus noStart` drops the redundant "Start the step" button.
- `ui-smoke`: step views are found through the cockpit's "Step views" buttons or the strip's tabs (`reveal`, `stepButton`); a dialog's own button wins over the page's duplicate; the action-width check is 420 px at three columns (was 500 px for the single column); new strip scenario.
- Not done: always-on-top / auto window size for the compact mode; the Where card still uses `StepMap` (map tiles need the network).

## First-hour polish and the route audit — 2.50.1 to 2.51.0

- 2.50.1-2.50.3 (owner: "the design is empty and not beautiful", "a perfect version for a new player"): `Welcome` card until the first mark; `StepDone` ("Done — next: <title>") under the current action replaces the quiet manual-complete line; `quiet` verdicts (no "Ready" box when there is nothing to check, no "not everything is checked" while offline); no Where card without a map target; offline note is a quiet line with a setup link and the supply list says "Bring" (`QuestSupplies` reads the link state); Journal has one set of tabs; Settings folds play style and helpers under `details.settings-advanced`; Reference is out of the menu but its routes stay (steps link to them); the Skills list is a side rail at 1400 px and up, wrapped rows below; light theme `--muted` and `--gold-ink` darker for contrast; in the game the tab strip hides "Advice · 0" (`GuideList.tabRow`).
- 2.51.0: the unpushed route audit branch (`route/audit-2.49`, route data, goals, carryover, loadouts, Bond branch, Members gaps) merged onto the cockpit. Conflicts were resolved in favour of the cockpit for `StepWorkspace` (the tab workspace is gone) and the route notes (`RewardChoice`, `CarryNote`, `LoadoutsCard`) were wired into `StepCard`. S3-04 stage 15 now lists Beer so `stageScope` folds it away afterwards; `tests/stageScope.test.ts` and two UI checks follow the reworked data (stage 35 lists a pickaxe and Trout).
- A scripted visual audit (screenshot matrix at 390 / 768 / 1100 / 1440 / 1900, dark and light, new player and connected player, with heuristics for overflow, clipped text, tiny text, contrast, unnamed controls) lived in the session scratchpad, not in the repo. Its findings are the list above.

## Transport audit — 2.52.0

Asked for by the owner: the transport system "does not perform its intended role in the actual game". Full record, live/simulated split and evidence list: `docs/transport-audit-2.52.md`. Summary of what now holds:

- One decision per shown step: `src/lib/liveTransport.ts` (`decideTransport`, `publishTransport`). `PrepSync` computes it (poll, teleport landing, `transportKey` change of the bag/bank things, target change), the plan payload carries it to the game, and `TravelTip` shows the same words. Do not add a second computation for the app.
- The objective is `transportTarget`: the plugin's confirmed, non-peeking quest line, otherwise the step's place. A temporary arrow (shop, bank, transport stop) is never the objective.
- Planner additions in `travel.ts`: `NeedItem` (need / bag / bank, null = unknown), `prepareFor` and the `-prepare` options (withdraw when the bank is known to hold enough, otherwise `sourceOf` = the source router via `transportSources`), `overheadTiles` (Home Teleport cast), `isOverworld` cut-off, F2P without tablets, spellbook lock. `transport.ts`: `state` ready / check / prepare, `summary`, `prepare`, `judgeTransport` (verdict per candidate), journey = walk + overhead + 20 s per stop.
- The bank counts of transport things come from the step's watch list (`transportWatch`, cap `WATCH_MAX` 64 = `ActiveTarget.MAX_LIST`). Without them "withdraw" is never said.
- Plugin: the closed compact card shows exactly one travel line above the tabs (`GuideList.travelRow`: transport, else detour), amber for `prepare`; a click frames the item or points the arrow at the stop (`RecommendedTransport.navTarget`). `/status` adds `homeTeleportKnown` and `spellbook` (varbit 4070). A step change clears a navigation target that belongs to the previous step (`navOutdatedFor`). A rebuilt card is measured by `dryRun` before its background is painted (RuneLite's panel returns its previous pass's size).
- Developer diagnostics only behind `localStorage['osrs-put:debug-transport'] = '1'` (console line on change, `window.__osrsPathTransport`). Keep it out of the player UI and the support report.
- Tests: `tests/transportLive.test.ts` (the eleven scenarios that can be simulated), `TransportChipTest`, `DetourRowTest`, `ModernGuideTest` (renders `build/overlay-render/modern-travel-*.png`).
- Live-test notes: start RuneLite only through the app; a Chronicle teleport spends a charge (do not use it for tests); the Home Teleport is free. If the external monitor drops, 117 HD stops presenting (white canvas): switch it off for the test and back on. A Windows "input experience" window can hold focus after RuneLite starts and block automated clicks; it needs one real click on the game window.

## Travel supplies — 2.53.0

Asked for by the owner: stock up before a long run (cards for the Chronicle, runes for the spells), a staff instead of its runes. Record and live/simulated split: `docs/travel-supplies-2.53.md`.

- One road planner: `src/lib/travelSupplies.ts` (`planTravelSupplies`, `roadLegs`, `roadSteps`, horizon 8 steps). It reuses `travelOptions` with a "stocked" input; a leg counts only when a spell or the Chronicle beats every free way by `TIP_MIN_SAVING_TILES`. Do not write a second estimate for the UI.
- Where it shows: `RoadSupplies` (Travel drawer with `locate`, Shopping page) and the game card through `supplyStop` in `decideTransport`. The card's road starts at the current objective (`from: null` in `PrepSync`): planned from the player, a shop next to the objective looked "on the way" for the very leg that leads there (seen live).
- Chronicle charges: `ChronicleCharges.java` parses the book's messages (as RuneLite's Item Charges does), falls back to the `itemCharge.chronicle` RS-profile config, stores its own copy (`chronicleCharges`), `/status.chronicleCharges` (0–1000, absent = unknown). In the planner: known > 0 = ready without "check charges", 0 = locked with a Teleport card as the need.
- Staves: `transport.json` `staves` (wiki, 2026-10-14), `staffCover` in `travel.ts`. A worn staff covers its runes; a carried one adds "wield your X" (`RecommendedTransport.actions`). Members staves are ignored on F2P. Without a separate worn list (old plugin) a carried staff counts as worn, as before.
- Banks: `majorLocations.json` has the Grand Exchange bank and Lumbridge Castle's top floor (plane 2). `bankTiles` adds `STAIRS_TILES_PER_FLOOR` (15) per floor of difference; `Preflight.nearest` in Java does the same. `BANK_SPOTS` = `BANKS` (the exchange is in it once).
- Plugin payload: `recommendedTransport.buy` (max 8, `PrepPlan.Buy`); `ShopWindow.build(place, view, atTransportStop)` lists them as "For the road: …".
- Tests: `tests/travelSupplies.test.ts`, `ChronicleChargesTest` (renders `build/overlay-render/shop-road.png`), `PreflightTest.anUpstairsBankCostsItsStairs`, `BridgeServerTest` (status field), `bridge.test.ts` (status parse).

## Whole-guide check — 2.53.0

Asked for by the owner after Shield of Arrav's card stayed on "Talk to Reldo" in the live game: every stage, every quest.

- Every route quest now has a stage table: S3-05 Shield of Arrav (varp 145, Quest Helper's Phoenix variable, which also counts the shared start; the Black Arm Gang's lines sit in row 3 and move by place and items, because varp 146 cannot be followed by the same table) and S9-05 Recipe for Disaster's first chapter (varbit 1850). `tests/wholeGuideAudit.test.ts` keeps it so: every quest on a table, every step on a place (exemptions by name with a reason), rows that start with no place pinned.
- The manual-walkthrough fallback (a quest without stage data) is still in the plugin; its test sample is the pre-2.53 Shield of Arrav target in `runelite-bridge/src/test/resources/manual-walkthrough.json`.
- Places added from the project's own data: S6-03, S8-03, S8-04. S6-04 (Magic) has no place on purpose.
- Every QUEST_COMPLETED name matches a RuneLite quest (`RouteTargetsTest` checks it).

## Codex audit pack (2026-10-14) — status after 2.55.0

The pack (`OSRS-Path-Full-Audit-2.53.0-EN.md` + a mega-prompt) was written against the 2.53.0 export. It is a backlog, not a task to run whole; each
item is checked against the current data and the OSRS Wiki before it changes. Evidence is kept in four kinds: **implemented**, **automated** (tests),
**live** (in the game), **open**.

### Implemented

- 2.53.3: S3-04 kit asked for at the entrance (rows 20 and 30, `pre` guard on row 30); Brutus specials can kill; S8-04 Cooking 10 methods; S9-04 Jungle
  Demon protection; the app copy of the item guard counts `alt` items like the plugin.
- 2.54.0, new-account trade restrictions (wiki "Account": 20 h of play, 10 QP, total level 100 lift the Grand Exchange sale ban on 40 items; buying is free):
  - `lib/tradeRestriction.ts`: state RESTRICTED / UNKNOWN / LIFTED from the game's quest points and total level (plugin 2.54 sends `questPoints` and
    `totalLevel` in /status, additive, no protocol bump; absent means unknown). The hours are never readable, so a met pair is UNKNOWN, not LIFTED. The
    route's own QP count is NOT an input (it is a lower bound). The player's word (`progress.sellRestrictions` lifted/active, kept across a progress
    reset) wins.
  - `lib/fundingPlan.ts`: the shopping list cut by tier from the coins (S2-01 items carry `gp` and `tier`; tier 2 is all or nothing). S1-13 has
    `moneyGoalNoSale` 8,000 (tests keep it above tiers 1-2 and below the full list). Steps S1-13, S2-01, S3-06 declare `sells`; each has a "New account" field.
  - UI: `TradeRestrictionNote` before MoneyGoal; MoneyGoal does not count unsellable loot; MoneyPlan lists blocked methods apart (`RESTRICTED_METHOD_IDS`).
- 2.54.0, step tasks (`Step.tasks`, `StepTask`, `lib/stepTasks.ts`, `StepTasks.tsx`): follow-ups tracked beside a step, never blocking it.
  Checks: worn / owned / level / quest; no check means the player ticks it (`progress.tasksDone["<step>:<task>"]`). `PlayerState.equipmentKnown`
  tells "worn items not read" from "nothing worn". Used by S2-08 (wield), S4-02 (Cowbell amulet), S8-04 (Museum quiz, A Porcine of Interest +1 QP, in the
  goals range through `validate.ts`), S8-05 (wear Ava's), S9-04 (Attack 60, wield). Their `doneWhen` text now matches the trigger.
- Carryover (S1-03, S1-04, S1-08, S1-12, S2-11) was already in the app; the route export now prints the real trigger ("and holding ...").
- `docs/route-reorder-proposal.md`: the reorder, documented, not done.
- 2.54.1, food before dangerous entries: row `items` and a `pre` guard (min 5 pieces, any of Trout/Salmon/Tuna/Lobster/Swordfish/Monkfish/Shark) on the
  entry line of S2-07, S2-08, S3-02 (two rows), S3-03, S3-04, S4-01, S4-02, S5-08 (20), S7-02, S7-03, S7-05, S8-01, S8-02, S9-02, S9-04. The list is pinned in
  `tests/questPreflight.test.ts` "food before a dangerous entry". Counts for S3-03, S7-03, S7-05, S8-01 are my own conservative numbers (the step data had no
  food); the others follow the step's own recommended food. Not guarded: S7-01 (phased loadouts already ask for food), S9-01 (no encounter entry line verified).
- 2.54.1, transport:
  - Canoe axe: a not-carried axe is "possible", never "locked" (`travel.ts` canoeOption): stored axes are shared across stations since 1 April 2026 and
    unreadable. Test: `tests/travel.test.ts` "without an axe in the bag the canoe is only possible".
  - Count Check: `transport.json` `oneTime[]` (`OneTimeWay`), built in `travelOptions` after the canoe, id `count-check`, state "check"; dropped once
    `usedAfter` (S1-09) is closed (`oneTimeUsedOf(progress)` is passed by TravelPlan, TravelTip and PrepSync into `TravelInput.oneTimeUsed`).
    Recommendation type `npc_teleport`; the plugin treats it as a person to talk to (`PrepPlan.interactsWithNpc`). Tests: `tests/oneTimeWay.test.ts`,
    `TransportChipTest.aOneTimeNpcTeleportPointsAtTheNpcWithItHighlighted`.
  - S6-02: "Fishing 1-40 first" field, `where`, recommended net / fly rod / feathers (Gerrant's Fishy Business). Finished in 2.54.2 (below).
- 2.54.2, two defects the first live check of 2.54.1 found:
  - `supplyStop` (`lib/liveTransport.ts`) suggested buying only a Fire rune for a Varrock Teleport while the Law rune was also short and the Exchange was
    off the way. A way now counts only when every item it still lacks is reachable on the same trip (near, or on the way and confirmed short); items not
    known to be short do not block it; several shops make one trip, nearest first, one stop each. Tests: `tests/travelSupplies.test.ts` "a way is stocked
    for only when everything it lacks can be had on the trip".
  - S6-02: `mapLocation` and `resourceSpots` follow the climb (Draynor nets 1-20, Barbarian Village fly fishing 20-40, Musa Point 40-50, coordinates from
    `majorLocations.json`). `itemsRequired` is the small fishing net with `anyOf` fly rod / lobster pot / harpoon; rod, feathers, pot and harpoon are
    recommended. Before this a level-1 account was sent to the Exchange for a harpoon first. Test: `tests/fishingClimb.test.ts`; the readiness golden
    and `active-steps.json` changed for S6-02 only.

- 2.55.0, S6-02 follows the training method (the owner's review of 2.54.2: "a harpoon or lobster pot must not satisfy readiness for level-1 net fishing"):
  - `Step.followsMethod` (S6-02: `fishing`). `lib/methodPick.ts` `pickMethods` picks, per such step, the method `adviseTraining` ranks first for the real
    level, mode and style (level unknown: no pick; level at the target: `GOAL_REACHED`). `PlayerStateProvider` sends the picks to the store
    (`setMethodPicks`, `samePicks` guard); the store's `steps` are `withTrainingMethod(step, pick)` (`lib/methodStep.ts`): the method's `needs` become
    `itemsRequired` and the in-game highlights, its spot becomes `mapLocation`. No pick returns the step object unchanged.
  - The `anyOf` substitution of 2.54.2 is gone; the step's own list (the net) stands while the level is unknown.
  - The plugin is asked to count every tool of the step's methods (`methodToolNames` in `toInGameTarget`); without that, a tool the game had not counted
    was UNKNOWN, ranked READY, and the choice flipped (fixed point pinned in `tests/fishingClimb.test.ts`).
  - `trainingMethods.json`: fi-bait asks for 100 Fishing bait, fi-fly for 100 feathers.
  - The bridge re-sends the active step when its resolved items or place change (`followKey`), so a level-up moves the arrow without a press.
  - Queue arrows: a detour frame records the arrow it set (`DetourFrame.nav`); when its task changes (e.g. "buy a lobster pot" after the method changed),
    `decideAuto` returns `retarget` and the arrow moves; `staleArrows` + `releaseNav` take down an arrow whose task is gone. The queue never takes over an
    arrow it did not set.
- 2.55.0, transport networks (each fact checked on the OSRS Wiki on 2026-10-15; data in `transport.json`, options in `travel.ts`, mapping in `transport.ts`):
  - River Dougne canoes (`dougne`, members): Castle Wars / Lara, Tree Gnome Village / Porkai, Ardougne Zoo / Pete, Chaos Druid Tower / Amergin, Combat
    Training Camp / Kaiquir. Same canoe types and levels as the Lum (`pushRiver`); ids `canoe-dougne`, `canoe-dougne-now`; the Lum keeps `canoe`.
  - Spirit trees (`spiritTrees`, members, Tree Gnome Village): Gnome Village, Gnome Stronghold (leaving it needs The Grand Tree), Battlefield, Grand
    Exchange, Feldip Hills. `TravelInput.questsDone` from `/status`: absent means "check", reported missing means "locked".
  - Gnome gliders (`gliders`, members, The Grand Tree): the hub Ta Quir Priw on plane 3 (its stairs count), two flights between outer stations, Lemanto Andra
    arrive-only, Ape Atoll needs Monkey Madness II, Feldip stays "check" (One Small Favour is reported only as done or not).
  - Cowbell amulet (`cowbell`, F2P): ids 33103 empty / 33104 charged; charged is ready, empty with an Air rune in the bag is ready after "use an Air rune on
    it", an item without an id is "check"; locked above Wilderness level 20; never offered when not carried (it cannot be bought).
  - The plugin: a glider is a captain to talk to, a spirit tree an object to click (`PrepPlan.interactsWithNpc/Object`).
  - Left out on purpose: planted spirit trees (growth unreadable), Poison Waste (The Path of Glouphrie), Prifddinas and Laguna Aurorae (not on the main map).
- 2.55.0, the stock-up trip (`supplyStop`, `planTravelSupplies` now carries `inBag` / `inBank` / `covered` per item and the coins):
  - One trip for the whole kit: what the bank holds and the bag does not is taken from the nearest bank; the rest is bought at its source. A way counts only
    when every item it lacks (to buy and to withdraw) is on the trip.
  - A stop is on the trip when the player stands by it (40 tiles) or it is on the way (at most 60 extra tiles) and what it gives is confirmed.
  - The trip must pay: the ways' saving minus the stops' detour (greedy nearest-first order, stairs counted) must reach `SUPPLY_MIN_TOTAL_TILES`.
  - Coins: a known total below the cost means no trip; short in the bag but in the bank adds a Coins withdrawal; unknown coins add "check you have the coins".
  - Unconfirmed items are named ("check your bank for Law rune", "up to N").
- 2.55.1, S3-08 (the owner's report from the Stronghold: "nothing shows what to do", "nothing about food, just kill minotaurs", and the combat brief):
  - Title "Strength to 20 and Attack to 30": Aggressive first, then Accurate. The numbers behind the text (scratchpad simulation from the wiki infoboxes and
    the melee formulas, live gear: iron armour crush defence +39, Defence 1, Mithril scimitar, Amulet of strength): with a Strength potion, Strength first
    is about 10 minutes faster to the step's end; without, both orders are about equal. The brief's "prefer the level 27 Minotaurs" is NOT adopted: the
    level 27 one (Attack 23, Defence 25, defences -10, 22 HP, max hit 3) costs about twice the food per XP at Defence 1 (L12: ~3.4 HP per kill; L27:
    ~15.5 HP per kill for 2.2x the XP). The brief's claim that both have -21 slash defence is wrong (wiki: -21 and -10).
  - Kit: required Mithril scimitar and 20 Salmon with `anyOf` Trout/Tuna/Lobster/Swordfish (the step is not READY with an empty bag); recommended
    3 Strength potion(4), Amulet of strength, Adamant scimitar (for S4-03: Attack 30 ends the step). Prices from the wiki price API on 2026-10-15.
  - Readiness counts a required item's own `anyOf` together (`readiness.ts`, `heldAll`; the `alternative` requirement), and the game is asked to count
    those alternatives (`toInGameTarget` watch list), so "short" is never a guess. Tool families keep their old path (`heldOf`). The parity test compares
    against the same requirement.
  - Pace: `StepPacing.goals` gives a skill its own goal (S3-08: Strength 20 with `also` Attack, Attack's goal 30). The plugin (`ActiveTarget.Pacing.goals`,
    `targetLevelOf/ExpOf`, `oneGoal`) counts each skill to its own goal and reports the shown skill's goal; an app before 2.55.1 sends no goals and nothing
    changes. Combat lines name the style: "35 minotaurs to 20 Strength on Aggressive", "next Attack: switch to Accurate" (plugin and app alike).
  - In the game: `quickSteps` (the panel and the guide's "Next" line); `inGame.goal` "Stronghold of Security floor 1: the level 12 Minotaurs";
    `pathWaypoints` entrance (3081,3420) then the level 12 room (1876,5216, the wiki spawn list). The step's anchor stays the surface entrance: the F2P route
    audits require surface anchors for the travel between steps.
  - Plugin navigation: `Navigation.layer` (surface below y 4200, separate area 4200-6400, dungeon above 6400, as `src/lib/instances.ts`); between layers the
    HUD says where to go instead of a straight-line number (inside the Stronghold it read "~2180 tiles"); the big arrow shows a chevron. A player already
    inside the area a route ends in skips the waypoints that lead in from another layer, only when the rest of the route stays in that layer and never on
    the surface (`Breadcrumbs.update`). App: a target in a separate area is not drawn on the world map (`isSeparateArea`).
  - "Block 2": first read as the empty space under the app's "Previous step / Next step"; the owner's next screenshot (2026-10-15) showed it is the in-game
    guide card. Answered in 2.55.2 below; nothing was removed in the app.
- 2.55.2, the training view (the owner: "after everything is bought and the fighting started, show the monsters left and the progress, like the top block;
  remove the card, without breaking anything"):
  - `PacingSet.trainingAt` (a gain in any paced skill within `TRAINING_MS` = 2 min) and `progress()` (the shown skill's XP over its goal's XP).
  - `SmartView.training(gaining, bankOpen, temporaryTarget)`; the plugin's `trainingNow()` puts `training` and `progress` into the HUD `State` (two new
    fields; the 16-argument constructor and the older ones keep their meaning). A per-tick check refreshes the HUD when the flag flips.
  - While training: `OsrsPathGuideOverlay` draws nothing; the HUD takes `lean` even when the compact HUD is off and ignores the smart reveal's one-line
    mode, so it shows the step title, the pace line, the bar (`OverlayProgress`, own component: RuneLite's ProgressBarComponent put its label a point below
    the plate with the large RuneScape font) and the warnings; goal, distance and bag wait. The card is back two minutes after the last XP, at the open bank
    or with a temporary target. Quest steps have no pace and are unchanged.
- 2.55.2, S4-03 (the combat brief, numbers checked): Hill Giant (wiki: 35 HP, Attack 18, attack bonus +18, Defence 26, max hit 4, every 6 ticks,
  aggressive) at Defence 1 in iron armour against an Adamant scimitar at Strength 20: ~25 HP taken a kill without a potion, ~21 with one; Attack 30-40 is
  ~170 kills, ~370 Salmon with potions (the brief's "Salmon x25" is one trip of ~12 giants, said so). Big bones ~330 gp (price API 2026-10-15) pay ~10 Salmon
  each, so the giants stay. Compared and NOT adopted: L12 Minotaurs (half the food, same time, no bones), L27 Minotaurs (more food). Kit: required Adamant
  scimitar and 25 Salmon (`anyOf` fish); recommended 4 Strength potion(4) and the Amulet of strength; `quickSteps`; `inGame.goal` and `pathWaypoints`
  trapdoor (3097,3468) then the giants (3111,9838, wiki spawn mean) so the HUD inside the dungeon leads to them.

- 2.55.3, S5-03 (wiki 2026-10-15: Lesser demon (Melzar's Maze) 79 HP, max hit 8, Magic 1, magic defence -10, weak to water; iron armour magic attack
  -68 with the boots): required 10 Salmon (anyOf fish); recommended Staff of air (the item database has no Staff of water and `build-items` is not run),
  Mind/Air/Water runes x50 for ~45 Water Strikes; fields "Lesser demon" (safespot, armour off: ~18% vs ~89% hit chance at Magic 25) and "Melzar the Mad";
  the stage line `killLesserDemon` rewritten; a food `pre` guard (5) on `enterMelzarsMaze`, pinned in `tests/questPreflight.test.ts`. Tests in
  `tests/hillGiants.test.ts`. Melee on the demon at Defence 1 estimated at ~200 HP taken: not advised.

### Automated

`tests/tradeRestriction.test.ts`, `tests/stepTasks.test.ts`, `tests/oneTimeWay.test.ts`, `tests/fishingClimb.test.ts`, `tests/travelSupplies.test.ts`,
`tests/questPreflight.test.ts` (food guards), `BridgeServerTest.questPointsAndTotalLevel...`, `TransportChipTest`, UI smoke scenarios (trade note, step tasks).
2.54.2: tsc, build, 1014 Vitest tests, check-data 0 errors, full Java suite, UI smoke.
2.55.0: tsc, build, 1053 Vitest tests (new: `tests/transportNets.test.ts` 19, `tests/fishingClimb.test.ts` 14, the stock-up describe in
`tests/travelSupplies.test.ts`, the queue-arrow describe in `tests/prepQueue.test.ts`), check-data, full Java suite
(493 tests, `TransportChipTest.aGliderPointsAtItsCaptainAndASpiritTreeIsTheObjectToClick`), UI smoke. `tests/fuzz.test.ts` advisers: an explicit 20 s timeout (the
default 5 s failed under load; the assertions are unchanged).
2.55.1: tsc, build, 1068 Vitest tests (new: `tests/minotaurTraining.test.ts`; the S3-08 expectations in `tests/streamlinedRoute.test.ts` and
`tests/stage3.test.ts` follow the new order; `tests/parity.test.ts` compares alternatives against the `alternative` requirement), check-data, full Java
suite (500 tests; `PacingSetTest` goals and styles, `NavigationTest` layers and waypoints), UI smoke. The readiness golden changed for S3-08 only.
2.55.2: tsc, build, 1074 Vitest tests (new: `tests/hillGiants.test.ts`; `tests/auditFixes.test.ts` and `tests/streamlinedRoute.test.ts` follow the food
moving into S4-03's required kit, the "Salmon is bought" check now covers S3-08 too), check-data, full Java suite (505 tests; `HudLeanTest` training view and percent,
`PacingSetTest` training window and progress, `OverlayLayoutTest` draws a training plate for every paced step in every font), UI smoke. The readiness golden
changed for S4-03 only.

### Installation

- 2.54.2 installed 2026-10-14 as `Downloads\OSRS-Put-2.54.2-portable.exe`; SHA-256 `4d2ad047…dfa4c2b` equals the release asset's digest. Data backed up to
  `Downloads\OSRS-Put-data-backup-2.53.1-before-2.54.2-20261014`. Plugin 2.54.2 reported by `/status` with the app 2.54.2.
- The 2.53.1 exe kept beside it as a rollback is gone: the app's own `sweepOld` (`electron/updater.cjs`) deletes every older `OSRS-Put-x.y.z-portable.exe`
  in its folder when a newer one starts. A rollback copy must live in another folder (from 2.55.0: `Downloads\OSRS-Put-rollback\`).
- 2026-10-15: the owner installed 2.55.0 (00:59) and 2.55.1 (01:13) with the app's own update button (an install is only ever a click, `update:install`);
  each restarted RuneLite. `OSRS-Put-2.55.1-portable.exe` SHA-256 `4b9c6eb8…5c7b45` equals the release digest; plugin 2.55.1, protocol 6 in `/status`.
  Rollback: `Downloads\OSRS-Put-rollback\OSRS-Put-2.55.0-portable.exe` (`83be087f…f203d4`, the release digest), outside the swept folder. The 2.54.2 exe
  was swept by the 2.55.0 start.

### Live 2.55.1 (2026-10-15)

World 316, Bexqq, fighting in the Stronghold of Security, Vault of War, on S3-08 with plugin 2.55.1 (no automated input; screenshots and `/status` only, the
game was not clicked while the owner played):
- HUD pace: "10 minotaurs to 20 Strength on Aggressive (estimate ~2 min)", then 9: Strength counted to its own goal 20, the style named.
- Guide card: "Strength to 20 and Attack to 30 · Current step · ~23 tiles ↓" and "Stronghold of Security floor 1: the level 12 Minotaurs": the route leads
  inside instead of "~2180 tiles" to the surface entrance.
- "What you need: in bank 1": 13 Salmon in the bag of the 20, the rest in the bank. Honest, but it stays on while food is eaten during a trip (see Open).
- The owner trains Strength on Aggressive with Strength potions and Salmon, as the step now says.
- Not seen live: the app window (minimised while the owner played; the same build was checked on the S3-08 page in a browser), the "next Attack: switch to
  Accurate" line (Strength 20 not reached yet), the training view (2.55.2, not released at the time).

### Live

2026-10-14, World 316, account Bexqq (F2P, QP 40, total level 249), plugin 2.54.1 then the 2.54.2 app over the same plugin, RuneLite restarted through the
app from the worktree. Evidence is the bridge `/status`, the app's own screens and the transport report (`window.__osrsPathTransport`).

Verified in the game:
- Plugin reports version and protocol 6; `questPoints` 40 and `totalLevel` 249 arrive in `/status`.
- Trade note on S3-06: both numeric conditions shown as reached, the 20 hours as "cannot be read": state UNKNOWN, not RESTRICTED.
- Step tasks against the worn items: S2-08 "wield the mithril scimitar" shows done with a Mithril scimitar worn; S4-02 Cowbell amulet shows "not checked"
  with the bank unread. S8-04 / S8-05 / S9-04 are not in the F2P route of this account, so their tasks were not seen.
- Supplies: for S6-02 from Varrock east the 2.54.1 build suggested buying a Fire rune alone (the defect above); the 2.54.2 build suggests nothing and
  walks, as the planner's own fetch check says.
- S6-02: the arrow led to Musa Point in 2.54.1; in 2.54.2 it reads "Draynor Bank: take Small fishing net" (the net is in the bank). The active step was
  put back to S3-05 afterwards and the debug flag removed.

Not verifiable on this account, so not claimed:
- Ancient Guardian: only the entrance guard is tested (data and unit tests); the encounter itself was not replayed and the quest is complete here.
- Count Check: S1-09 is done, so the way is correctly absent; it was not seen.
- Canoe "possible": the account was not near a station with a target that a canoe would shorten.
- RESTRICTED state, funding plan numbers against a real restricted account, the Draynor Manor / Fortress / Delrith food guards in their encounters.
- A stale step payload: after the app rebuild without a RuneLite restart the plugin kept the previous item list for the already active step until the step
  was cleared and shown again; a normal update restarts RuneLite, so this was only a test-procedure effect.

### Open

- The four transport networks of 2.55.0 cannot be ridden on this F2P account (members-only, or the Cowbell amulet not owned); only their data, tests and
  the mapping are verified. The Cowbell's charge count is not read (only charged vs empty by item id).
- Resumption of the quest objective after travel, missing-rune preparation and the three states are the 2.52/2.53 pipeline (`PrepSync`, `travelSupplies`);
  not re-verified in the live game in this group.
- Consumable kit during a step (food eaten mid-trip keeps "in bank: Salmon"): a departure check versus an in-progress check belongs to the unified readiness
  work (stages 1-7 of the owner's spec), not started.
- Combat brief, not done yet: S4-01, S4-02 kits (food guards at the fight's entry line since 2.54.1 but no required food), S2-01/S3-07 shopping amounts, members steps S7-02/S7-03/S7-05/S8-04. The brief's "prefer L27 Minotaurs" and "S4-03 Salmon x25 is enough" were
  checked against the wiki stats and not adopted as written.
- Inventory cleanup assistant, unified readiness stages 1-7, the full visual review at 100/125/150%: not started.
- The pack's other P1/P2 items not listed above are unchanged and unverified.
- Not adopted: a 67-step ledger and a single mega-release; reordering (see the proposal).

## Personal combat estimate (owner's spec 2026-10-15) — from 2.56.0

The spec asks for seven groups: (1) the calculation model, (2) the Minotaur example with trip / total / reserve / owned / deficit, (3) calibration from
the game, (4) readiness and shopping integration, (5) desktop simplification, (6) overlay simplification, (7) wider coverage.

- 2.56.0, groups 1-2:
  - `scripts/build-combat-foes.ts` → `src/data/combatFoes.json`: every free version of the training opponents (Minotaur L12 / L27, Hill Giant, Cow,
    Flesh Crawler, Moss giant) with attack level and bonus, style, max hit, speed, aggression; identical location versions collapse to one. check-data:
    every combat pace has its opponent there, and monsters.json's version matches one of them number for number (mutation-checked).
  - `src/lib/combatEstimate.ts` reuses gearAdvisor's `meleeHit` through the new `meleeAs` (a fixed style; `TrainStyle` adds Defensive). Kills are exact
    (4 XP a damage point, the last kill of a phase is whole). Attacks to kill: the exact count distribution (`attackCounts`) and moments. The opponent's
    swings per fight from that distribution (it answers a tick after the first attack, every speedTicks, none on the kill tick), its accuracy against the
    worn armour's bonus for its attack type. Level gains segment by segment; Strength potion doses level by level (each boost holds a minute);
    eating 3 ticks; 1 HP a minute; 2-6 s between kills; 3-6 min a bank trip; the start-of-trip health above two max hits is free. Ranges: 1.65 sd plus a
    model margin (formula 15%, calibrated 8%, basic 35%, +10% for aggressive opponents). Unknown worn items: "basic" and said; missing XP or health:
    said in `assumed`. No levels, no gear, or an unknown weapon: no estimate.
  - `src/lib/combatPlan.ts` + `CombatPlan.tsx` (inside `FoodAdvice`, which falls back to the old block for anything else): picks the version with the
    least food among those within 15% of the fastest; next trip = min(26, high); plan = rounded high; reserve = plan - expected; owned food by healing;
    deficit only when the bank was seen. Details: phases, bag duration, the other version, the potions verdict, the assumptions.
  - Finding: with the Mithril scimitar alone, Strength potions do not change the max hit between Strength 16 and 23 (it stays 4); with the Amulet of
    strength they do. The S3-08 "Strength potions" field assumes the amulet, which the "Weapon" field asks for.
  - Tests: `tests/combatEstimate.test.ts` against an independent tick-by-tick dice simulation (own XP table, own rolls, potion decay), `tests/combatPlan.test.ts`
    (the Minotaur example), a UI smoke scenario (`.combat-plan`, at 1100 and 390 px). Not live yet: RuneLite was closed while this was built.
- 2.56.0, group 3, calibration:
  - Plugin `CombatLog` (pure, `CombatLogTest`): on a step whose pace is melee, `ActorDeath` of an NPC the player was fighting (either side's
    `getInteracting`) is a kill of "name|combat level"; `HitsplatApplied` on the player is damage, attributed to the next kill. A kill more than 60 s
    after the previous one is no sample and its damage is dropped (bank trips, breaks, the first kill); the last 60 samples per version are kept; a new
    step or weapon id clears it. `BridgeServer.setCombatLog` → additive `/status.combatLog` `{stepId, foes:[{name, combat, kills, seconds, damage}]}`,
    left out when empty (no protocol bump).
  - App: `parseCombatLog`, `useBridge().combatLog`. `observedFor` matches name and combat level; from 10 kills (`CALIBRATED_KILLS`) the basis is
    "calibrated", the weight is kills/(kills+30). `chooseVariant` plans for the version being fought (most kills, at least 10). Details show
    "N kills measured in the game: s and damage a kill".
  - Not counted: food eaten by name (damage taken is the better measure: it is what the food pays for); damage from other sources between kills is
    in (it is real cost).
- 2.56.0, group 4, readiness and shopping:
  - `lib/foodPlan.ts`: `foodPicks` (PlayerStateProvider, from stats, XP, gear, bank, combat log) → `setFoodPicks` in the store → `withFoodPlan`
    after `withTrainingMethod`: the first food item's `amount` becomes the next trip (what readiness and the in-game list ask for), `totalAmount`
    the plan (high end, rounded); no food needed at all removes the item. `aggregateShopping` buys `totalAmount`. No levels or gear: no picks, the
    route amounts stand.
  - `assumptionsFor`: a step after an open combat step starts from the XP goals of the open combat steps before it and the weapon it asks for
    (`stepWeapon`); the step view uses the same assumptions, so the page and the shopping list agree.
  - `foodPicks` over the whole route runs well under 150 ms (test), so it follows every XP drop. The pick changes do not re-send the active step to
    the plugin (`followKey` is only for method steps): the in-game list takes the new amount at the next activation.
- 2.57.0 (first prepared as 2.56.1, released together), the visual review of 2.56.0 (Zen S3-08 page, `zen-s308-*.png` from the smoke) found the whole-goal amount in the wrong places:
  - `aggregateShopping` took `totalAmount` for every caller, so the step's "Prepare for this step" card and `OneTripCard` showed "Salmon ×110 Missing".
    Now only the Shopping page passes `{ wholeGoal: true }`; `oneTrip` and `prepPlan` stay at one trip. Pinned in `tests/foodPlan.test.ts`.
  - `PreflightItem.total` (from `totalAmount`) lets the readiness food row say "have 13, 13 short; buy about 97 for the whole goal" (BANK rows: "take it
    from the bank; buy about N for the whole goal").
  - `StepTraining` returns nothing for a step with `foes` and `pacing` (it suggested Al Kharid warriors for Attack beside the Minotaurs).
  - Zen Preparation: the `items` cards behind `details.item-sources` "Where to get each item"; `OneTripCard` rows short of a part read "13 of 26 (bank
    included)".
  - S3-08 / S4-03 quick steps "fill the bag with Salmon"; the S3-08 Food field and both Salmon `howToGet` texts no longer state a trip size.
  - Known, not fixed: on the first render with fresh game data the auto preparation can start a purchase toast with the route amount (×20) before
    the food pick arrives; the panel shows ×26 a moment later.
- 2.57.0, group 6, the food on the training plate:
  - The overlay already had the compact default the spec describes (the guide card closed: step, status line, place, "Steps" and the expand chevron;
    the 2.55.2 training view while fighting). What it lacked was the food. `TrainingFood` (pure, `TrainingFoodTest`): the step's first checklist row
    with healing, its bag count (alternatives counted, `countWithAlt`), "Food: 8 Salmon · ~21 kills" with `pacing.foodHpPerKill` from the app (absent:
    the count only); 2 or fewer is an alert "- bank soon", none "No Salmon left - bank now".
  - `OsrsPathHudOverlay.State` gained `food` and `foodLow` (an explicit 18-argument constructor keeps the older calls); the low line is an
    `OverlayAlert` right under the health (safety first), the normal one under the progress bar; `accent` is red when low; `lean` keeps it; `plain`
    lists it. `bag` still waits for the bank while training (the 2.55.2 test stands). `OverlayLayoutTest` draws both food states for every paced step.
  - App: `CombatEstimate.hpPerKill` / `secondsPerKill`; `FoodPick.hpPerKill` (to a tenth); `withFoodPlan` puts `foodHpPerKill` into the step's pacing,
    which goes to the plugin whole; `ActiveTarget.Pacing.foodHpPerKill` validated (0, 500].
  - Limit: the pacing is sent when the step is activated; a pick that arrives later (fresh game data) reaches the game at the next activation.
- Not done yet: group 7 (wider coverage). Group 5 beyond 2.57.0's Preparation fixes (one primary action per view) is not attempted further: the
  Zen view already has one status line, one primary button and the three reference views.

## 2.58.0 — the owner's report of 2026-10-15/17 (screenshot with four plates, no arrow back, a freeze)

- **Freeze, root cause found in `~/.runelite/logs/client_2026-10-15.0.log` (19:38:14): `AssertionError: scripts are not reentrant`** from
  `Quest.getState` ← `isQuestFinished` ← `questDone` ← `trackStageCursor` ← `refreshGuide` ← `updateHud` ← `onChatMessage` (the Attack 30 level-up line,
  which the game posts from inside a script). RuneLite runs with `-ea`, the assertion killed the client thread mid-script: the game froze, the telemetry
  stops ticking (no more `varx` events). The same stack is in the logs of 5 and 7 October (the "this already happened"). No other plugin error in any log
  (the 2 October `getItemPrice` NoSuchMethodError is an old API mismatch).
  - `ScriptGuard` (pure, `ScriptGuardTest`): quest reads run only while `safe` (inside `onGameTick`, which is now `scripts.safe(true)` around `tick(e)`);
    elsewhere the last value (null before there is one); an `AssertionError` from the read is swallowed. `isQuestFinished` and `completedQuests` use it.
    `questDone` is therefore false until the first tick after a restart: harmless.
  - Rule for the future: never call `Quest.getState` (or anything that runs a client script) from an event handler. Chat, varbit and widget events can come from
    inside a script.
- **Arrow back to the cave**: `Navigation.Breadcrumbs.update` only moved forward, so after reaching or entering the area the route ends in, leaving it left the
  current point inside the cave: the hint arrow was set at coordinates of another layer (nothing to draw) and the HUD said "find the way in". Now, when the player
  is on a layer other than the current point's (after the last point: the last point's), the route rewinds to the nearest earlier waypoint in the player's own layer,
  but only once the player is more than `REWIND_BEYOND` (8) tiles from it, so standing at the trapdoor does not flip. `aDungeonWaypointOnTheWayIsNeverSkippedFromTheSurface`
  now also pins the rewind (the dungeon point is still never skipped, it is next after the entrance). New tests: out of the cave, after the last point, one-layer route.
  - Not covered: a step with no `pathWaypoints` whose target is in a dungeon (nothing earlier to lead to), and leaving a dungeon towards a surface target (the HUD
    says "find the way out"; the exit tile is not known to the data).
- **Four plates at the exchange**: HUD + guide list + `OsrsPathShopOverlay` ("Exchange · what to buy") + `GrandExchangeHelperOverlay` ("Bulk list").
  `ExchangeView` (pure, `ExchangeViewTest`): exactly one of the two cards draws; the bulk list while it has something to buy (the step's purchases it does not hold follow
  as "Also for S3-08"), else the step's card if it has something to buy, else the bulk list's "have everything", else the step's checkmark. `SmartView.exchangeFocus`: at the
  open exchange the guide list is hidden (`GuideList.shown`) and the HUD is the one-line compact form, **whatever the smart reveal setting says** (it is off by default).
  Bank and merchant windows are unchanged (the bank list is interactive and the owner's complaint was the exchange).


## 2.59.0 — stuck cursor, Inventory cleanup, a pink line

- **The cursor stuck after a finished step (Corsair Curse, 2026-10-17).** Telemetry (`osrs-path-telemetry/session-20261017-*.jsonl`, kind `qh`): the machine picked
  `goDownFromArsen` ("strong", no `line` field = no line) and `qhPick` returned null, so the old place-and-items logic kept "Talk to Colin" (the player stood next to him)
  until the player went down the stairs and the machine picked `goUpToGnocci`. `QhMachine.lineFor` now falls back, for steps whose name starts with a movement verb
  (`MOVEMENT`: go, climb, enter, leave, walk, exit, cross, swim, sail, board, descend, ascend + a capital or digit), to the line of a neighbour in the same list of
  conditions (the previous leaf first: Quest Helper lists "go to X" right after "talk to X"). `QhLineCoverageTest` walks every quest, stage and leaf of the real data
  (`questMachines.json` + `../src/data/questStages.json`) and fails for a moving step with no line in a stage that has several lines. Known remaining: five Watchtower
  (S7-05) travel legs at 130/150 (their stage has only the fight and the king).
  - **Known data gaps, not moving steps, not fixed**: machine leaves with no line in our stage data, found by the same walk: S1-07@75 `pwPlayPiano`, @115/120
    `continueThroughSapphireDoor`; S2-10@30..50 `reobtainKey`, `talkToAggie`, `dyeWig`, `talkToNed` (stage has only `talkToJoe`/`useRopeOnKeli`/…); S2-11 levers
    (`pullUpLeverC/D`, `pullLeverToLeave`); S2-12 `searchBehindGenerals`, `searchWestHut`; S9-01 `getAnotherBranch`; S9-02 `pickUpSecateurs`; S9-04
    `talkToDaeroTravel`, `useWool`, `enterGate`. They need lines in `questStages.json` (a content job: text, tile, highlight), not a heuristic: a guessed neighbour would
    send the player to a wrong place.
- **Minimap lines (owner's report).** Nothing in this plugin draws on the minimap (`grep -i minimap` hits only comments). The purple dotted line is **Shortest Path**:
  `shortestpath.colourPathUnreachable` is rgb(200,40,240); it draws that colour when it cannot find a full route to our target (here a spot upstairs in Corsair Cove) and shows
  the way to the nearest point. The red solid line in older screenshots is its normal `colourPath`. The Quest Helper lines vanished because **its settings
  `questhelper.showWorldLines` ("Display navigation paths") and `showMiniMapArrow` ("Display arrows on the mini-map") are `false` in the RuneLite profile** (true in the backups
  of 25–26 September, already false in the 12 October backup). This plugin never writes them (`setConfiguration` is only used for its own group). The owner has to switch them
  on in RuneLite; we do not edit another plugin's profile while the client runs (it rewrites the file on exit).
  - The `useShortestPath` setting text now explains the purple line.
- **Inventory cleanup**, `docs/inventory-cleanup.md` (rules, table, limits). `src/lib/cleanup.ts` (pure engine), `cleanupPrefs.ts` (per profile and character),
  `components/InventoryCleanup.tsx` (Shopping page), `tests/cleanup.test.ts`, UI smoke at 1440 and 390 px. Plugin additive fields: `accountType` in `/status`
  (`Client.getAccountType()`, deprecated in 1.12.39 but working; `BridgeServerTest.accountTypeIsReportedOnlyWhenKnownAndInGame`) and `noted` on bag rows.
  - Not done: the in-game card and slot highlights (planned design: append the lines to the existing bank/merchant `ShopWindow` card rather than a new window,
    so the window count does not grow again; a `/cleanup-hint` endpoint with `player`, expire after ~10 minutes, drop lines whose item left the bag, highlight by item id
    with lower priority than quest-item frames, a setting off by default); bank contents; High Alchemy; live verification.

## 2.60.0 — the way in, Quest Helper's step as the arrow, a walk through every quest

- **Owner's reports (2026-10-17, The Corsair Curse):** "Took the spade and it does not go on" (= 2.59.0's movement leaf `goOntoShip`), "Target is underground - find
  the way down, but where?" (Chief Tess). Telemetry showed the machine's strong leaf `goDownToTess` (a hole on the beach) while our line `talkToTess` sat in the cave.
- **`QhVia`** (pure, `QhViaTest`): when the machine's strong leaf is not the line's own `k` and its Quest Helper tile (`QhSteps`, the bundled
  `tests/fixtures/qh-steps.json`) is more than `SAME_PLACE` (2) tiles from the line's tile (or on another floor), `followStage` sends the arrow there
  (`navToVia`, sticky like a stage target) and `trackStageCursor` highlights the step's NPC or object instead of the line's. The key includes the leaf, so a new
  leaf re-aims. Label: the leaf humanised (names that are capitalised inside the quest's line texts keep their capital) + the game's NPC/object name,
  shown as the distance prefix (cut at 34) and as the target label. A pre-flight block still wins.
- **`Portals`** (Java) / `src/lib/portals.ts` (TS twin, `tests/portals.test.ts`): `src/data/portals.json` from Shortest Path's `transports.tsv` at a pinned commit
  (`npm run build-portals`, needs network; notice in THIRD_PARTY_NOTICES.md). `portals`: rows that change layer (surface / separate area / dungeon), deduped
  by object+action+destination clustered within 3 tiles. `floors`: same layer, another plane. `throughPortal` in `navTarget()`: a target in another layer than the
  player → `Portals.pick` (into an area: the way whose far end is nearest the target, ≤ `AREA_REACH` 400; out of one: a way ≤ `EXIT_REACH` 250 from the player whose
  far end is nearest the target; requirement-free first); another floor of the same layer → `pickFloor` (up: comes out ≤ 20 from the target; down: ≤ 40 from the
  player). Memoised on (target, player tile). The way's object is highlighted (`track`), the HUD distance gets "Way down: Enter Hole · ". A layer or floor change
  calls `updateNavigation` (the hint arrow is only set there).
  - Not covered: instances (`Navigation.isInstanced`), multi-hop routes (only the first way is shown; after it the next is picked), ladders missing from
    Shortest Path's table (the Corsair Cove huts — Quest Helper's step covers that quest).
- **Quest walk** (`QuestWalkTest`, `QhLineCoverageTest`, real data): every quest × machine stage value × leaf the machine can pick strongly (`QhMachine.leafPaths`
  now follows the machine: an unreadable condition stops the list; an "and" with an unreadable part is never taken; a leaf reached only by defaults is not a pick).
  Fails on: a leaf with neither a line nor a Quest Helper tile; a place off the surface with no way in from Lumbridge (ways out — `exit…`, `leave…` — excluded);
  a surface place in a stage that also has underground places with no way back up; a route step (`steps.json` map location and waypoints) underground with no way in.
  Baseline: three Grand Tree leaves (S7-05@140/150, no tile in Quest Helper; the king's cave has a way in, asserted).
  - Lines added to `questStages.json` (Quest Helper's texts, commit 75b623a; inserted in place by `scratchpad/add-lines.cjs`-style text insertion, the file does not
    round-trip): S1-07@75 `pwPlayPiano` (D, E, A, D), S2-11@1/2 `pullUpLeverC`, `pullUpLeverD` (at the end of the list: only the machine leads there), S9-04@3 `useWool`,
    S9-01@3 `getAnotherBranch` (end), S2-10@30/40/50 `dyeWig` (end).

## 2.61.0 — Inventory cleanup in the game

- **Snapshot part `cleanup`** (protocol 6, additive; only present when there is at least one line, so an app with nothing to clean sends byte for byte
  what older plugins know, and an older plugin ignores the field). `src/lib/cleanupHint.ts` builds it from `cleanupAdvice` (the same result the Shopping
  card shows): non-keep lines with an item id, at most 16, `why` = the new `CleanupRec.short` (a few words set at each verdict in `cleanup.ts`),
  `action` drop → `OBSOLETE[key].action` (drop/destroy), `proceeds` only on sells. `useCleanupAdvice` (lib) is now shared by `InventoryCleanup` and
  `components/CleanupSync.tsx` (mounted in App beside GearHintSync; `setPrepPart('cleanup', …)`).
- **Plugin** `CleanupHint` (DTO + `prepare()` + pure `visible(me, bagById, now, appSeenAt)`): the character must match (nbsp/underscore/case-insensitive),
  a line whose id is not in the bag is hidden, a smaller stack caps the count and scales the estimate, nothing after `STALE_MS` (10 min) without the app
  (`appSeenAt` = an open `/events` stream on a tick, or a snapshot). `bagIds` (raw id → count, banknotes under their own id) is rebuilt in `rebuildCarried`.
  `cleanupLines()` (client thread) feeds: `ShopWindow.withCleanup` (bank/merchant: all lines; exchange: sells only; own card title when the step has none;
  never changes `todo`; up to `CLEANUP_SHOWN` 5 + "… and N more"; Marks SELL/DROP/REVIEW coloured by `CleanupHint.SELL/DROP/REVIEW`),
  `StepGuide.View.cleanup` → `GuideList.adviceCount(View)` (+1) and `cleanupRows` under the Advice tab (4 shown), and `cleanupShown` → `cleanupFrame(id)`
  for `OsrsPathItemOverlay` (dashed 1.5 px, bag only, drawn only when no wanted/step/transport/upgrade frame applies). A tick compares `cleanupLines()` with
  `cleanupShown` and refreshes the guide on change (bag, setting, expiry).
- **Settings**: `cleanupInGame` (default true), `cleanupHighlights` (default false), section "Places, radar, pace", positions 32–33.
- Tests: `tests/cleanupHint.test.ts` (8), `CleanupHintTest` (11, renders `build/overlay-render/shop-bank-cleanup.png`), UI smoke (the snapshot carries the
  lines for the character; "Always keep" removes them from the snapshot).
- Not verified live: the cards and frames in RuneLite (needs the owner logged in with surplus in the bag; no item is to be disposed of for the check).

## 2.62.0 — readiness verdict, kit check, tool levels, food by healing

- Owner's spec (readiness stages 1–7, scratchpad `specs/full.txt`): one answer over the existing plan, not a second system. `docs/readiness.md` has
  the rules, statuses, groups, bank freshness, food, tools, in-game display and the supported list.
- `lib/readinessVerdict.ts` (`readinessVerdict`, `bankFreshness`), `lib/combatReadiness.ts` (weapon/armour/trip food/version text),
  `combatPlan.ts` (`ownedFood` → `carriedEq`/`bankEq`/`reserved`; `foodReservations`; `CombatPlanView.variants`), `components/ReadinessVerdict.tsx`
  (`useReadinessVerdict`, `ReadinessVerdictCard` at the top of QuestSupplies, the helpers block and the Preparation tab).
- Tool levels: `toolTiers.ts` `toolUse`/`usableAt`; `playerState.heldOf` filters the family by `levels`; `unusableTools` feeds the readiness
  row detail; `preflight.ts` `countOf(items, p, levels)`. Plugin: `ItemCounts.setToolLevels` (from `onStatChanged`), `ItemCounts.usable`,
  `Preflight.count` skips unusable alternatives.
- Food by healing at entrances: `Foods.java` (bundled `src/data/threats.json`), `Preflight.count` and `Block.reason()` ("… 70 health …; you carry
  28."); the app's `countOf` the same. `tests/questPreflight.test.ts` expectations moved from pieces to healing (8 Salmon now cover "10 Trout").
- Snapshot: `PrepPlanPayload.readiness` (additive), `PrepPlan.Readiness` (Java; an invalid one is dropped and the plan stands), the bank card row
  (`ShopWindow.build`, BANK), the Advice tab's first row (`GuideList.adviceRows`, counted in `adviceCount`). Not on the Steps tab: the trip food
  drops below the plan as the player eats, and a row there would flicker mid-fight.
- Two-handed weapon + a safety shield rule (S5-08): `VerdictInput.worn` → "Iron 2h sword is two-handed: it leaves no room for the Anti-dragon shield".
- Fixed in passing: `checklist.nameKey` had a literal `/00a0/` since the 2.28.0 translation (harmless: `\s` covers nbsp) → `/ /`.
- Tests: `tests/readinessVerdict.test.ts` (25), `ToolLevelTest` (4), `ReadinessRowTest` (4), UI smoke readiness (the Zen Preparation drawer at
  1100 and 390 px). Totals: Vitest 1196, Java 573.
- Not verified live: the owner's character is past S3-08 and Below Ice Mountain; the cards render in the smoke with the minotaur fixture
  (`readiness-s308-*.png`).

## 2.63.0 — combat estimate group 7: quest fights

- `scripts/build-combat-foes.ts` PAGES += Count Draynor, Ithoi the Navigator, Brutus, Delrith (skipped: no max hit), Elvarg, Melzar the Mad, Lesser
  demon, Black Knight, Ancient Guardian; rerun 2026-10-17, the existing training versions byte-identical.
- `src/lib/fightEstimate.ts`: `estimateFight` (one fight, the least-damage melee style; magic attackers against the player's magic defence),
  `estimateStepFights` (a step's foes and threats, free versions, not paced steps), `OTHER_METHOD` (Lesser demon safespot, Ancient Guardian pillars),
  `fightLine`. `combatEstimate.ts` now exports `spread` and `swingDamage`.
- UI: `FoodAdvice` shows `.fight-plan` above the threat list with "How this is worked out". Verdict: `VerdictInput.fights` + `carriedFood` → a safety
  line per fight and a caution when the carried food (by healing) is below the high end.
- Not adopted as written (owner's combat brief): S2-01/S3-07 fixed amounts (Strength potion ×5, Salmon ×50, S3-07 Salmon ×40-50, potions ×4). The
  readiness spec asks for quantities from the activity; the Shopping page already buys the whole-goal food from the personal plan, and the plan says
  when potions do not help with the player's gear. Recorded in the release notes.
- Tests: `tests/fightEstimate.test.ts` (7), verdict fight cases (2), UI smoke S2-08 `.fight-plan` at both widths. Vitest 1205.

## 2.63.1 — final verification (readiness spec, the last stage)

- Gate: Vitest 1205 (89 files), Java 573, check-data 0/0, `npm run build`, UI smoke 460 (with `UI_SCALES=1`: home, step S3-08, shopping,
  skills, gear, journal and settings at 100/125/150%, `deviceScaleFactor` with a viewport of 1920/scale; no overflow, no clipped button text, no
  console errors; every screenshot looked at), e2e 17 (source tree) and 18 (packaged).
- Packaged candidate: `E2E_EXE=<exe> npm run test:e2e`. The NSIS launcher always sets `PORTABLE_EXECUTABLE_DIR` to the exe's folder, so the data
  goes next to the exe: the script refuses unless the exe is alone in its folder, and removes the data it made. `electron/main.cjs` now honours
  `OSRS_PUT_E2E_ROOT` in packaged builds too (it only moves data away from the player's). Without it, `app.getPath('userData')` failed under the
  test's env ("Failed to get 'userData' path"). The run ends with a normal close (`page.close()` → `window-all-closed` → the launcher exits and
  removes its unpacked copy). A forced end of the launcher leaves about 800 MB in TEMP (`ns*.tmp` plus `TEMP\<build id>`), so `stop()` ends the
  app under the launcher first. `removeDir` retries for ten seconds because rmSync gives up at once on EPERM while just-killed processes still hold
  their files. Never run a copy of the build the player runs: it would unpack over the running app's folder (same build id).
- Fixed from the review: Settings Preview at 150% (flex-wrap instead of a 1.3fr/0.7fr grid with a 260 px minimum); Gear claims without exchange
  prices (`priceUnknown`); the cleanup review reason as its own sentence after "Keep N for …" (`lead('. ')`, sales keep `lead('; ')`);
  "suits"/"fits" in `combatReadiness.variantText`.
- Isolation checked after every candidate run: `%APPDATA%\OSRS Path\progress-copies` unchanged (last 12:21:56), `Downloads\OSRS-Put-data` written
  only by the owner's own 2.59.0 hourly backup timer (`backupLast`), the owner's processes untouched, nothing left in TEMP.
- Not verified live: everything in-game from 2.60.0 on (the way in and Quest Helper's step as the arrow; cleanup rows and frames; the verdict on
  the bank card and the Advice tab; tool tiers and food by healing at entrances). RuneLite runs plugin 2.59.0 until the owner presses the
  app's update. The quest-fight estimates (2.63.0) are app-side and checked with fixtures only; S3-08 and Below Ice Mountain are behind the
  character, so the minotaur and Guardian cards cannot be shown live.
- Known, not changed: the Journal's quest list scrolls inside its box while the page also scrolls about 140 px (all scales, as before). Full-page
  screenshots show the sticky sidebar ending at the first screen (a screenshot effect, not the app).

## 2.63.2 — the live check (2026-10-18)

- Owner's request: update everything and check the app and the plugin live. Computer-use control of the app window was declined, so the
  update was done like the updater does it. The v2.63.1 asset was downloaded to an empty folder and its size and sha256 checked against the
  release digest. The data was backed up to `Downloads\OSRS-Put-data-backup-2.59.0-before-2.63.1-20261018`, the old app closed (`CloseMainWindow`),
  and the new exe started (`sweepOld` removed 2.59.0). RuneLite was closed while logged out and relaunched with "Launch RuneLite with the
  bridge" (plugin 2.63.1, bridge up in ~9 s). Login was on World 316, no credentials. The app was driven over CDP (`--remote-debugging-port=9333`)
  with DOM clicks: Playwright's mouse click hangs on that window, and `Page.captureScreenshot` hangs while it is covered.
- Found live and fixed:
  - Cleanup offered the active quest's relic (Ogre artefact) as "untradeable, no use ahead". New `lib/questItems.ts` reads the item
    requirements of `questMachines.json` (43 item checks in 28 quests). `cleanupAdvice` keeps an item an open step's quest checks for, when no
    shopping line names it.
  - The same blind spot in the Preparation drawer: `bagCleanup` (now given `plan.stepIds`, skips `questUsing` items; potions joined
    `KEEP`) and the weight advice (`prepPlan` adds `questItemKeys(window)` to `needed`).
  - `sourceRouter`: a drop label drops the wiki anchor ("Scurrius#non-MVP" -> "Scurrius"); `WikiDrawer` shows it as a note.
  - QP 41 in the app vs 40 in the game: S3-05 Shield of Arrav (optional, cannot be finished alone) is marked done. `lib/useQuestPoints.ts`
    (game's `questPoints` while connected, else `store.qp`) is now used by all 11 places that showed or checked `qp`. The journal adds "not
    finished in the game" from `questsDone`.
  - `StepMap`: mid-quest, the live arrow target (not `step`/`branch`, not instanced, not one of the places) is the first point, "Now: …", and
    chosen until the player picks another. The selection is keyed by place, not index.
  - `overviewOf`: a line equal to the previous one is merged (`also`), and `overviewCurrent` matches either.
- Checked and fine: plugin compatibility with RuneLite 1.13.1 (261 references); RuneLite logs (only World Hopper ping and NpcAggroArea
  login warnings, RuneLite's own); all app pages with live data (no console errors, no overflow); the in-game Advice tab (readiness: bank
  last seen 2 days ago).
- Not checkable here: the bank card and the shop/exchange cards (Corsair Cove has no bank until the quest is done); the pre-entry guards.

## 2.63.3 — header launch button, camera-relative HUD arrow

- `components/LaunchRuneLiteButton.tsx` in the top bar (before `BridgeIndicator`): desktop only, link on, state not online; busy for 12 s after a click
  (RuneLite needs ~10 s for the bridge). The UI smoke's desktop stub now counts launches (`__launched`) and has `offline` (every bridge request fails);
  the app's own start-up auto-launch is one of the counted launches.
- `Navigation.arrow(dx, dy, cameraYaw)` and `readout(..., Integer cameraYaw)`: the distance line's glyph is turned by `ArrowGeometry.screenAngle`
  like the big arrow; the overload without a yaw stays the compass version. `OsrsPathBridgePlugin.updateHud` passes `client.getCameraYawTarget()`;
  it is refreshed per `updateHud` call (game tick), not per frame. Owner report 2026-10-18: "Go up to Ithoi (Stairs) ~15 tiles ↘" while the
  world arrow pointed up-right. Not verified in the live game after the change (the owner did not log in).

## 2.63.4 — Sora in the game

- `GuideFont` loads `fonts/Sora-variable.ttf` (default instance wght 400, like Inter; bold is synthesized as before); `build.gradle` bundles
  `public/fonts/Sora-variable.ttf` and `OFL-Sora.txt` instead of Inter. The app's CSS still uses Inter. `GuideFontTest` expects "Sora".
- Owner picked Sora from six options (Inter, Manrope, Plus Jakarta Sans, DM Sans, Outfit, Sora, Figtree). Whether the app should follow was
  offered, not decided.

## 2.64.0 — funding system (app side)

Owner request 2026-10-18: an integrated, personalised money-making and funding system. Shipped in blocks (owner: "deploy after each large block"):
this release is the app side; the plugin line and the Shopping-page summary are next. Nothing here was live-verified in the game: **automated only**
(vitest 1350+, UI smoke with the exchange mocked from a real 2026-10-18 capture).

Where things are (all under `src/lib/funding/`, not to be confused with the older `src/lib/fundingPlan.ts`, the tiered shopping plan for restricted accounts):

- `ge.ts` tax (2% per item, floor, 5,000,000 cap, `data/geTaxExempt.json`, verified 2026-10-18). `quotes.ts` side-aware `PriceView` (buy = high, sell = low), confidence from age,
  spread, thin volume and spikes; `usePriceView.ts` + `quoteStore.ts` one shared board, one fetch loop while a card is open. `services/pricesApi.ts` is the v2 service
  (`getQuoteBoard` never throws; 429 does not fall back to v1).
- `methods.ts` + `data/fundingMethods.json` (12 curated methods, every one with sources and a revision), `data/fundingCoverage.json` (91 guides, 12 supported, the rest with a
  reason), `docs/FUNDING_COVERAGE.md` (generated: `npm run funding-coverage`). `validateCatalogue` is enforced by `tests/funding/catalogue.test.ts`, not by `check-data`.
- `snapshot.ts` one player snapshot (unknown stays unknown; protections = items the window of steps needs); `need.ts` four tiers (minimum, recommended, objective, optional)
  read from the existing prep plan and shopping list; `budget.ts` liquid coins, surplus from the cleanup advice; `cheaper.ts`; `evaluate.ts` per method: eligibility, working capital,
  bag-slot trips, absorption cap (25% of hourly volume), buy limit cap, fast/typical/slow minutes with a price haircut; `combatAdapter.ts` calls the real combat model, there is no second one;
  `rank.ts` two-stage (eligibility, then conservative time with a confidence penalty, 25% hysteresis); `assess.ts` the answer for a step; `plan.ts` the plan state machine;
  `session.ts` realized coins vs unsold loot from the ledger and the observed pace (4 h window).
- App wiring: `src/fundingContext.tsx` (provider mounted in `main.tsx`; keys `osrs-put:funding-plan:<profile>:<character>` and `osrs-put:funding-rates:...`), `components/FundingCard.tsx`
  (mounted inside `OneTripCard` when `inStatus`; the old coin line is its fallback), `FundingStatusLine` in `StepStatus`.

Invariants (do not break):

1. The plan never completes, reorders or renames a route step; `sourceStepId` stays open. Its arrow label starts with `Funding: ` and carries no `stepId`; only the plan takes that arrow down.
2. A sub-step advances only on something the game shows. Arrival is not "done", loot value is not a sale, bank moves are not income. What cannot be seen asks the player.
3. Reserved items (route needs, completion triggers, carry-over, quest items) are never in the surplus, whatever a stale cleanup list says (`budget.surplusOf` checks again).
4. Unknown stays unknown: no coins, no bank, no price means `UNKNOWN`, never `COVERED`. A line the plan calls a drop but the exchange sells (food) is a purchase (`need.buyable`).
5. Dependable income only (chance 1/16 or better); no Wilderness, no flipping, no rare-drop gambling, no members default.
6. The player's position is not tracked by the app: the provider asks `/status` every 4 s while a plan runs and each open card every 30 s.

Found while building (worth knowing): the item database has no exchange price for food, so the prep plan's cheapest source for Salmon is a monster drop table; the first
version of `need` skipped such lines and the card never appeared. `assess` also said "Nothing to pay for" for an unpriced shortage; both fixed with tests that fail without the fix.

Not done yet: the plugin line (`funding` part of the `/prep-plan` envelope, HUD/guide line), the Shopping-page summary (part of the Shopping rework), live verification.

## 2.64.1 — funding system, plugin line

- Snapshot part `funding` (additive, envelope version stays 6): `lib/fundingHint.ts` builds it from the same `FundingView` the Preparation panel draws, `components/FundingSync.tsx`
  sends it (same dedupe pattern as `CleanupSync`). Fields: player, planId, version, status (ACTIVE only; a paused plan sends nothing), title, action, `brief` (a few words for the narrow
  plate: the activity's title while working, the first sentence otherwise), progress, estimated, stepIndex/stepCount, needsConfirm.
- Java: `FundingHint` (validation like `CleanupHint`; `hudLine(me, now, appSeenAt)` = "Raising coins: <brief> · <progress> (estimated)", null for another character or an app gone more than
  10 minutes); `OsrsPathBridgePlugin` keeps `funding`, puts the line in the HUD `action` slot unless the plan's own arrow is the heading, and the heading drops the `Funding: ` marker
  (`FundingHint.arrowText`). The tick redraws the HUD when the line changes (expiry, character). Nothing is computed in Java.
- Agreement is tested from the app's own output: `tests/prepEnvelope.test.ts` writes a funding row into `prep-snapshots.json`, `FundingHintTest` parses it and checks the line; the UI smoke
  checks that the snapshot's `action` equals the app's status line and that Cancel removes the part.
- Not verified live in the game (automated only). To check live: start a plan at a step that is short of coins, look at the HUD under the arrow while walking and while killing cows.

## 2.65.0 — combat route: plan comparison (Task 2, block 2a)

Where things are (`src/lib/combatRoute/`, UI in `components/CombatRoute.tsx`, shown inside `FoodAdvice` above the food plan and as one line in `StepStatus`):

- `spots.ts` the opponents plans may lead to (`TRAINERS` = Cow, Minotaur level 12 only, Hill Giant) and where, taken from route steps that already send the player there (`spotsOf`), never invented.
- `plans.ts` `evaluatePlans`: plans `route` (the existing `combatPlanView` answer, not a second model), `split` (trainer for the XP goal, then the item-drop phase), `defence-first:10|20|30` (Defence on cows, then the route with the Defence it gave). Two-stage rank: eligibility (foe max hit x2 below HP), then
  `minutes.high` x a basis penalty (formula / calibrated / basic), 5% tie band decided by net (drop income minus food). A non-route plan is recommended only at a 10% gain; an adopted plan is kept within 1.25x of the best.
- `pick.ts` `withCombatPlan` rewrites the step (foes, map location, NPC names, goal "Plan: ...", pace line, a "Your plan" field) and leaves id, title, `completionTrigger` and `itemsRequired` alone. The phase is derived each time from XP and held items, never saved.
- `adopt.ts` the choice only, per profile and character (`osrs-put:combat-plans:<profile>:<char>`, `{stepId: {key, at}}`). `context.ts` builds the estimate context from live data. Overlay order in `store.tsx`: combat plan, then training method, then food plan, so food and shopping count the opponent in hand.
- `bridge.tsx` re-sends the active step to the game when the plan or its phase changes. `Settings` has "Keep Defence at 1" (`features.keepDefenceOne`, off by default).

Invariants (do not break):

1. A plan never completes, reorders or renames a step. The route's completion trigger is what closes it.
2. Reserved items (the Big bones the step asks for) are never income. A kill requirement is never replaced by buying the drop.
3. Cowhide is income only when the trade restriction is LIFTED; RESTRICTED and UNKNOWN count nothing. Unread bank = unknown (whole count planned, risk stated).
4. An explicit Defence 1 build blocks Defence plans (listed as not offered, never recommended). With no preference they are compared like any other.
5. Adoption is explicit (a button); a recommendation alone changes nothing. A plan whose conditions are gone (bones already in hand) is dropped silently and the route's own plan stands.
6. Nothing is computed in Java: the game gets the same step payload (`toInGameTarget`) as always.

Tests: `tests/combatRoute/plans.test.ts` (21), `pick.test.ts` (15), UI smoke `UI_ONLY=combat` (card, folded comparison, adopt, game payload follows, back to the route). Screenshots at 1440 and 390 looked at; not checked live in the game (automated only).

Not done yet (block 2b): the audit ledger of every combat stage, mandatory quest-fight preparation (Ancient Guardian, Brutus, Count Draynor, Ithoi, Melzar, Elvarg, Black Knights, ...), observed-performance notes, potions with/without.
