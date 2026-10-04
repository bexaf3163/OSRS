# OSRS «Путь» — MASTER PROJECT GUIDELINES & AGENT INSTRUCTIONS

## 0. PURPOSE

This is the single consolidated operating contract for Claude Code working on OSRS «Путь».

Use it together with the task-specific prompt being executed.

Do not resurrect, repeat, or re-implement completed work from older prompts unless the current task explicitly requires modifying it.

The goal is to save tokens while preserving correctness, compatibility, and implementation quality.

## 1. COMMUNICATION & TOKEN OPTIMIZATION

- Always respond in concise English.
- Do not repeat the user's request.
- Omit conversational filler and obvious explanations.
- After implementation, normally report only changed files and verification results in 1–2 sentences.
- Keep terminal output quiet where possible.

Prefer:
`npm run build`
`npm test -- --reporter=dot`
`npm run check-data`
`cd runelite-bridge && ./gradlew -q testClasses`

If a command fails, capture enough output to diagnose and fix it, then rerun the relevant check.

## 2. INSPECT BEFORE EDITING

Before changing code:

1. Inspect the existing implementation.
2. Identify the real current architecture.
3. Find existing state, bridge, readiness, overlay, navigation, and data systems.
4. Reuse existing functionality.
5. Do not create parallel implementations.

Do not assume a feature is missing because it is not obvious from one file.

Do not rewrite working systems, replace state engines, create duplicate APIs, create a second bridge transport, duplicate item databases, or migrate architecture without a concrete reason.

Prefer focused surgical diffs. Do not rewrite whole files when only a small section needs modification. Do not touch unrelated formatting, whitespace, architecture, naming, comments, or components.

## 3. LANGUAGE RULES

All player-facing UI must remain natural, grammatical Russian:

- desktop UI;
- RuneLite HUD;
- overlays;
- warnings;
- buttons;
- tooltips;
- dialogs;
- recommendations;
- checklists.

Preserve the naming convention:

`Русское название (English Name)`

Example:

`Удочка нахлыстом (Fly fishing rod)`

Do not translate or clean up existing Russian comments, docstrings, or localized test names unless specifically required.

New developer comments, internal documentation, commit messages, and internal type keys should be English unless the project structure requires otherwise.

## 4. CORE ARCHITECTURAL INVARIANTS

### Single Source of Truth

Never create duplicate:

- item lists;
- progression engines;
- preparation calculations;
- player-state stores;
- bridge transports;
- navigation targets;
- equipment requirement logic.

Reuse the established systems.

### Canonical pipeline

Maintain:

`playerState → readinessEngine → preparationPlan → UI consumers`

Consumers include:

- Desktop/Electron UI;
- RuneLite HUD;
- bank checklist;
- preparation UI;
- navigation/recommendation UI.

If the actual code uses a more precise implementation, preserve it.

### Known-state invariant

Use:

`PRESENT | MISSING | UNKNOWN`

Rules:

- PRESENT = confidently detected.
- MISSING = confidently verified absent.
- UNKNOWN = bridge unavailable, stale, incomplete, or not observable.

Never turn unavailable information into `0` or `MISSING`.

This is especially important for inventory, equipment, bank, GP, skills, quests, and item ownership.

## 5. RUNE LITE BRIDGE

Preserve the existing bridge:

`127.0.0.1:38282`

Do not create another transport unless technically unavoidable.

The Java plugin should remain lightweight and mainly handle:

- RuneLite/client state;
- game events;
- inventory/equipment observation;
- skills;
- bank observation;
- NPC/object state;
- navigation targets;
- rendering;
- HUD;
- limited UI interaction;
- state/event forwarding.

Heavy calculations, route resolution, large wiki datasets, progression logic, readiness logic, and aggregation belong in TypeScript/Desktop whenever practical.

## 6. AUTOMATION POLICY

Automation is allowed, but it must remain a companion/assistant rather than a gameplay bot.

### Allowed on Windows/Desktop

The agent may automate:

- opening/closing the program;
- focusing windows;
- moving/resizing application windows;
- clipboard operations;
- clicking buttons in the desktop app;
- opening links;
- starting/stopping local services;
- normal OS UI actions.

### Allowed in OSRS «Путь»

The system may automate:

- UI buttons;
- drawers/modals;
- filters;
- copying Bank Tags;
- marking shopping items as owned;
- preparation controls;
- navigation recommendations;
- non-gameplay addon controls.

### Allowed in RuneLite addon UI

The system may click:

- plugin/addon controls;
- configuration controls;
- overlay controls;
- navigation target controls;
- warnings/acknowledgements;
- other addon UI controls that do not control the character.

### Strict in-game limit

Inside the actual OSRS gameplay interface:

- maximum approximately 2 automated clicks every several minutes;
- never rapid repetitive clicking;
- never continuous clicking;
- never automated movement;
- never automated combat;
- never automated skilling;
- never automated looting;
- never automated eating;
- never automated item-use loops;
- never automated NPC/dialogue loops;
- never bot-like gameplay.

The system may guide, highlight, warn, route, and recommend.

It must not control the character as a bot.

### No automatic spending

Never automatically spend GP or purchase items.

The system may recommend, highlight, prepare lists, copy names, and route the player to a shop/GE. The player confirms purchases.

## 7. DATA CORRECTNESS

Never invent:

- skill requirements;
- equipment requirements;
- quest requirements;
- item properties;
- teleport availability;
- NPC locations;
- shop inventory;
- GE availability;
- route capabilities.

If uncertain, mark the information for verification instead of silently hardcoding a guess.

### Equipment requirements

Every equipment recommendation must consider:

- Attack;
- Strength;
- Defence;
- Ranged;
- Magic;
- quest requirements;
- F2P/Members status;
- actual usability;
- equipment slot;
- purpose.

Never recommend an item that the player cannot equip.

Example: if a helmet requires Ranged 20, a lower-level player must not be told to equip it.

### Recommendation consistency

The same item must not be recommended differently by different UI sections without an explicit condition.

For example, the system must not simultaneously recommend:

`Amulet of Power`

and:

`Amulet of Strength`

as the same final equipment target without a clearly defined reason.

Equipment recommendations must come from the centralized readiness/equipment engine.

## 8. PLAYER STATE

Where observable, expose:

- skills;
- equipment;
- inventory;
- coins;
- bank state;
- world position;
- plane;
- active target;
- relevant quest/progression state.

Example:

```json
{
  "equipment": [],
  "inventory": [],
  "coins": 0,
  "stats": {},
  "worldLocation": {}
}
```

But `0` means actual zero only. Unobservable data must remain UNKNOWN.

## 9. PROACTIVE READINESS

Before important steps evaluate:

1. Required items.
2. Required equipment.
3. Required skills.
4. Required quests.
5. Required GP.
6. Consumables.
7. Shortcuts/teleports.
8. Current equipment quality.
9. Overall readiness.
10. Cheapest/fastest sensible preparation.

The guide should proactively tell the player what is missing.

Example:

`⚠️ Подготовка: Купи Steel axe у Боба в Лумбридже.`

Then provide navigation if available.

All such logic must flow through:

`readinessEngine → preparationPlan`

not through duplicated component-specific calculations.

## 10. PREPARATION PLAN

A preparation entry should support, where applicable:

- item;
- requiredCount;
- currentState;
- PRESENT/MISSING/UNKNOWN;
- source;
- location;
- NPC;
- shop;
- estimatedCost;
- requiredSkill;
- equipmentRequirement;
- priority;
- reason.

UI consumes the plan rather than recalculating it.

## 11. SMART EQUIPMENT & TOOL UPGRADES

Before long Mining, Woodcutting, or Combat sections, detect obsolete equipment.

Examples:

- Bronze axe when Steel axe is available;
- weak pickaxe;
- weak melee weapon;
- inappropriate armor;
- missing food;
- missing tools.

Prefer:

`BUY → EQUIP → CONTINUE`

when the upgrade provides meaningful benefit.

But:

- never recommend unusable equipment;
- never recommend Members items in F2P;
- check quest locks;
- never spend automatically;
- do not interrupt the player for trivial upgrades.

## 12. «ЧТО НУЖНО ДЛЯ ИГРЫ»

The preparation interface should clearly distinguish:

### Ready

`✓ Еда 20/20`
`✓ Steel axe`
`✓ 500 gp`
`✓ Woodcutting 15`

### Missing

`✗ Steel axe`
`✗ Rope 1/1`

### Unknown

`? Bank status unavailable`
`? Current equipment unavailable`

Never display `0/1` when the system cannot confirm the state.

## 13. SHOPPING / BULK PURCHASES

Bulk shopping should aggregate future requirements.

Example:

`Iron bar ×2`
`Redberries ×1`
`Pot of flour ×1`
`Food ×20`

Support:

- total quantity;
- owned quantity;
- missing quantity;
- estimated cost;
- source;
- priority;
- stage/quest usage.

The player must be able to mark items as already owned from the shopping interface.

Possible state:

`REQUIRED | OWNED | PURCHASED | MISSING | UNKNOWN`

If bridge data later confirms ownership, reconcile it rather than creating duplicate records.

Never repeatedly recommend buying an item already confirmed as owned.

## 14. SKILL-BASED BRANCHING

Use current skills for adaptive recommendations.

Examples:

- Agility high enough → shortcut;
- Magic high enough → teleport;
- Woodcutting high enough → canoe;
- Mining high enough → better pickaxe.

Every recommendation must also check actual spell, quest, item, F2P/Members, and other prerequisites.

Do not branch solely on raw skill level.

## 15. BANK / INVENTORY / EQUIPMENT RECONCILIATION

At a bank:

1. Read observable inventory.
2. Read equipment.
3. Compare with preparation plan.
4. Highlight missing items.
5. Show owned items.
6. Avoid duplicate recommendations.
7. Recalculate readiness.

When an item enters inventory:

`MISSING → PRESENT`

when confidently detected.

When live information disappears:

`PRESENT → UNKNOWN`

unless reliable evidence proves it is gone.

## 16. NAVIGATION

Navigation is guidance, not bot control.

Allowed:

- 3D arrow;
- world-map marker;
- shortest-path breadcrumbs;
- NPC highlight;
- object highlight;
- distance;
- direction;
- waypoint sequence.

Use one canonical navigation target:

`activeNavigationTarget → HUD / 3D Arrow / World Map / Breadcrumbs`

Do not maintain independent competing navigation states.

## 17. WORLD MAP CONSISTENCY

A RuneLite navigation target should also be representable on the desktop world map when coordinates are known.

Target data should contain, where possible:

- x;
- y;
- plane;
- label.

Never invent coordinates.

If coordinates are unknown, use an explicit unresolved/search fallback.

## 18. ERROR HANDLING

All external/live systems must fail gracefully.

Bridge unavailable:

`RuneLite не подключён`

and state becomes UNKNOWN.

Wiki API unavailable:

- use cached data if available;
- otherwise show a clear unavailable state.

Invalid data must not crash the application.

Unexpected RuneLite states must be logged diagnostically and handled safely.

## 19. PERFORMANCE

Keep RuneLite lightweight.

Avoid:

- expensive work every game tick;
- repeated complete inventory scans;
- repeated API calls;
- unnecessary route recalculation;
- repeated JSON parsing;
- excessive overlay rendering;
- unnecessary allocations.

Prefer:

- event-driven updates;
- caching;
- throttling;
- dirty-state updates;
- squared-distance checks;
- recalculation only after relevant state changes.

Only render overlays while they are relevant.

Examples:

- HUD only when active;
- Danger Radar only near danger;
- NPC highlight only during relevant navigation;
- GE helper only while GE is open;
- Bank checklist only while bank UI is open;
- breadcrumbs only when a navigation target exists.

## 20. F2P / MEMBERS

Respect the active mode:

`F2P`
`Members`

Never recommend Members-only content in F2P.

Never corrupt or reset existing progress when switching modes.

## 21. DATA VALIDATION

Validate:

- item names;
- item IDs;
- skill names;
- levels;
- coordinates;
- quest names;
- NPC names;
- shop names;
- F2P/Members classification;
- equipment requirements;
- source locations.

Use the centralized validation/check-data system.

## 22. TESTING

Before declaring completion:

```bash
npm run build
npm test -- --reporter=dot
npm run check-data
cd runelite-bridge && ./gradlew -q testClasses
```

Do not declare PASS if any required check failed or was skipped.

If a command does not exist, report that fact instead of pretending it passed.

## 23. REAL USER-FLOW TESTING

Do not test only compilation.

Verify, where practical:

### Preparation

`Step selected → readiness evaluated → missing requirement detected → recommendation shown → navigation available → requirement becomes PRESENT → recommendation disappears → original route resumes`

### Equipment

`Insufficient skill → item not recommended as equipable`

`Required skill reached → item becomes eligible`

`Item owned → no purchase recommendation`

`Item equipped → upgrade prompt disappears`

### Shopping

`Required item → owned quantity deducted → missing quantity calculated → user can mark it owned → no duplicate recommendation`

### Bridge

`Connected → known state`

`Disconnected → UNKNOWN`

`Reconnect → state reconciles`

## 24. FULL AUDIT MODE

When explicitly requested to audit the project, inspect the entire project, not just the files changed by the current task.

Audit:

### Architecture

- duplicated state;
- duplicated logic;
- dead code;
- conflicting sources of truth;
- bridge responsibilities;
- React responsibilities;
- Java responsibilities.

### Data

- invalid coordinates;
- impossible requirements;
- contradictory equipment;
- wrong skill requirements;
- wrong F2P/Members classification;
- incomplete preparation;
- duplicate entries;
- spelling;
- terminology consistency.

### UI

- Russian spelling;
- punctuation;
- grammar;
- broken labels;
- inconsistent terminology;
- unclear controls;
- stale recommendations;
- incorrect tooltips;
- inaccessible UI.

### RuneLite

- overlay performance;
- lifecycle;
- event handling;
- null handling;
- configuration;
- bridge reconnect/disconnect;
- client API correctness;
- state synchronization.

### Navigation

- arrow accuracy;
- world-map marker accuracy;
- x/y/plane handling;
- shortest-path integration;
- stale targets;
- fallback behavior.

### Gameplay correctness

- equipment requirements;
- skill requirements;
- quest requirements;
- item availability;
- shop availability;
- teleport requirements;
- shortcut requirements.

### Testing

- missing tests;
- fragile tests;
- incorrect assumptions;
- build failures;
- data-validation failures.

Fix clear, in-scope problems. Do not perform unrelated aesthetic refactors.

## 25. CHILL-GAMING PRINCIPLE

The product should make OSRS feel like:

`пришел → посмотрел → купил → надел → пошел → кайфуешь`

The guide should proactively answer:

- Что мне нужно?
- Где это взять?
- Могу ли я это надеть/использовать?
- Чего не хватает?
- Что уже есть?
- Что выгоднее купить?
- Сколько GP есть?
- Сколько еще нужно заработать?
- Есть ли быстрый shortcut?
- Есть ли teleport?
- Готов ли я идти?

The player should not need to repeatedly research Wiki pages or remember obscure requirements.

However, the system remains an intelligent guide/assistant, not a gameplay bot.

## 26. IMPLEMENTATION PRIORITY

When several solutions are possible:

1. Correctness.
2. Compatibility with existing architecture.
3. Accurate player state.
4. Data integrity.
5. Protection against incorrect recommendations.
6. UX.
7. Performance.
8. Visual polish.
9. Convenience automation.

Never sacrifice correctness for convenience.

## 27. FINAL EXECUTION RULE

For every task:

1. Inspect the existing code first.
2. Reuse existing systems.
3. Make the smallest correct change.
4. Validate data.
5. Test real user flows.
6. Run required builds/tests.
7. Check regressions.
8. Verify automation limits.
9. Never claim success if verification failed.
10. Keep the final response concise.

The objective is not maximum code volume.

The objective is a reliable, intelligent, low-friction OSRS companion that proactively prepares the player, gives accurate guidance, and uses limited UI automation without controlling the player's character.
