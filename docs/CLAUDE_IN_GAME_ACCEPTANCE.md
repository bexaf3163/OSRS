# In-game acceptance — assigned to Claude

Owner decision,2026-10-24: Codex finishes implementation and automated verification; Claude performs in-game tests. These are deferred acceptance tasks, not passed checks and not a blocker requiring the owner to test now. Read CLAUDE_NEXT_SESSION.md for the exact current source, EXE and remaining work before starting. Older preview evidence does not apply to newer code.

## Setup and preservation

1. Record the installed app/plugin/protocol versions and current character, mode, active step and relevant real levels. Preserve the player's saves, notes, skips, selected plan and equipment. Use the latest named verified portable and confirm its SHA256 against the handoff/release.
2. Launch RuneLite through OSRS Path, not directly or through Jagex Launcher; the app supplies its plugin. Owner previously authorized Play/World316 without entering credentials. Recheck present conditions; never invent a login or disclose credentials.
3. Exercise the companion while the player controls movement/combat/skilling. Do not add gameplay automation. Do not spend coins, sell/drop protected items or change permanent progress just to force a test. Use isolated fixture profiles for impossible states; label those as simulated.
4. A completed quest or unreachable skill scenario cannot be claimed as live-tested. Record the limitation and retain its automated evidence; do not grind hours or replay completed quests to manufacture acceptance.

## Current Ranged preparation

- At reachable levels, confirm desktop, checklist, guide card, navigation and NPC highlights show one current trainer. Earlier bug: equipped arrows plus already banked frog food reverted to monks. Confirm the bank withdrawal remains visible and the selected plan is stable.
- Confirm owned usable shortbow/longbow and compatible ammunition count before suggesting purchases. Banked equipment requires taking/equipping; unread bank rows remain unchecked.
- A worn stack100 ->99 must not request immediate replenishment. At20 it remains usable; below20 the refill target becomes100. Observe naturally or use isolated fixtures, without wasting player items.
- Mixed arrow types cannot satisfy one equipable stack. A basic bow cannot accept arrows above its cap; an unusable higher bow cannot satisfy the kit.
- The generic Seagull name highlights other variants too: starter instructions select level3 explicitly. Verify actual NPC placement and directions; do not assume a name highlight proves the correct level.
- Verify later food withdrawal and low-food/health warnings, and safe fallback when food is absent. Check actual attack style and any Defence-restricted instructions. No whole-goal survival prediction is currently promised.

## Magic preparation

- At reachable levels, verify the named Strike, actual rune types/counts and unlocked level match. Wind is the budget fallback; a higher Strike needs confirmed owned ingredients. Select the stated autocast manually when supported.
- Confirm an elemental staff only removes its own rune type and must actually be worn. Banked staff, unread stock and missing runes must not become falsely ready. Remove metal armour and confirm hits/XP; worn Magic attack/weakness simulation is still incomplete.
- If Magic43/Smithing15 are actually available, test Superheat with unnoted iron, nature/fire runes or worn Staff of fire. A partially consumed castable bag remains usable; zero ore/runes asks for another batch. Bank coal first to avoid producing steel.
- Switching combat -> Superheat clears Cow/Chicken highlights and uses the bank destination. Desktop, prep snapshot and single guide must agree.
- Alchemy and splashing remain manual alternatives, not automatic ready defaults. Alchemy needs chosen expendable targets and full costs; splash needs verified negative Magic attack and a location outside the Lumbridge no-XP area. Do not test by destroying valuable gear.

## Other route and travel checks

- Fishing50 -> unfinished Cooking50; Mining60 -> unfinished Woodcutting60: current tool, supplies, destination and highlights advance together. Unknown second skill cannot complete the step or keep the old arrow.
- S4-03: current adopted Defence/armour/trainer plan, usable equivalent owned armour, food and Attack40 goal; no restored50-bone quota or compulsory cow grind. Keep explicit restricted builds intact.
- Teleports/canoes: compare actual current unlocks, all required supplies, bank/shop/GE detour, cooldown and return route with walking. Missing one rune must not hide another missing component. Do not infer a usable boat/canoe from a map label alone.
- Ancient Guardian and other completed fights: verify reachable preparation/entrance guards if possible; do not claim encounter acceptance without observing it. Food/gear advice must appear before danger, not after entering.
- Funding/Shopping: banked stock, unread stock, real cash and completed sales; missing tool plus inputs; GE collect-to-bank; return to the original active step after an earning detour. No expected drop or self-transfer counts as earned coins.

## HUD, lifecycle and desktop correlation

- One guide card only; collapsed/expanded, warning, prep, ready and unknown states. Inspect long English text, fonts, clipping, clicks, saved position and Alt-drag at supported game sizes/DPI. Critical risk must outrank an optimization tip.
- Normal login/logout, world hop, disconnect/reconnect and app/plugin restart: no other account's levels, stale items or old async response may overwrite current state. Unread banks must not become empty.
- Check matching app Path/Skills/Gear/Shopping/Money/Journal/Settings states; labels, navigation, scrolling and disclosure must remain usable. Screenshots must show the same actual state being compared, with character/private details hidden before sharing.

## Evidence and handoff

For each scenario record exact source/EXE/plugin versions, initial real state, actions taken, expected versus observed result, screenshot/log location and PASS/FAIL/NOT REACHABLE. Separate automated, fixture-rendered, actual desktop and actual RuneLite evidence. Restore reversible settings/active step. Report regressions with a minimal reproduction and fix/retest before marking that scenario passed. Never turn an unobserved case into PASS because unit tests passed.

## Results log

### 2026-10-24 — setup record and live-session evidence (Claude)

- **Setup (item 1), observed:** the player ran OSRS-Put 2.74.5 portable from Downloads, after an in-app update from 2.74.4 at 16:41. Plugin 2.74.5, protocol 6, Java 17.0.19, Windows 11. Saves read only: 44 steps done, last S5-07, active S5-08; Strength 24 during the Elvarg fight. No settings, saves or items were changed.
- **Source:** plugin telemetry `~/.runelite/osrs-path-telemetry/session-20261024-164144.jsonl` (`npm run telemetry`), plus the player's screenshots. This is actual RuneLite evidence, not a fixture.
- **FAIL, fixed afterwards, re-test pending:** list stalls on S5-04 (Oracle), S5-05 (Wormbrain line 14 min 31 s, the "Map part ×3" stage item), S5-06 (no completion signal; manual close recorded), S5-07 (no completion signal), S5-08 (33 min on "kill Elvarg" after a death, no way back). Fixed in 2.74.6 (S5-04..S5-07) and 2.74.9 (S5-08 return route).
- **Observed, not a PASS claim:** Elvarg fight warnings and food. Dragonfire was absorbed by the worn shield; lobsters were eaten. The player died once, respawned in Lumbridge, and was back in the Crandor dungeon at 17:34 (plugin shot `shot-20261024-173457-stage_cursor_3.jpg`, collapsed one-card HUD).
- **Open (needs the player in game):** Ranged/Magic preparation, travel and teleports, HUD expanded states and long text (telemetry flags lines of 107–201 characters), and the login/logout/world-hop lifecycle. None of these has been observed yet.
- **Earlier sessions today (telemetry 2.74.3 / 2.74.4):** every STUCK, SLOW_LINE and manual close is in Dragon Slayer: S5-01 Guildmaster line 1 (6 min 50 s, closed by hand), S5-03 maze front door, red door (39 min) and magenta door / lesser demon (12 min + 8 min), S5-04 Oracle (16 min). Fixed in 2.74.4 (maze machine), 2.74.5 (demon runes), 2.74.6 (Oracle) and 2.74.7 (questions machine). No stall outside Dragon Slayer in today's logs. Re-test pending.
