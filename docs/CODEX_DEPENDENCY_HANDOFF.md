# Dependency advisory assessment — 2026-10-21

Partial T16, stacked after current Gear benefit. This is not in the first audit preview EXE. No app/game code, Electron version, builder version or player data is changed.

## Minimal compatible changes

| Component | Previous lock | Selected lock | Basis |
| --- | --- | --- | --- |
| source-map-js | 1.2.1 | 1.2.2 | [Upstream release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) explicitly fixes indexed-source-map denial of service; [advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) lists this patched version. |
| http-cache-semantics | 4.2.0 | 4.3.0 | Within the existing `^4.0.0` dependency constraint. The fresh npm lock audit no longer flags it; the [advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) still lists no patched release, so this is not independent reproduction of the underlying disclosure fix. |
| Vite | 8.3.1 | 8.3.3 | [Upstream launch-editor advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm) identifies Vite 8.3.3 as patched. Fresh audit also reported [percent escaping](https://github.com/advisories/GHSA-698v-4r3x-3vcv) and [editor argument interpretation](https://github.com/advisories/GHSA-r825-w8mm-5pxw). |

Vite is pinned to the smallest verified patched release here. Its existing PostCSS/Rolldown versions remain compatible and unchanged. A trial resolution to 8.3.5 upgraded many unrelated platform bindings; that uncommitted trial was replaced with the reviewed minimal lock diff. No `npm audit fix --force`, builder downgrade or blanket dependency upgrade was applied.

## Remaining advisory and exposure

The original report had ten package entries (two high/eight moderate). Fresh advisory data added Vite issues after that report. After these targeted changes the current lock audit reports **0 high, 0 critical, 8 moderate** entries. Those eight are one remaining sprintf-js issue propagated through roarr/global-agent/@electron/get and the builder graph, not eight independently reproduced app exploits. `npm audit --omit=dev` reports zero entries.

[sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) lists no patched version; the registry's latest is still 1.1.3. The proposed automatic builder downgrade to 26.5.0 is not a compatible leaf patch and was rejected. Keep this residual tracked for an upstream fix or a separately validated dependency-chain change.

These are development/build dependencies. The portable app opens compiled local assets and uses Electron/Node code in `electron/`; it does not run Vite's editor middleware in the shipped renderer. A clean runtime npm audit alone is not proof the complete EXE is vulnerability-free. This assessment does not establish exploitability of remaining build-tool formatting input, nor dismiss the build environment's risk.

## Validation contract

Registry versions/integrities and the lock diff were inspected; only the three selected package records, Vite's declared version and its compatible Rolldown range change. App version remains 2.74.0. The local npm reify attempts reported success but reads still showed the old installed versions, so tests on that local node_modules cannot be presented as validation of the new libraries.

**Acceptance requires clean `npm ci` in the attached PR's CI**, TypeScript/build, check-data, the full Vitest/Java/browser suites and the Windows portable build plus isolated EXE E2E. Record those jobs before claiming updated-dependency acceptance. Existing local EPERM/native-start limitations remain; do not work around them by changing security settings. No live game or new portable publication is included in this dependency PR.

Clean-install acceptance subsequently passed on [run 39557369523](https://github.com/bexaf3163/OSRS/actions/runs/39557369523): 1,677 Vitest tests/128 files, build/data/full Java/full Chromium and the actual Windows portable EXE. Both build logs confirm Vite 8.3.3. Packaged E2E verified the window/font, bridge fixture and isolated persistence; tested artifact SHA-256 `b82076eeaae5e0becb4d7e255feab69a46e17e6dca5aa40f78735086c02d4c92`. This artifact was not published as an updated preview or stable release. Residual moderate advisories remain as described above.
