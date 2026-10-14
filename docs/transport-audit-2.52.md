# Functional audit 2.52.0 — travel shortcuts and transport preparation

Date: 2026-10-14. Baseline: 2.51.0 (`origin/main` 65aced5). Result: 2.52.0, branch `fix/transport-audit`.

Scope: the desktop app and the RuneLite companion plugin, with the transport pipeline first:
player state → eligibility → route comparison → preparation → bridge → in-game line → transport used → guidance resumes.
This was a functional audit, not a redesign: no new engine, store, item database or bridge transport was added. The planner (`travel.ts`),
the source router (`sourceRouter.ts`), the preparation payload (`prepEnvelope.ts`) and the plugin's existing plan, card and arrow carry everything.

## Environment

- App run from the repository (Electron 2.52.0, data in the portable data folder); RuneLite launched by the app with the built plugin on the
  classpath, never through the Jagex Launcher or another installation. World 316, account already signed in ("Click here to play").
- Character: free-to-play, Magic 25, Woodcutting 15, Chronicle in the bag, in Varrock Palace. Bank (as reported by the plugin):
  Law rune 0, Air rune 632, Fire rune 0, Chronicle 0, Bronze axe 1.
- The external monitor dropped during the session; 117 HD (OpenGL) stops presenting without a live display, so the game canvas froze white.
  117 HD was turned off for the test (CPU renderer) and turned back on afterwards. This is an environment effect, not an app defect.
- Real-account screenshots are kept locally (`Desktop\OSRS-audit-evidence-2026-10-14`) and are not committed.

## Defects found and fixed

| # | Where | Defect (root cause) | Fix |
|---|---|---|---|
| 1 | plugin ↔ app | The bank counts of runes, the Chronicle and axes were never reported (the OWNED event only counts watched names), so "withdraw it" could never be said and a missing rune looked unknown forever. | The transport things are added to the step's watch list (`transportWatch`, capped at the plugin's 64), tablets only for members. |
| 2 | app planner | A teleport that lacked runes was "locked" or "maybe" with no way forward: nothing said what to get, where, or what the stop costs. | `prepareFor` / prepared options: withdraw at the nearest bank when the bank is known to hold enough, otherwise buy where the source router says (shop for the game mode, else the exchange); only the remaining quantity; the stop time is counted in the journey. |
| 3 | plugin card | The recommendation was only in the Advice tab (see evidence 02/03): the closed main card showed nothing. | One travel line in the closed card, above the tabs: green for a way to use now, amber for "get this first". Details stay in the tooltip and the open list. |
| 4 | app | The target was the step's first place, not the confirmed quest line; a temporary arrow could have become the objective. | `transportTarget`: the plugin's confirmed, non-peeking quest line; otherwise the step's place. |
| 5 | planner | The Home Teleport counted as instant and as ready when the cooldown was unknown. | Cast time (19–25 ticks, 11.4–15 s) counts in the trip; an unknown cooldown is "check the cooldown"; the plugin now says whether it knows the cooldown. |
| 6 | planner | Standard teleports were offered on another spellbook. | The plugin reports varbit 4070; a non-standard spellbook locks them. |
| 7 | planner | Teleport tablets (members items) were suggested to free-to-play accounts. | Not offered, not watched, not bought for F2P. |
| 8 | planner | The Chronicle (untradeable) was "buy at the Grand Exchange". | Bought at Diango's Toy Store through the source router; the acquisition is labelled a shop in diagnostics and limits. |
| 9 | planner | Points underground (y > 4200) and instances were routed over as if on the surface. | Not judged: `skipped: off_map`. |
| 10 | wording | "Chronicle to by Champions' Guild". | Place names are cleaned (`placeOf`). |
| 11 | app | The decision was taken only on a 15 s poll. | Also at once on a teleport landing, a bag/bank change of a transport thing, a target change. |
| 12 | app | The app's tip and the game card were computed separately and could disagree. | The app shows the same decision as the card for the step shown in the game. |
| 13 | plugin (live) | After the shown step changed, the arrow of the previous step stayed: the card for "Talk to Reldo" (4 tiles away) said "~132 tiles" and pointed at the Champions' Guild. A stage arrow is replaced only when the new line has a tile. | A navigation target that belongs to another step (set by its stage, or carrying its id) is cleared when the step changes (`navOutdatedFor`). The player's own place is kept. |
| 14 | plugin (live) | When the card grew (wrapped heading, opened list, new stage) its last rows were drawn outside the background for a frame (real frame 2026-10-13 22:03:35). RuneLite's panel returns the size of its previous pass, and the card was painted with that. | On a rebuilt card the size is measured by a dry layout (empty clip, twice) before the background is painted. |

Developer diagnostics: `localStorage['osrs-put:debug-transport'] = '1'` logs one `[transport]` line when the decision changes and keeps the
latest at `window.__osrsPathTransport`: target and its source, walk, every candidate with state, journey, saving, the reason it lost
(`locked`, `short_on_hand`, `saves_too_little`, `better_way`), what it lacks with bag and bank counts (`[bank: unknown]` when not reported), and
every rejected preparation with its numbers. Nothing of it is drawn for the player, it holds no secrets, and it is not computed per frame.

## Transport scenarios

"Live" means observed in the running game through the app; "simulated" means the real planner, item data and source router with a fixture
position or bank (unit tests), plus the plugin's native rendering where noted.

| # | Scenario | Initial conditions | Expected | Observed | Result |
|---|---|---|---|---|---|
| 1 | Beneficial transport in the addon | Live. Varrock Palace, S5-01 (Champions' Guild, ~130 tiles), Chronicle in the bag | A line in the main card | 2.51.0: only under Advice (evidence 02, 03). 2.52.0: "➜ Use Chronicle → Champions' Guild · saves ~36 s · check charges" in the closed card (04); a click framed the Chronicle, the character did not move, the arrow stayed on the quest objective (05) | Fixed, live |
| 2 | Teleport lacks runes | Simulated (the account has no Law or Fire runes and stands in Varrock, so no preparation is worth it live; the live report rejects it with its numbers). Draynor, objective in Varrock Palace, Magic 25, bag empty, bank Law 1 / Air 3 / Fire 1 | Specific preparation | "Varrock Teleport saves ~32 s: withdraw Law rune, Air rune ×3, Fire rune at Draynor Bank"; arrow to the bank first | Pass (`transportLive.test.ts`, render `modern-travel-prepare.png`) |
| 3 | Partly owned | Simulated. As 2 with Air rune ×1 in the bag | Only the rest | "Air rune ×2" | Pass |
| 4 | Resource in the bank | Simulated (counts as the plugin reports them live) | Withdrawal, items framed in the bank | Stop "withdraw … at Draynor Bank"; the items join `bankWithdrawals` | Pass |
| 5 | Resource obtained | Simulated. Runes moved into the bag | Preparation disappears, spell ready | `transportKey` changes, the decision becomes "Cast Varrock Teleport → Varrock Square" | Pass |
| 6 | Transport used → guidance resumes | Live. S5-01 shown, Varrock Palace; the free Lumbridge Home Teleport cast by hand | The same quest line and objective from the new position; the way judged again | Landed at 3222,3219: the card kept "Guildmaster (Champions' Guild): ask for a quest", the arrow kept the Guildmaster, the distance went to ~145 tiles, the line was re-judged from the landing tile at once ("saves ~39 s"), the cooldown is now known (1745 s). The app tip showed the same decision ("Teleport: Chronicle to Champions' Guild (saves ~130 tiles, about 39 s) — check charges"). The existing "You are in Lumbridge: step is far away" note also appeared (07) | Pass, live |
| 7 | Canoe beneficial | Simulated. Lumbridge, S5-01, Woodcutting 15, axe in the bag | Canoe line | "Canoe Lumbridge → Champions' Guild · saves ~31 s"; with the axe only in the bank the stop costs more than it saves and nothing is shown | Pass |
| 8 | Requirements block | Live state + simulated | Never presented as usable | Live report: "Canoe Edgeville → Champions' Guild [locked] … Woodcutting 27 for Dugout (you have 15)", Varrock Teleport locked without runes; card shows neither. Magic 20: the spell is `locked` | Pass |
| 9 | Objective nearby | Live. Palace, S3-05 (Reldo, 4 tiles) | No transport | No line on 2.51.0 and on 2.52.0 | Pass, live |
| 10 | Objective changes | Live. S5-01 → S3-05 | Obsolete line and arrow cleared | 2.52.0 before the fix: line cleared, but the arrow and "~132 tiles" stayed (defect 13). After the fix: the plugin logged `nav done: cleared` for the Guildmaster, the card said "✓ Nearby", no line (06); back to S5-01 the line returned | Fixed, live |
| 11 | Disconnect / reconnect | Live. RuneLite restarted through the app (twice), logged in again | Unknown, then reconciled | Logged out: `skipped: no_position`, no line, no tip. Logged in: the position and the bank counts came back (Air rune 632, Law 0, Fire 0, Bronze axe 1 — reported, not assumed) and the decision was recomputed | Pass, live |

## Other systems checked

- App pages (Path, Skills, Gear, Shopping, Journal, Settings, Reference) in the running app: no console errors or warnings.
- Live evidence (local only): 01–03 before (2.51.0), 04 the line in the main card, 05 the click framing the Chronicle, 06 the objective change
  with the arrow cleared, 07 guidance after the Home Teleport.
- UI smoke test in an isolated browser profile (334 checks): passed, including profiles (own / other character), the quest cursor moving on
  STATUS, section strips at every width.
- Profiles, import/export and file backups: covered by `progress.test.ts` and `progress-files.test.ts` on temporary data; the real profile was
  not used as a fixture. A copy of the real data folder was taken before the session (`Downloads\OSRS-Put-data-backup-audit-20261014`).
- Data: `check-data` 0 errors, 0 warnings.

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | passed |
| `npx vitest run` | 946 passed (71 files) |
| `npm run check-data` | 0 errors, 0 warnings |
| UI smoke (Edge) | passed |
| Java: `gradlew test` (full suite) | 477 passed, 0 failed |

## Limitations

2.53.0 addressed the Chronicle charges and the upstairs and Grand Exchange banks below, and added the road's supplies and staves: see
`docs/travel-supplies-2.53.md`.

- Law runes have no free-to-play shop in the item data (all law rune shops are members-only); for F2P the source is the Grand Exchange, so a
  Varrock Teleport preparation is offered only when the bank holds the runes or the exchange is on the way.
- When the bank was seen but a rune was not reported (an older plugin, or a watch list cut at 64), the bank count is unknown: the preparation
  then says where to buy, not "withdraw". It never claims the bank is empty.
- Chronicle charges are not visible to the plugin: the line always says "check charges".
- Banks on upper floors (Lumbridge Castle) and the Grand Exchange bankers are not preparation stops: the planner knows ground-floor banks only
  and does not model stairs. From Lumbridge the nearest stop is Draynor or Al Kharid.
- After the Home Teleport test the character stays in Lumbridge (it was in Varrock Palace) and the Home Teleport is on its 30-minute cooldown.
- Using the recommended Chronicle in the live test would spend a charge (a teleport card costs 150 coins); it was not used. The free Home
  Teleport was used instead for the "transport used" scenario.
