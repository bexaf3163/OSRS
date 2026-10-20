# Active character and asynchronous bridge data

Stacked after the prerequisite follow-up. This keeps the existing bridge, player state and funding providers; it adds no second session store or HUD.

## Changes

- Pending status replies carry a session ticket and per-field event revisions. A newer GEAR/STATS/XP/QUESTS/MOVED event wins over an older reply for that fact. Logout, STATUS identity boundaries, reconnect and effect cleanup invalidate old tickets.
- Logout clears character facts even when the event stream remains open. Subsequent queued character-data events are ignored until an in-game status is observed. Missing current fields become unknown; a truthy-only setter no longer retains old quest/level data.
- The bridge's public character facts are available only while logged in with a compatible profile gate. A different character cannot become this profile's live equipment, money or quest state. Immediate auto-completion checks the current identity synchronously, including events arriving before a React render.
- `buildPlayerState(connected:false)` ignores retained raw game objects and uses profile levels as explicitly labelled fallback. Last-known gear remains in the existing per-character history.
- Position from current status/move events is included in the shared player snapshot. Funding's working position polling remains; its late replies are checked against owner, request order and lifecycle. A disconnected snapshot cannot use a leftover funding position.
- Snapshot acknowledgements and active-step results are guarded by session lifetime; explicit step/clear and legacy navigation results also respect newer intent. Last-known or unconfirmed facts do not become zero stock.

## Verification

1,637 Vitest tests across 120 files passed; TypeScript and the build/data validator passed. Test fixture helpers that intentionally represented offline training now provide their levels as profile data rather than contradictory live stats with `connected:false`; their existing method/default-plan expectations are unchanged.

Focused Chromium cases passed for delayed status vs fresh gear/levels, logout while SSE stays open, an old in-game response after logout, profile mismatch and same-batch foreign stats/auto-completion. The full browser run is in progress. Final additional navigation/intent guards need the final built browser/CI gate before merge. Java production code is unchanged in this follow-up; the preceding machine/resource changes passed its full 591-test suite.

## Remaining acceptance

No live account/world-hop/reconnect check or native screenshots have been performed. The protocol still has no identity stamp on each legacy SSE event: ordering inside an established stream is relied on, with STATUS boundaries and profile gating. Java queued-apply lifecycle is a separate T08 task. Keep the distinction between a connected plugin, an active compatible character and explicitly labelled last-known history.
