# Consolidated audit backlog and Gemini disposition

Audit baseline: 2.73.0, `0b9e2a2262166898efe40d9fe374591869d32819`. Implementation baseline: Claude's 2.74.0, `4be6f94f20489a2bf711be45570f7cf168e8c6d4`.
This is the English implementation ledger for the independent audit and comparison of all 30 Gemini finding groups. It is not a command to apply Gemini's proposed patches verbatim. Reproduce each finding against the current tree before changing it.

Current baseline/evidence and next actions are in [CLAUDE_NEXT_SESSION.md](CLAUDE_NEXT_SESSION.md); older implementation details remain in [the stabilization handoff](CODEX_STABILIZATION_HANDOFF.md). Release2.74.3 is published with current skill/preparation, pricing, native read/copy diagnostics and owned-input GE pacing repairs; full main/Release gates pass (CLAUDE_NEXT_SESSION.md). Earlier2.74.2 repairs are retained: S4-03 is Attack40 without a bone quota, surface frogs/early Defence are compared, and Gear/Skills quest evidence, Shopping scope and HUD collection semantics are repaired. Broader work below remains partial; do not resurrect closed S4-03 goals from historical examples. **Partial means acceptance remains open.** No entry promises zero regressions.

## Work items

| ID | Priority | Current scope/status |
| --- | --- | --- |
| T01 | P1 | Recovery/migrations, profile validation and conflict resolution, physical write/read-error reporting, protected backup admission and retry/history persistence are implemented. Published2.80.9-11 add skipped-copy diagnostics, receipt-based history persistence and pre-write external revision guards with retained external bytes. Native source and published portable gates pass; see current receipts/limits in CLAUDE_NEXT_SESSION.md. The guard is not a watcher, automatic merge, cross-process atomic lock or power-loss guarantee. Do not reopen completed conflict/history/skipped-copy work from older handoffs. |
| T02 | P1 | Update digest verification implemented/tested. Real isolated two-version update **passed** (Claude, 2026-10-24): published 2.74.4 → 2.74.5 on a disposable Windows runner, [run 40103727432](https://github.com/bexaf3163/OSRS/actions/runs/40103727432), `update-test.yml` + `.github/scripts/test-update.cjs`, 13/13 checks. Cancellation/partial-download/retry paths beyond the unit tests remain open. Claude 2.74.14: download cancel (banner, `update:cancel`), Try again after a failed download, and the real download path tested on early close, drop, wrong bytes, cancel and retry; that retry test found and fixed a race where a failed download's late cleanup removed the retry's `.part`. Open: live cancel on a real update. |
| T03 | P1 | Additive exact counts, conservative legacy tool aggregation, notes/usable separation and per-row combat loot/food bank certainty implemented/tested. Unreleased tool block projects method tool needs and preserves uncertainty for unreported usable family tiers; cumulative 1,830-test/browser/Java/portable CI passes on 9f37646f (CODEX_METHOD_TOOLS_HANDOFF.md). Exact-ID, remaining legacy consumers and complete eligibility parity remain open. Claude 2.74.14: members tool tiers (Dragon, Infernal, 3rd age, Crystal, Gilded) do not count on an F2P account (app) or a free world (plugin, Dragon), and are named "members only". Open: charge/quest gates of special tools (none on the F2P route). |
| T04 | P1 | Fingerprint, logout clearing, profile gating and delayed status/event guards implemented; final native/live lifecycle acceptance remains open. Claude review 2026-10-24: every acceptance case except the live lifecycle has a test (two characters, same-size quest sets, unknown vs known-empty equipment, logout/character change/reconnect rejecting old facts). Open: live world hop/logout acceptance. |
| T05 | P1 | Skip vs hard prerequisite, live quest precedence, eligible next-step selection, Fairytale II partial scope and reached pure-skill producer equivalence implemented/tested. Unreleased 2.74.3 removes Account Sync's unproven ancestor expansion and aligns dependency labels with blockers; final-code browser/unit/Java/portable CI passes (CODEX_PROGRESS_PROOF_HANDOFF.md). Equivalent acquisitions, consumer-specific subsets, cursor/branch and live acceptance remain open. Claude 2.74.14: an item-acquisition producer (completion = owning items) is met for its consumers when the game confirms the items (lower bound, worn counts); positive only, never from a name shared by several IDs (map pieces). Open: Shield of Arrav gang cursor (S3-05, optional co-op). |
| T06 | P1 | Shared demand ledger, healing/physical food allocation, actual withdrawals and cleanup protection implemented.Published2.80.13 extends the existing engine with confirmed optional quest-entry food, aligned Shopping/funding protection, and physical alternative/notes labels in TS/Java. Existing global food budgets and future previews remain unchanged. Published2.80.16 aligns declared non-healing material alternatives, reservations, exact withdrawals and already-calculated acquisition deficits; see the authoritative handoff. Broader phase-specific/heterogeneous acquisition, known-mode food usability and goal-wide future purchases remain open; current verification/publication status is in CLAUDE_NEXT_SESSION.md. |
| T07 | P1/P2 | Recipe deficits, unnoting, physical potion slots and confirmed Waterfall phase scoping implemented. Other phase inventories and full acquisition/allocation/live parity remain open. Claude 2.74.14: Demon Slayer has keys/bones/fight loadouts on its line keys; the 25 bones no longer block the drain phase. Lost City (axe from the dungeon, runes, teleport) and Monkey Madness (four loadouts) were already phase-correct. |
| T08 | P1 | Payload limits and queued apply ordering/server-lifetime guards implemented/tested; broader wire/account restart acceptance remains open. Claude review 2026-10-24: bounds, Unicode, large lists, reordered applies, restart with the same sequence and partial envelopes are all tested. Open: live restart only. |
| T09 | P1 | Real stalled-reader reproduction, bounded async SSE output, expiry and current-completion replay implemented/tested; exact-tree CI passed. Real frame-time and telemetry-cost acceptance remain open. Claude 2.74.14: heartbeats log client FPS and our overlays' average/worst draw time; the session report prints a Frames line. The next real play session is the measurement. Server tick spacing in the 2.74.3-2.74.5 sessions: p50 600 ms, p99 627 ms (not a frame-time proof). |
| T10 | P1 user impact | Combined-objective order/XP, stock-complete alternatives, dose allocation, loot-trip minimum and unscheduled-income exclusion implemented. Shared food projection includes remaining required collection after the XP goal; confirmed food can cover a trip while unread alternatives cannot justify purchases. Catalogue, full joint packing/cost/gear and live comparison remain open. Claude 2.75.0 (2026-10-25): spot registry (trainers.defs.json, wiki spawns by route steps), barbarians/Al Kharid warriors/monks/Brutus, per-spot bank trips, loot banked when it pays (GE after tax, restriction respected), one plan per spot, compact one-answer UI. Claude 2.76.0: Skills combat methods (melee/Ranged/Magic) ranked by the same model for the character's levels and worn gear, with drops (GE after tax, when they pay) and arrow/rune costs; Skills page and fight plan agree. Claude 2.78.0: Woodcutting/Fishing/Mining by the same engine (wiki success charts, tools owned, best spot incl. bank trip, aggressive NPCs, objective-aware bank/drop, bounded coin baseline). Claude 2.78.1: costs ranked in both rankings (food in fight plans, consumables on Skills, one supply price: GE else eligible shop else unknown), objective-aware, bounded baseline, explicit members, forecast re-rated, content-contract tests. Claude 2.78.2: gathering tool upgrades weighed against the hours saved; underground spots (Dwarven Mine) with their way in; Money and Skills time all gathering money methods with one engine. Claude 2.79.0: Smithing/Cooking/Crafting on the processing engine (wiki recipes and stations, calibrated to the wiki guide rates). Claude 2.79.1: Money smelting methods timed by the processing engine. Claude 2.79.2: tracked plans pause quest preparation; the card shows the followed method with gp/h. Claude 2.80.0: cook on the spot (fishing + fire as one plan when both goals come sooner). Open: Firemaking/Runecraft/Prayer/Magic utility, combat gear-upgrade variant, food choice, roadmap "now" vs personal pick. |
| T11 | P2 | Skill upper-bracket availability, selected-leg actions and unknown-supply ranking repaired. Combined Fishing/Cooking handover passes full automated/portable CI81c707a0. Mining/Woodcutting handover has current tool/scene projection and full CI40069903948 including browser/portable passing (CODEX_SKILL_HANDOVER_HANDOFF.md). Low Ranged/equipped-quantity and Superheat fixes pass full CI40085079335 including browser/portable. S6-04 spell-dependent batches/manual setup guards pass full cumulative CI40089273395 including browser/portable (CODEX_MAGIC_ROUTE_HANDOFF.md). Full spell budget, ranged consumption/other weapons, verified rates, actual fight style and broader Gear coverage remain open. Gear excludes future-average current-DPS downgrades and labels current versus training benefit. Claude 2.74.14: the Ranged step says one shot in five loses its arrow (OSRS Wiki, Arrows) and to pick the rest up. Claude 2.74.18: the whole-goal arrow count is in (foes' standard ranged defence and F2P bow/arrow/armour bonuses from the wiki infoboxes, wiki ranged formulas, `lib/rangedAmmo.ts`). Open: Ranged prayers/potions, Ava's devices (members). |
| T12 | P2 | Separate tool/input preparation, affordable batches/replenishment, known-total proceeds and owned-input purchase pacing implemented; cumulative CI40089273395 passes. GE window modelling, complete travel and live acceptance remain open. Claude 2.74.14: a route shopping batch above the live four-hour buy limit says how many rounds it takes. |
| T13 | P2 | Review every route step as a continuous feasible progression: in progress (Claude). Live Dragon Slayer stalls fixed (2.74.6: S5-04..S5-07 machines/triggers, used-up stage items). Route scans fixed S5-01 early completion and S7 boss food (2.74.7) and added the stage-check/kit invariant test. Tile-less conditional lines outline only the nearest copy of a shared ID (unreleased). Open: S3-05 without a machine, live acceptance. |
| T14 | P2 | Claude's single HUD retained; health/disclosure corrected. Path simplification and live visual acceptance remain open. Claude 2.74.12-2.74.13: Skills is guide-first (Training guide tab with the roadmap in place), cockpit list fade, one Settings entry on wide windows, every guide-card line at most 225 characters. |
| T15 | P1 | Java/browser/packaged-EXE gates added; actual Windows packaged E2E passed. Full release/live acceptance remains broader. Claude 2.74.14: the packaged E2E reads BridgeServer.class from the plugin jar inside the unpacked portable and requires this release's version. |
| T16 | P2 | Compatible source-map/cache/Vite lock updates and advisory exposure assessment implemented; fresh-install cumulative CI40089273395 passes. Eight propagated moderate builder entries remain tracked with no upstream sprintf-js patch. Claude 2.74.14: five new advisories (Electron 44.9.3, undici 7.30.1, Vitest 5.0.5, fast-uri 3.1.9) fixed with compatible lockfile updates; `npm audit` reports 0. |
| T17 | P2 | This ledger and handoff added; broader docs/shared regression coverage remain open. Claude 2026-10-24: this table and CLAUDE_NEXT_SESSION.md carry the 2.74.13-2.74.14 work. |

P1 is a stabilization priority, not a claim of a reproduced P0 exploit. Large items must be split into small changes with specific acceptance evidence.

### T01 — progress recovery

Validate each source before comparing timestamps. Do not manufacture a fresh timestamp for corrupt fallback state. Distinguish valid/missing/invalid/unsupported, retain damaged originals, reject future formats, migrate dependent task keys, and validate profiles before mirroring them.

Acceptance: corrupt browser/valid file; corrupt file/valid browser; both corrupt; fresh install; future schema; V1/V2/V3; second profile; unavailable storage; explicit import/reset; cross-window invalidation; restart after recovery. Do not test on the player's only save. Parser tests alone do not establish native recovery.

### T02 — update integrity

Verify trusted SHA-256 for new and cached bytes and immediately before handoff. Size alone is insufficient. Explicitly handle missing digests, partial downloads, cache replacement, retry and cancellation. Preserve delayed portable startup, path validation and data location. Test an update between isolated EXEs before claiming the real update flow verified.

Done (Claude, 2026-10-24): `Update test` workflow (started by hand, `from` input) downloads the older published portable EXE and checks it against its published digest. The older app marks a step through its own UI, finds the latest release, downloads it and verifies the SHA-256, then installs and hands over. The newer app must start by itself, delete the old EXE and `update-cleanup.json`, keep `progress.json` byte-identical, report its version, offer no further update and leave no quarantined files. First green run: 2.74.4 → 2.74.5, run 40103727432. Never run it on a player machine: the apps show windows and dialogs on that desktop.

### T03 — exact items and usable requirements

Java must publish exact container/ID/form quantities. Do not publish one higher tool as multiple lower-tool facts and then substitute again in TS. Define owned, usable now, equipped, bank, noted and unknown separately. Apply substitutions once, with level and mode constraints and consistent tables.

Acceptance: one Rune pickaxe remains one physical item under any watch list; unusable tools do not satisfy readiness; noted Salmon counts for ownership but cannot be eaten; unnoting is an explicit action; exact item requirements remain exact. Establish shared Java/TS fixtures and mixed-version compatibility before changing protocol semantics.

### T04 — snapshot and session freshness

Identity, quest-set contents and known/unknown state must invalidate derived snapshots. Decide the position contract explicitly; do not remove funding's working position polling without a replacement. Separate connected plugin from logged-in character. Clear or label stale facts on logout/account change and respect the profile gate.

Acceptance: two characters with otherwise identical facts; same-size different quest sets; unknown-to-known-empty equipment; logout while SSE remains open; world hop; reconnect; delayed event/status from an old session. Fingerprint collisions were reproduced; widespread live account mixing was not established.

### T05 — skip, completion and milestones

Route closure is not proof of a hard game prerequisite. Live NOT_DONE must not become done because a step was skipped. Separate quest completion, selected partial milestone, route goal and carryover. Preserve manual fallback when facts are unknown. Apply a partial quest's end milestone to its machine, overview, supplies, threats and HUD.

Acceptance: skipped prerequisite; manual done contradicted by live facts; completed quest but missing additional supplies; Fairytale II partial goal; Shield of Arrav branches; reconnect cursor recovery. Do not repeat a completed quest to acquire an item or globally deduplicate by title and tile.

### T06 — allocated shared reserves

Resolve requirements from the selected route and adopted skill/combat plan, including carryover, completion goals and quest-machine items. Add independent consumable demands; reuse tools; avoid counting the same demand twice. Reserve a selected sufficient anyOf alternative, rather than none or every alternative.

Acceptance: independent 10+15 consumables reserve 25; one tool for two steps remains one; alternative food is protected; changing an adopted plan changes reserves. Preserve existing food protection. The app must not sell or discard items automatically.

### T07 — executable preparation quantities

Recipes use the remaining quantity, not presence of one ingredient. Bank actions subtract usable bag items. Potion slots use actual selected bottles/doses. Separate current phase, next trip and whole goal. Later-phase requirements must not block an earlier phase. Compare food healing and available slots together.

Acceptance: 1 of 3 ingredients; bag 1 + bank 1 for a need of 3; Potion(1)/(2)/(3)/(4); full bag; notes; phase change; alternative healing; unread bank. App and HUD must show the same action and amount. Do not replace complete-snapshot `every` checks with `some`.

### T08 — limits and apply ordering

Use UTF-8 bytes and endpoint-specific limits; preserve explicit payload rejection independently of offline state. Cover requests, responses, event frames and large actual snapshots. Check monotonic sequence at apply time on ClientThread, not only when queued. Account for restart/session lifetime and rejected parts.

Acceptance: exact bound and one byte above/below; Unicode; large shopping/watch lists; reordered concurrent applies; app/plugin restart; partially rejected envelopes. The alleged infinite two-second OFFLINE retry chain was not confirmed and is not an implementation requirement.

### T09 — SSE backpressure

Reproduce a stalled/slow reader first. Move blocking output to bounded queues of immutable DTOs; retain important-event ordering, coalesce replaceable state appropriately, limit connections and disconnect stalled clients. RuneLite API reads remain on its permitted thread. Desktop buffer limits do not solve this Java game-thread issue.

Acceptance: a stalled reader does not stall game ticks or grow memory indefinitely; STEP_AUTO_COMPLETED is retained; reconnect obtains current state. Measure before/after frame time before claiming FPS improvements. Telemetry rendering also needs measured validation.

### T10 — complete combat alternatives

Remove the artificial Cow/Minotaur/Hill Giant comparison ceiling using verified accessible foes/locations, rather than an unvalidated encyclopedia. Compare total combat, equipment acquisition, travel, banking, food, potions, loot capacity and item goals. Consider already-owned bones and the joint benefit of Defence plus equipable armour; retain explicit restricted builds.

S4-03 acceptance: current stats/XP/gear/cash compared across XP-first, bones-first, separate collection/purchase, gear upgrade and allowed Defence-first plans. Report candidates actually considered, time/food ranges and confidence. The number 725 is not itself proof of a wrong calculation; prove that the selected plan is useful. Show one recommendation, with details disclosed, and avoid plan churn on every tick.

### T11 — Skills and Gear

Separate unlock requirements from suggested training ranges so an effective unlocked method does not disappear at an arbitrary upper boundary. Include budget, tools, mode, location and realistic rates. Gear must compare the active foe/style, equipability, owned-before-buy options and cost per actual benefit; distinguish defensive improvement from faster damage and future benefit from current benefit.

Acceptance: strength vs power amulet at different max-hit breakpoints; chain vs plate against the actual attack type; no target; unread bank; no cash; an owned upgrade; supported ranged/magic sets. Do not expose tables of every bonus by default.

### T12 — funding and travel

Prepare tools and inputs as separate required actions. Distinguish an immediate purchase batch from a four-hour GE rate limit. Track actual proceeds across bag/bank without treating self-transfers as income. Evaluate the complete acquisition detour for all missing travel supplies, with restrictions, stale prices and uncertainty retained.

Acceptance: poor F2P account; unknown bank; sale restrictions; missing tool and inputs; GE collect-to-bank; price drop/outage; all teleport runes; cooldown/spellbook; cancellation and return to the original route. Reuse the existing engines.

### T13 — whole route

For every current route step, record proven entry requirements, costs, preparation/risk, available alternative, resulting state, retained resources, completion and next admissible step. Consider quest rewards before grinding, F2P-to-Members transition, spells, Lost City, Attack 60, QP forecasts and optional money/bond goals. Derive step counts from data rather than assuming the audited 67 is permanent.

Acceptance: fresh F2P; the user's poor existing account; partially completed quests; Members; optional skips. No unfunded compulsory purchases, hidden level assumptions or loss of marked progress. Preserve IDs; any reorder needs migration and old-save tests. Recheck current game facts against appropriate authoritative sources.

### T14 — minimal UI

One current action, one readiness summary, one primary action; reveal secondary detail. One persistent expandable guide. Keep Money separate, default Shopping to the next trip and Gear to one useful change. Critical risk outranks an optimization tip.

Acceptance: actual desktop and RuneLite; narrow/wide windows; DPI 100/125/150/200%; zoom; both themes; long text; offline/unknown/ready/missing; disclosure, clipping, fonts, alignment, focus and click regions. Compare equal-state screenshots and computed CSS. Test renders are not game screenshots.

### T15 — release artifact gates

Require build/TypeScript, validator, Vitest, full Java and browser UI at the release SHA, then native E2E of the actual portable artifact alone in an isolated directory. Verify app/JAR/protocol, RuneLite launch through the app, plugin connection and post-update recovery.

Acceptance: a failed Java or UI check blocks publication; tested and published EXE bytes match; report SHA, versions, counts and untested live cases. Source Electron E2E is not packaged acceptance.

### T16 — dependency advisories

Identify root advisory chains and reachable runtime/build contexts. Package-entry counts are not exploit counts. Make the smallest compatible dependency/lockfile updates, rebuild and rerun the relevant gates. Document any justified residual advisory. Do not run `npm audit fix --force` or dismiss bundled dependencies solely because they are in devDependencies.

### T17 — documentation and regressions

Keep README, project map, handoff and model limits current. Specify the owner of raw inventory, usable requirements, allocated reserves, chosen plan and displayed action. Add shared fixtures and cross-system regressions for the preceding tasks, and a short decisions/known-limitations record. Clearly distinguish implemented, unit-tested, browser-observed, native-observed and live-game-observed.

## All Gemini groups: disposition

| Group | Audit result and retained action |
| --- | --- |
| CRIT-01 | Real size/unit mismatch (T08); alleged infinite retry chain unconfirmed. |
| CRIT-02 | Confirmed duplicate tool substitution/counting (T03). |
| CRIT-03 | Confirmed notes treated as usable in consumers (T03/T07). |
| CRIT-04 | Partial: reserve/carryover gaps (T06); preserve existing protections. |
| CRIT-05 | Partial: synchronous SSE writes are real (T09); per-frame disk flush/freeze claims overstated or unmeasured. |
| CRIT-06 | Partial: unknown observations need specific quest scenarios (T05); fallback exists, unused quest operation does not establish a current crash. |
| ARCH-01 | Partial: reverse provider effects exist; equal-pick guards exist too. Profile before redesign. |
| ARCH-02 | Partial: large context exists; four simultaneous unconditional polling loops do not. Preserve working data sources (T04). |
| ARCH-03 | Real snapshot receive/apply race (T08); immutable volatile overlay Hits already exist. |
| ROUTE-01 | Confirmed skip/prerequisite conflation (T05). |
| ROUTE-02 | Partial: quest completion differs from remaining route goals (T05); AccountSync already has reconciliation mechanisms. |
| ROUTE-03 | Mixed: hard blockers need work (T05). Existing cash can legitimately satisfy a cash goal; a level alone does not prove a lamp was used. |
| QUEST-01 | Confirmed partial Fairytale II milestone inconsistency (T05). |
| QUEST-02 | Partial: cumulative keys, branches and delivered-state recovery need individual scenarios (T05). Universal permanent blockage unproven. |
| QUEST-03 | Partial: repeated fragments exist; exact claimed count unconfirmed. Use stage/branch identity, not global title+tile dedup (T05). |
| ITEM-01 | Partial: anyOf/healing/reserve inconsistency (T03/T06/T07); normal cleanup does not simply sell all food. |
| ITEM-02 | Confirmed recipe quantity, potion slot and phase problems (T07); every-to-some proposal would break complete-report semantics. |
| ITEM-03 | Mixed: independent reserves, tool+input setup, bag-only proceeds and GE batching need fixes (T06/T12). Named tripWay/pickNearest/pairTransitions paths are absent; Home Teleport is already excluded from reachTiles; maxHit0 patch does not match the function. |
| BRIDGE-01 | Partial lifecycle/deprecation follow-up (T04). qh-steps is deliberately loaded runtime data: do not delete it from the JAR. |
| PERF-01 | Measure cold start/heap before prioritizing eager imports or bundle size. Chunk splitting alone is not lazy loading. |
| PERF-02 | Profile repeated calculations and synchronous desktop reads. Cache keys must include real inputs; measured lag was not established. |
| PERF-03 | Profile scene scanning, layout/render and GC. Predicted frame spikes are not measurements. |
| UX-01 | Structural duplicate readiness confirmed; actual visible density must be observed (T14). JSX component count is not visible-card count. |
| UX-02 | Much is stale: CurrentAction/StepWorkspace and Inspector are used. Verify settings rather than deleting working paths (T14). |
| UX-03 | Low-priority wording/diagnostic-ID presentation. Preserve the project's English UI policy; no blanket localization rewrite. |
| CSS-01 | Mixed: layering/breakpoint debt exists; claimed border overrides/contrast values do not match current tokens. Inspect computed styles (T14). |
| TS-01 | Real type/boundary-validation debt, not evidence that every cast is broken. Change event types around concrete acceptance scenarios (T17). |
| SEC-01 | Confirmed update cache integrity defect (T02); existing safeForCmd mitigations must stay. |
| SEC-02 | Claimed Origin:null hole disproved: any present Origin is rejected. Connection/executor resource limits are a separate risk (T09). |
| PERSIST-01 | Mixed: future version and V2 task-prefix issues confirmed (T01). Named deleteProfile path is absent and rejected wiki requests are removed from cache. |

## Working and release procedure

1. Inspect current HEAD and reproduce one concrete defect; do not copy old line numbers blindly.
2. Use disposable saves and isolated native test directories. Preserve the player's data.
3. Keep a focused implementation and meaningful regression cases. Do not introduce another state, economy, bridge or recommendation engine.
4. Run checks appropriate to the change, then T15 before release. Keep live and simulated evidence separate.
5. Owner assigned in-game acceptance to Claude: launch RuneLite through OSRS Path; game actions remain player-controlled. Codex does not claim those deferred tests passed. Do not mark completed quests replayed when they were not reachable.
6. Record remaining acceptance and rollback before continuing Claude's old blocks 2b–5. Do not merge/release solely because an audit or draft PR exists.
