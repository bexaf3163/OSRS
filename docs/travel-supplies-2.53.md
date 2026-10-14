# Travel supplies 2.53.0 — stocking up for the road

Asked for by the owner after the 2.52 transport audit: before a long run the guide should say what to buy for the teleports that pay off
(Teleport cards for the Chronicle, runes for the spells), a wielded staff should count instead of its runes, and the four limitations of the
2.52 report (no F2P law runes, no upstairs or Grand Exchange banks, Chronicle charges unknown, Chronicle never used in the tests) should be
dealt with as far as the game allows. The model is the "stock up before you leave" step of guides like RestedXP and Zygor.

The app only suggests. It never buys, withdraws, uses a card or casts a spell.

## What was built

| Area | Change | Where |
|---|---|---|
| Road planner | The next 8 open steps are walked line by line (the quest's canonical lines, the step's places otherwise). On each leg the planner asks "if every supply were on hand, which way is best?". A spell or the Chronicle that beats walking and the canoe by the usual margin (80 tiles) counts as one use. The uses give what to bring: cards (one per charge) and the book, runes per cast minus what a worn staff gives. Bag, worn items, bank and the book's charges are subtracted. An unknown count stays unknown ("up to N", never "none"). | `src/lib/travelSupplies.ts` |
| App | "Supplies for the road ahead" in the step's Travel drawer (starting where the player stands), and "For the road" on the Shopping page for the chosen stages (from the player when the range starts at the current stage). Each row: how many, what you have, where it is sold and the price, what to do after ("use them on the Chronicle: one card, one charge"), and a "Lead to" button. | `src/components/RoadSupplies.tsx`, `TravelPlan.tsx`, `pages/Shopping.tsx` |
| Game card | A "Stock up for the road" line (amber, the arrow to the shop) when the player stands by a shop that sells what the road needs (40 tiles), or when it is on the way to the current objective and the shortage is confirmed. The road for this line starts at the current objective: a shop passed on this leg can only serve the legs after it. | `src/lib/liveTransport.ts` (`supplyStop`), `PrepSync.tsx` |
| Shop and exchange windows | The purchases of a "prepare" transport are listed as "For the road: Teleport card ×5": at the exchange the exchange's purchases, in a shop only when it is the shop the arrow leads to (within 15 tiles of the stop). | `PrepPlan.Buy`, `ShopWindow`, `OsrsPathShopOverlay` |
| Staves | 26 staves from the wiki: the four elemental staves (F2P) and the battle, mystic and combination staves, Twinflame, Kodai (members only). Worn: the rune is free. In the bag: the way says "wield your Staff of air" first. On a free-to-play account members staves do nothing. | `src/data/transport.json` (`staves`), `travel.ts` (`staffCover`) |
| Chronicle charges | Read from the game's own messages (check, teleport, add cards, run out, full), the same ones RuneLite's Item Charges plugin reads; until then the plugin uses the last saved count (its own, else the one Item Charges saved). Reported in `/status` as `chronicleCharges` (0–1000, absent when unknown). Known charges remove "check charges"; 0 locks the book and turns it into "buy a Teleport card at Diango's" (one stop, 150 gp), or "use a Teleport card on the Chronicle" when a card is in the bag. A new book is bought together with a card (a new book has no charges). | `ChronicleCharges.java`, `OsrsPathBridgePlugin`, `BridgeServer`, `travel.ts` |
| Banks | The Grand Exchange bankers and Lumbridge Castle's top-floor bank are stops. A bank on another floor costs 15 tiles of running per floor (the stairs); the app planner and both item preflights (app and plugin) weigh it the same way. The plugin's bank list no longer has the Grand Exchange twice. | `majorLocations.json`, `travel.ts` (`bankTiles`), `preflight.ts`, `Preflight.java` |

## Checked live (World 316, F2P account, plugin 2.53.0 from the worktree)

- **Chronicle charges, end to end.** The plugin started with 0 from RuneLite's Item Charges record. "Check charges" on the Chronicle (one
  deliberate click, nothing spent) printed the game message; the telemetry shows `{"kind":"chronicle","charges":0}` right after the menu
  click, and `/status` reported `chronicleCharges: 0`.
- **Travel drawer** (S3-05, player in Lumbridge Castle courtyard): "Varrock Teleport ×1, Chronicle ×1 save ~4 min over 8 steps"; Law rune ×1
  at the Grand Exchange (~120 gp), Fire rune ×1 at Aubury's (~4 gp), Air rune "✓ enough (632)" from the real bank, Teleport card ×1 at
  Diango's (~150 gp) "then use them on the Chronicle". Before the bank snapshot loaded the same rows said "up to … · open your bank" (correct).
- **Shopping page** (stages 2–3, open steps): "Varrock Teleport ×1 save ~62 s over 4 steps", Law rune and Fire rune to buy, Air rune enough.
- **Game card.** The first build showed "Stock up for the road: buy Law rune ×1 at the Grand Exchange" in Lumbridge, because the road was
  planned from the player and the exchange lies next to the objective (Reldo). Fixed: the card's road starts at the objective. After the fix
  the card shows no travel line for this leg, which matches the decision report: fetching runes (−109 tiles) or a card (−5 tiles) costs more
  than it saves, walking is best. Regression test: "the card plans from the objective".
- Environment restored: step removed from the game, debug flag off, 117 HD unchanged.

## Simulated only (unit tests and a rendered image)

- A positive "Stock up" line by a shop and on the way (`tests/travelSupplies.test.ts`), the shop window rows (`ChronicleChargesTest`, image
  `runelite-bridge/build/overlay-render/shop-road.png`), staves worn/in the bag/members, the empty-book and card-in-bag wording, the castle
  bank's stairs, the Grand Exchange bank. The character was in Lumbridge and Diango's Toy Store was not visited: walking there for the test
  would have been a long run of game clicks.
- No Teleport card was bought or used, no teleport was cast.

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | built |
| `npx vitest run` | 963 passed (72 files) |
| `npm run check-data` | 0 errors, 0 warnings |
| UI smoke (Edge) | passed |
| Java: `gradlew test` (full suite) | 485 passed, 0 failed |

## Limitations

- **Law runes** still have no free-to-play shop (game fact): for F2P the source is the Grand Exchange.
- **Charges** are known only after one of the book's messages or from a saved count (the plugin's own, else RuneLite's Item Charges
  record). Until then the line says "check charges" and the card count is "up to N". A saved count can be stale if the book was used while
  the plugin was not running; the next message from the book corrects it.
- **Teleport cards in the bank** are counted after the bank is opened once with plugin 2.53 (they joined the watch list now).
- **Stairs** are an estimate (15 tiles per floor); Lumbridge Castle's top floor is the only upstairs bank in the data.
- **The stock-up line** shows only within 40 tiles of the shop, or on the way to the current objective with a confirmed shortage; it looks 8
  steps ahead and does not count the Home Teleport (free, but once per 30 minutes).
- **Members staves** are listed but this account is F2P: their effect was tested in unit tests only.
