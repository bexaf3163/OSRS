# Slow-reader isolation in the Java bridge

Stacked after queued snapshot ordering. No game actions or additional overlay were added.

## Reproduction and change

The real loopback-socket regression `stalledEventReaderDoesNotBlockTheBroadcastCaller` failed on synchronous `Stream.send`: a receiver with a small buffer that stopped reading blocked the producer beyond the four-second deadline. The test closes its socket in `finally`; it does not use the player's RuneLite.

`AsyncEventStream` queues immutable UTF-8 frames. Its producer never writes, flushes or closes the socket. Each stream has at most 128 queued frames and 384 KiB of queued bytes, plus at most one bounded frame being written. Oversize/overflow logically closes the stream, clears its queue and schedules transport closure off the producer. Writers and closers each have at most eight workers and eight waiting tasks; executor saturation never falls back to blocking game-thread I/O. A one-second watchdog requests closure of writes stalled for ten seconds. The existing maximum of eight active connections and oldest-connection eviction remain.

Initial state and subsequent events are queued in order under the registration lock. Events are not silently coalesced/reordered: overflow disconnects the client, which reconnects for a fresh snapshot. One current-target completion receipt is retained and replayed while that target is still current; advancing/clearing it or identifying a different character clears the receipt. A known same-character logout/login can recover it; anonymous receipts are cleared on logout. This avoids losing a one-shot completion during a dropped connection without replaying historical completed targets after manual reactivation.

## Evidence and limits

The full suite passed 601 Java tests before the final registration-helper extraction. It includes real sockets, stalled writes, exact byte/frame bounds, expiry without producer-thread closure, FIFO completion order, replay for the same character after reconnect, and no replay after changing target/character. The strengthened socket test sent 256 distinct 512-item reports in 228 ms total on this machine, including serialization. This is a synthetic producer measurement, not game frame time or a promised FPS improvement. The final helper extraction must pass compilation/server tests and the exact-tree CI gate before merge.

An OS write/close that ignores interruption can still occupy a bounded worker until the socket/server closes; logical disconnection/queue cleanup is immediate and does not wait on it. Socket closure is intentionally never performed inline on a game broadcast. RuneLite API reads remain where the existing plugin constructs its DTOs. Telemetry disk/render cost and actual game frame-time measurement remain separate acceptance items.
