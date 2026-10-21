# Selected training method map projection

Partial T11/T13 follow-up. Not in the first audit preview EXE.

S6-02's selected method changed the primary map point and required tools, but retained every static resource spot in the climb. Those future places were sent as game ground tiles and remained available in the step's point switcher. A regression against the real Fishing step failed before repair.

When the selected method resolves through the existing location dictionary, `withTrainingMethod` now projects that point into the step map/resource spots and native target/ground tile/goal. Obsolete static waypoints are removed from the resolved target. Unknown level/method/location fallback remains unchanged, as do completion requirements, watch lists, IDs and the authored static climb. No new locations or training rates were invented, and no new UI panel was added.

Tests compare the actual map and wire payload at net, fly-fishing and owned-lobster-pot states; they retain the all-method watch list and original combined Fishing/Cooking completion. Browser coverage checks the narrow and wide Path maps and the actual protocol-6 prep snapshot, not the legacy active-step endpoint. Local full Vitest passed 1,702 tests in 129 files; build/TypeScript passed. Data validation (0 errors/warnings), Java testClasses and focused Skills browser checks at 390/1280 px passed. Clean CI and live game acceptance remain separate.

This does not fix all skill methods or compound goals. In particular, Cooking still needs a complete supplies/location model before the finished Fishing half can hand over automatically. S6-01 Ranged still needs a consistent selected trainer, ammunition, gear and safespot projection; S6-03 Mining/Woodcutting needs continuous unlock coverage; S6-04 Magic needs spell-appropriate inputs. Merely setting followsMethod on those steps would retain contradictory monsters/instructions or incomplete supplies. Do not mark them repaired by this map-only change.
