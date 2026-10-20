# Queued snapshot application

Stacked after session freshness. The protocol number and payload limits are unchanged.

`SnapshotOrder` separates HTTP acceptance from ClientThread application. A queued callback applies only if its lifetime ticket is current and its sequence is still the latest accepted complete snapshot; duplicates/older callbacks cannot roll the HUD, target or preparation back. Stopping/restarting the server invalidates old tickets, including port changes. A stopped HTTP server cannot invoke a new prep callback. Prep acceptance and the server's advertised active-step metadata share a short lock; response output is outside it.

Applied sequence/time/readiness metadata and telemetry are now updated on ClientThread with the applied snapshot, instead of racing on HTTP threads. Readiness percentage comes from the actual retained preparation and skill-path state, including partial rejection. Invalid/disabled parts still retain their last applied value; absent valid parts still clear it.

The full Java suite passed (595 tests). New tests cover callbacks applied in reverse order, a superseded pending complete snapshot, same sequence after a server lifetime reset, and 16 concurrent HTTP requests preserving monotonically accepted sequence and status metadata. Existing envelope rejection, shared TS/Java fixtures and HUD suites also passed. No live RuneLite or measured FPS claim is made.

Remaining T08 acceptance: wire-level session identity across an app/account restart is broader than this plugin-server lifetime guard; legacy SSE carries no per-event account token. Test a real reconnect/update before claiming end-to-end session correctness. T09 slow-reader I/O isolation is a separate change.
