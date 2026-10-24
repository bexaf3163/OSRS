Continue working on the existing OSRS Path project.

Implement the following changes completely across the desktop/web application, route data, and RuneLite addon. Do not make isolated UI-only fixes. Trace the relevant data flow and ensure the same information is correct everywhere it appears.

## 1. Fix the guide: Black armour + 10 Defence requirement

The current guide does not properly tell the player that Black armour is needed, and the in-game RuneLite guide does not clearly tell the player that Black armour requires 10 Defence.

Fix this throughout the project.

### Requirements

Find the relevant route stage/step where Black armour becomes required.

The guide must clearly tell the player:

- that Black armour needs to be obtained;
- exactly which Black armour pieces are required by the route;
- that Black armour requires **10 Defence** to equip;
- that the player must reach **10 Defence before the armour is expected to be equipped/used**;
- how/where the required Black armour can be obtained;
- whether buying it is the recommended route;
- approximately how much GP is required, using the new live-price system described below.

Do not assume the player already knows the Defence requirement.

### Route progression

Verify the surrounding route.

If the current route can reach the Black armour step before the player reaches 10 Defence:

- fix the ordering;
- add a Defence-training requirement/step at the appropriate point;
- clearly show a target such as:

`Defence: current level → 10`

The player should never arrive at a step requiring Black armour only to discover that it cannot be equipped.

Make the route explain the preparation **before** the armour becomes necessary.

### Desktop/web app

Ensure this information is visible in the normal guide UI:

- required items;
- skill requirements;
- preparation instructions;
- acquisition instructions;
- relevant warnings;
- step details.

If the project has reusable requirement/item components, use them instead of hardcoding duplicate text.

### RuneLite addon / in-game guide

The same requirement must appear in the in-game guide.

The RuneLite guide must clearly show:

- `10 Defence required`
- the required Black armour item(s);
- whether they still need to be purchased/acquired;
- whether the player currently meets the Defence requirement.

If the addon already receives player skill levels, use the actual Defence level to determine completion/status.

Example behavior:

`Defence 7 / 10`

then after reaching the requirement:

`Defence 10 / 10 ✓`

Do not mark an armour-equipment/preparation step complete if the player cannot actually equip the required armour.

Avoid creating duplicate progression logic if the existing bridge/progress system can handle this.

---

# 2. Add LIVE prices for all tradeable items

Replace static/stale item prices with live OSRS market prices throughout the application and RuneLite addon wherever prices are shown.

This must be implemented as a reusable system, not individual hardcoded API calls for specific items.

## Scope

Live prices should work for all relevant tradeable items shown in:

- required-item lists;
- shopping lists;
- preparation sections;
- route steps;
- Grand Exchange-related information;
- calculators;
- cost summaries;
- equipment requirements;
- item tooltips/details;
- RuneLite guide panels;
- any other place where the project currently displays an item price.

Search the entire repository for:

- hardcoded GP prices;
- approximate price strings;
- static item price fields;
- duplicated price calculations.

Migrate them to the shared live-price system wherever appropriate.

## Price source

First inspect the existing project for a price API/service/cache.

If one already exists, extend and centralize it instead of creating another competing implementation.

If no suitable live-price system exists, implement a reliable OSRS market-price provider suitable for the project architecture.

Use item IDs as the canonical identifier whenever possible.

Do not rely on item-name string matching when an item ID is available.

## Architecture

Create one shared price abstraction/service.

Conceptually:

`Item ID -> live price data -> cache -> application/addon consumer`

Do not scatter fetch logic throughout React components.

The implementation should support:

- batching requests where possible;
- caching;
- deduplication of simultaneous requests;
- graceful API failures;
- sensible refresh behavior;
- avoiding unnecessary repeated network calls;
- fallback display when a price is unavailable.

The UI must never break just because the price service is temporarily unavailable.

A failed price lookup should show something like:

`Price unavailable`

rather than incorrect fabricated data.

## Buy-price presentation

For guide shopping/preparation purposes, prefer a useful current acquisition/buy estimate rather than presenting irrelevant raw market fields.

Keep the price terminology consistent across the application.

Examples:

`Black platebody — 3,842 gp`

or:

`≈ 3.8K gp`

according to the existing UI style.

For quantities, calculate the total automatically:

`Lobster ×20`
`214 gp each`
`≈ 4,280 gp total`

Do not store calculated totals manually.

## Total shopping cost

Where the route already has a shopping/preparation list, calculate its estimated total cost from live prices.

Example:

`Estimated cost: ≈ 18.4K gp`

It must update from the live price data automatically.

Do not introduce unnecessary UI clutter.

## RuneLite integration

Determine the cleanest architecture for RuneLite.

Do not independently duplicate the entire pricing implementation in Java if the existing local bridge/application can provide the price data reliably.

Prefer reusing the existing bridge/data flow when architecturally appropriate.

However, the RuneLite guide must still be able to display useful live/current prices for required items.

Handle situations where:

- desktop app is disconnected;
- price request fails;
- cached data exists;
- no price is available.

Do not let price functionality interfere with the guide or RuneLite performance.

---

# 3. Remove dates from OSRS Path

Dates are unnecessary information for this product.

Remove user-facing date information from both:

- desktop/web application;
- RuneLite addon.

Search the full repository instead of removing only the dates currently visible on one screen.

Remove unnecessary user-facing content such as:

- route update dates;
- last updated dates;
- generated dates;
- content dates;
- version dates shown as dates;
- guide dates;
- sync dates if they are presented to the player without a functional reason;
- date labels in RuneLite panels;
- date metadata rendered in the UI.

Also search for date formatting/rendering utilities that exist only for these displays.

### Important

Do **not** blindly delete internal timestamps required for:

- caching;
- synchronization;
- conflict resolution;
- migrations;
- logging;
- persistence;
- API behavior;
- CI/build systems;
- price freshness calculations.

Internal timestamps may remain when technically necessary.

The requirement is:

**No unnecessary date information should be shown to the player.**

If an internal timestamp is required for functionality, keep it internal and stop rendering it.

Do not replace dates with another unnecessary metadata label.

---

# 4. Data consistency

Audit how route information is shared between:

- route JSON/data;
- React application;
- local bridge;
- RuneLite addon.

Avoid manually maintaining the same information in multiple places.

The ideal result is that:

- Black armour requirements;
- 10 Defence requirement;
- item IDs;
- quantities;
- live prices;

all come from consistent structured data.

If the current schema needs a small extension, implement it cleanly.

For example, use structured fields rather than embedding important requirements only inside prose.

Possible concepts:

```ts
requirements: {
  skills: [
    { skill: "Defence", level: 10 }
  ]
}

requiredItems: [
  {
    itemId: ...,
    quantity: 1
  }
]
```

Use the project's existing schema conventions if equivalent structures already exist.

Do not introduce a second competing format.

---

# 5. UX requirements

Keep the interface clean.

Do not add large new panels just for these changes.

Live prices should feel like part of the existing item UI.

Important progression requirements such as `10 Defence` must be much more prominent than optional metadata such as prices.

Suggested hierarchy:

**Requirement**
`🛡 Defence 10`

**Items**
`Black ... ×1 — ≈ X gp`

Prices are supporting information.

Progression requirements are mandatory information.

---

# 6. Repository-wide cleanup

Search for all relevant occurrences before finishing.

Look for terms/concepts including:

- `black`
- `black armour`
- `black armor`
- `Defence`
- `Defense`
- hardcoded `gp`
- `price`
- `cost`
- `GE`
- `Grand Exchange`
- `date`
- `updated`
- `lastUpdated`
- `createdAt`
- `updatedAt`
- date formatting utilities

Do not blindly modify unrelated internal infrastructure.

Classify each occurrence before changing it.

---

# 7. Verification

After implementation, verify the complete flow.

At minimum test:

### Guide progression
- Player below 10 Defence sees the requirement.
- Player cannot accidentally treat the Black armour preparation as complete when the Defence requirement is unmet.
- At 10 Defence the requirement becomes satisfied.
- Required Black armour is clearly listed.
- Acquisition instructions are visible.

### Live prices
- Single item.
- Multiple items.
- Quantity > 1.
- Total cost.
- Cached result.
- Missing price.
- API/network failure.
- Refresh/update behavior.
- RuneLite presentation.
- Application presentation.

### Date removal
Search the rendered app and RuneLite guide for unnecessary dates and verify they are gone.

### Regression
Run the project's relevant:

- type checks;
- unit tests;
- integration tests;
- builds;
- RuneLite/Java tests;
- existing route validation.

Do not weaken or remove existing tests merely to make the new implementation pass.

---

# 8. Constraints

Preserve:

- existing route IDs;
- existing player progress;
- notes;
- skipped steps;
- save compatibility;
- profile compatibility;
- F2P/Members behavior;
- existing RuneLite bridge behavior;
- existing completion triggers unless modification is required for correctness.

Do not unnecessarily redesign the UI.

Do not add unrelated features.

Do not create duplicate pricing systems.

Do not hardcode current market prices.

Do not hardcode Black armour requirements only in presentation components.

Do not display dates merely because they exist in stored metadata.

---

# 9. Working style

Work autonomously.

Inspect the existing implementation before modifying it.

Use the project's existing patterns wherever possible.

Do not stop after finding the first occurrence of an issue.

Follow the data through the entire application and RuneLite addon.

Keep implementation quality high while keeping communication minimal.

Work silently between tool calls.

Do not narrate reasoning or routine progress.

Do not output chain-of-thought.

Only interrupt me if there is a genuine blocker requiring information that cannot be determined from the repository.

When finished, respond very briefly:

Done.
- Black armour + Defence 10 progression fixed.
- Live item pricing integrated across app/RuneLite.
- Unnecessary user-facing dates removed.
- Tests/build: <result>

If something remains unresolved, mention only the specific unresolved item.