# Executable funding preparation and sale observation

Stacked after selected-route reserves. No catalogue/game facts, route IDs or gameplay automation were added.

## Change

The evaluation exposes the actual first batch that the available cash can fund after one-time tool setup and trip fees. Bag capacity remains separate. The funding guide uses that batch's output goal and explicit input quantities. Buying a missing named tool and preparing consumed inputs are separate actions; a tool purchase no longer suppresses the input instruction. Multiple tool requirements contribute to setup cost.

Processing trips loop through preparation again, without buying reusable tools again. The input counts and destination are refreshed against observed ownership and protected reserves before the next trip. Preparation still requires the player's confirmation; arrival never proves procurement. The app and single game guide consume the existing FundingView action.

Sale observation compares total coins only when both the baseline and current bag/bank totals are known. Collection straight to the bank can count; transferring existing coins between bag and bank does not. Discovering a previously unread bank cannot prove income. Older saved plans without a complete baseline retain manual confirmation until a new sub-step baseline is established.

## Evidence and limits

Unit coverage includes a 1,200 gp account preparing three steel bars instead of its nine-bar capacity, a synthetic tool-plus-input processing method, replenishing consumed inputs on repeat trips, collection to bank, self-transfers, unknown bank and legacy baselines. Synthetic method requirements are test data only, not added to the game catalogue.

The full Vitest suite passed 1,649 tests. TypeScript, production build and check-data passed. Browser evidence is recorded in the PR; it uses mocked bridge facts, not the actual character. Installed files and saves remain untouched.

This is partial T12 acceptance: four-hour GE throughput versus short-session purchase availability, historical buy-limit usage, complete travel detours and live collection testing remain open. Total-coin changes are an observation heuristic, not transaction attribution; unrelated income can satisfy a sale threshold. Changed prices or cash during a running plan do not yet rebuild its batch size automatically. No exact live-game proceeds are claimed.

Exact-tree CI 39494789008 passed all gates, including Java, Chromium and the isolated packaged Windows EXE.
