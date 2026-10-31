# OSRS Path

A Windows companion for Old School RuneScape: a staged quest/training route, preparation and shopping, equipment comparisons and earning methods, connected to a RuneLite guide overlay.

The app recommends and tracks; purchases and gameplay remain manual. Recommendations use available character facts and supported shared models. Unread data remains unknown; model/guide estimates are not guarantees of actual performance. The accepted interface is the Adventurer's Ledger; mobile development is out of scope.

## Download

Get the normal single-file Portable EXE from [the latest release](https://github.com/bexaf3163/OSRS/releases/latest). Keep its data folder when updating or use the built-in updater. The release includes SHA256SUMS.txt and one PROJECT_HANDOFF.md snapshot.

## Development

Use the Node version required by package.json and JDK17 for the RuneLite bridge.

```sh
npm ci
npm run dev
```

Build/check commands and current architecture, completed work, limitations and remaining tasks are in [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md). That is the single maintained source for contributors and AI agents; do not create parallel handoffs.

```sh
npm run build
npm test
npm run check-data
npm run bridge:jar
npm run dist:win
```

Desktop/browser/native tests use isolated data. Live-game acceptance belongs to Claude; preserve the user's real progress and account data.

Third-party licenses and attributions remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
