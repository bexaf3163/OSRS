# Quest Helper state machines — generators

The plugin follows a quest step the same way as [Quest Helper](https://github.com/Zoinkwiz/quest-helper): by what the player has done (chat and dialogue messages,
the quest journal, items, place, variables), not only by place and bag. The order and conditions of Quest Helper (`ConditionalStep`) were extracted from its
sources and live in `src/data/questMachines.json` — this is a plugin resource (`QhMachine.java` reads and evaluates it).
Here are the scripts that build the file. None of this is needed to build the app or the plugin: it is needed when a new Quest Helper version comes out
or a quest is added to the route.

The Quest Helper license (BSD 2-Clause) is in `THIRD_PARTY_NOTICES.md` in the repository root.

## What is where

| File | Purpose |
|---|---|
| `qhm/quests.py` | The route quests: a route step → the Quest Helper class, the kind and number of the variable |
| `qhm/fetch_qh.py` | Clones Quest Helper (`--depth 1`, only `src/main/java`) and lays the quest sources out in `work/` |
| `qhm/dump_consts.py` | Dumps the RuneLite API constants (`ItemID.GARLIC`, `NpcID.MORGAN`, `InterfaceID.Questjournal.TITLE`…) into `work/consts/` |
| `qhm/jparse.py`, `qhm/interp.py` | A parser of the Java subset and the "symbolic" execution of each quest's `loadSteps()`: the result is a tree of steps with conditions |
| `qhm/build.py`, `qhm/build_machines.py` | From the tree — the tables of nodes and conditions; `build_machines.py` writes `src/data/questMachines.json` |
| `qhm/qeval.py` | The reference evaluator (Python): three values "yes / no / unknown", latches, chat messages |
| `qhm/golden.py` | Random and hand-picked sets of facts → the reference answers → `runelite-bridge/src/test/resources/qh-golden.json` |
| `qhm/steps_info.py`, `qhm/export_fixture.py` | The tile, type and id of each Quest Helper step → `tests/fixtures/qh-steps.json` |
| `qhm/reach.py`, `qhm/gaps.py`, `qhm/compare_pos.py`, `qhm/compare_hl.py` | Checking our data against Quest Helper: unreachable lines, steps without a line, tiles, highlights |
| `qhm/pretty.py` | A quest machine as a readable tree: `python qhm/pretty.py S2-09 1` |

## How to update after a new Quest Helper version

You need git, Python 3, a JDK (`JAVA_HOME`, `javap` is taken from it) and a built plugin (`runelite-bridge`, so that `runelite-api` is in the Gradle cache).
The working folder `work/` (it does not go into git) — or any other through `QH_WORK`. The paths are long: `fetch_qh.py` turns on `core.longpaths`.

```bash
cd tools/qh-machines
python qhm/fetch_qh.py            # the Quest Helper sources → work/ (work/QH_REVISION.txt says which commit was parsed)
python qhm/dump_consts.py         # the RuneLite constants → work/consts/
python qhm/build_machines.py      # src/data/questMachines.json (with --check it only compares and writes nothing)
python qhm/golden.py              # the reference vectors for QhGoldenTest
python qhm/steps_info.py && python qhm/export_fixture.py   # tests/fixtures/qh-steps.json
```

Then the checks: `npm test` (`tests/questMachines.test.ts` tells which lines' `k` is no longer among the Quest Helper steps, and which lines' tile or
highlight diverged) and `cd runelite-bridge && ./gradlew test` (`QhGoldenTest`: Java and the reference answer the same on all vectors).

If Quest Helper renamed or added a step:

- the `k` field of the lines in `src/data/questStages.json` is the name of a Quest Helper step; a person sets it (the lines were written and checked by hand). A renamed step
  — fix `k` on the line. A new step without a line is shown by `qhm/gaps.py`: decide whether it needs a line in the list.
- the number of unreachable lines (`qhm/reach.py`) and of steps without a line (`qhm/gaps.py`) is capped in `tests/questMachines.test.ts`: it must not grow.

What the generator cannot do (in these places the plugin says "unknown", not "no"): conditions that read the client directly (the arrow on an NPC, `NpcInteractingRequirement`,
`InInstanceRequirement`, `RuneliteRequirement`, items on the ground). `DialogRequirement` with `mustBeActive` and `allowMesbox` is counted as an ordinary one: there are no such
conditions in the data now; when they appear, extend `interp.py` (`make_dialog`) and `qeval.py`/`QhMachine.java`.

`build_machines.py --check` on a fresh Quest Helper clone (commit `75b623a`, 16.09.2026) and a fresh constants dump (runelite-api 1.12.39) gives a file
byte-for-byte equal to the one in the repository: this is how the generator was checked to be reproducible.
