# Concept A redesign: verification

Branch `feature/concept-a-desktop-redesign`, from `main` at `d847cde` (2.80.20, origin/main). Not merged, not pushed, no release.

## Screens implemented

Every section is a two-page spread of the Ledger, inside the same frame: title strip, HUD, spine and, on the Journey, the hotbar.

| Spine | Route | Left page | Right page |
| --- | --- | --- | --- |
| Journey | `#/`, `#/step/:id` | The road: chapters, steps, "You are here", locked steps with their blockers | The step: chapter line, title, chips, readiness plaque, NOW (current action, Show in game, Done), ribbons Steps / Preparation / Route & game / Details / Wiki |
| Journey (compact) | `#/` with Compact on | hidden | The companion strip, unchanged |
| Skills | `#/skills`, `#/skills/:cat/:skill` | Character sheet: every skill tile | The chosen skill (Train / Plan / Calculator / Reference); without one, the followed skill or the XP table |
| Journal | `#/journal`, `#/quests`, `#/goals`, `#/journal/session` | Quests with filters and the selected quest | Stage goals or Session |
| Loadout | `#/gear` | Worn now or last known gear | Gear advisor: recommendation, options, combat numbers, unlocks, prayers |
| Provisions | `#/shopping` | Shopping list with scopes and stage range | Coin purse: budget, coin plan link, road supplies, bag cleanup |
| Coffers | `#/money` | Money: running plan and the recommendation | Earning methods: search, sort, filters, list |
| Lore | `#/reference`, `#/reference/:id` | Reference index | The chosen article (the first one by default) |
| Settings | `#/settings` (HUD slider button) | Sections index and version | Appearance, RuneLite, Progress and copies, App |
| Search | `/` or the HUD button | Oracle-style parchment dialog over the stage | |

Dialogs (Wiki dossier, world map, step image, search) and toasts use the same parchment, ink and gold.

## Feature parity

Presentation-only changes. No engine, dataset, storage format, store contract, bridge protocol, Electron or RuneLite plugin file changed (`git diff --stat d847cde -- electron runelite-bridge src/lib src/data src/services src/types src/store.tsx src/bridge.tsx package.json` is empty).

| Old control | Where it is now | Same handler |
| --- | --- | --- |
| Sidebar sections | Spine (7 links: Coffers is Money) | hash links |
| F2P / Members | HUD FREE / MEMBERS | `setMode` |
| Progress ring and quest points | HUD ring, links to Path | `useStore`, `useQuestPoints` |
| Bridge indicator, Launch RuneLite | HUD gem and its button | `BridgeIndicator`, `LaunchRuneLiteButton` |
| Search | HUD search, `/` | `SearchBox` |
| Zen / Inspector, Compact / Full workspace | HUD ZEN, INSPECT, COMPACT (FULL WORKSPACE while compact) | `setFeatures` |
| Always on top (Settings) | also the title strip pin | `desktop().setAlwaysOnTop` |
| Route rail and All stages drawer | The road on the left page | `select`, stage folding |
| Previous / Next step | Hotbar Q / E | `select` |
| Fix (status line) | Hotbar F, plaque | `usePrepFix`, else Preparation |
| Start the step | Hotbar S | `pointInGame` |
| Show in game | NOW card, hotbar G | `ShowInGame`, `navigate` / `pointInGame` |
| Done, Skip, Remove the mark | NOW card, hotbar seal, SKIP, U | `onDone`, `setStep` |
| World map | Route & game ribbon, hotbar M | `StepMap` (opens on request) |
| P / T / D drawers | P / T / D ribbons | `StepBody` views |
| Wiki dossier pinned column | Wiki ribbon | `WikiDock`, `setPinned` |

`PRESENT | MISSING | UNKNOWN` is untouched: the HUD shows "Levels not known yet" and "?" instead of a combat level when no levels are known.

## Test results

Baseline on `main` and the result on the branch, same machine:

| Check | Baseline | Branch |
| --- | --- | --- |
| `npm run build` | pass | pass |
| `npm test -- --reporter=dot` | 2297 / 2297 | 2297 / 2297 |
| `npm run check-data` | pass | pass |
| `npm run test:ui` | 749 checks pass | 748 checks pass |
| `npm run test:e2e` (isolated Electron, stub bridge) | not run | 92 checks pass |
| `gradlew -q testClasses` (JDK 17) | not run | pass, plugin untouched |

`scripts/ui-smoke.ts` changed only where it named the old shell. The step views are found as ribbons (tabs) instead of a "Step views" button row and P/T/D drawers. The Wiki pin is checked on the Wiki ribbon instead of a third column. The launch button is looked up in the HUD, and the sidebar checks became spine checks. The section-strip check reads the Journal switch and the Reference index. Checks that read the quest's item list, the readiness verdict or a bank action open the Preparation ribbon first, because those cards moved there from the old always-open column. The select-style check measures the surface token next to the select, since the pages define their own parchment token. One check was dropped: "Esc closes the drawer", because the P/T/D drawer no longer exists (P/T now switch ribbons, which is checked instead); that is the 749 to 748 difference. Every other functional assertion is kept.

One full unit run timed out once in `tests/fishingClimb.test.ts` (20 s limit) while other work loaded the machine; that file passed alone and the next full run passed 2297/2297. The file tests training logic the redesign does not touch.

## Visual fidelity

Compared against `concept-a-ledger.html` rendered by Chromium at 1440x900, then 1280x800, 1920x1080, 1000x700 and a 460x860 compact window.

- At 1440x900 the frame, HUD, spine, book, road, plaque, NOW card and hotbar sit within a few pixels of the reference.
- The stage is laid out 1:1 and grows with the window instead of being scaled with `transform`, so the Electron interface scale, the 90-150% text size and Windows DPI keep working. At 1440x900 both are the same picture.
- The reference clips its own ribbons (the page has `overflow: hidden`); here they stick out of the right page so the tabs can be used.
- The reference shows mock data. Real steps have longer chapter and step names, so stage headings can wrap to two lines and long road rows are cut with an ellipsis.
- Light and System themes do not change the Ledger: it has one palette. The setting is still saved and applies to nothing else.
- The Satchel drawer of the reference is a Settings spread here, because Settings holds profiles, backups, import/export and diagnostics that do not fit a 470 px drawer.
- Item and person tiles of the reference are initials; the app keeps its real item and skill icons.

## Screenshots

`docs/design-preview/ledger-*.png`: the built app at 1440x900 with the UI test's stub desktop and bridge and fictional progress (Journey, Skills, Journal, Provisions, Lore, Settings), and `ledger-reference-concept-a.png`, the supplied reference at the same size.

## Not verified

- RuneLite live: no game client was run. Bridge states were checked with the UI test's stub bridge only.
- The packaged portable EXE was not built.
