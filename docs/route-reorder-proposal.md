# Route reordering — proposal only (nothing here is implemented)

Asked for by the owner on 2026-10-14: reordering is deferred; first document what would change and how saved progress survives.
Source: the Codex audit of the 2.53.0 export (sections 3 and 7).

## What is proposed

| # | Change | Why | Cost |
|---|---|---|---|
| 1 | Doric's Quest (S3-01) before The Knight's Sword (S2-07) in a "fast" branch | 1,300 Mining XP is Mining 10: S1-12 "Mining to 10" stops being a grind | Doric's clay, copper and iron ore (about 700 gp) are bought earlier, so S2-01 splits in two |
| 2 | Imp Catcher beads: drops or purchase decided by budget (S2-02) | The beads are 5,250 of the 10,400 gp shopping list | A branch, not a reorder |
| 3 | Group quests by region (Lumbridge/Draynor/Port Sarim, Varrock, Falador) | Fewer long walks | Order of S2-03..S2-12 changes; `requires` already holds the real dependencies |
| 4 | Rune Mysteries and X Marks started on the first castle visit | Saves a second trip | Step text only |
| 5 | Normal account vs pure path as two explicit tracks | The route never trains Defence before Dragon Slayer I | A track flag, not a second route |

Items 2, 4 and 5 do not move steps. Items 1 and 3 do.

## What the app does with order today (verified in the code)

- Progress is saved by **step id** (`progress.steps["S2-07"] = "done"`), plus notes by id, `doneAt` by id, `qpKept`, `tasksDone` by `"<id>:<task>"`.
  Position is not saved. Moving a step in `steps.json` does not touch any save.
- "What to do now" is the first open step in **array order** whose `requires` are closed (`next-step.ts`); `softRequires` only suggest.
- `scripts/validate.ts` currently demands that ids run 01, 02, 03 in array order inside a stage (a retired id may leave a gap). That rule is what a
  reorder would break, not any runtime code.
- The plugin receives the active step id from the app; it holds no route order of its own (`RouteTargets` is built from the step data it is given).
  To be re-verified before the change.

## How saved progress would be preserved

1. **No id is renumbered or reused.** A moved step keeps its id; a new step gets a new id (`S2-13`, never `S2-07` again).
2. The array order is the route order. The validator rule becomes "ids are unique and every stage's ids are a set without repeats", with the stage
   field and `stages.json` still saying where a step belongs. A step that changes stage keeps its id and gets the new `stage` value
   (`membersOnly` stages stay members-only: validated).
3. `requires` are unchanged. A move that would put a step before something it `requires` is rejected by the validator that already exists.
4. Stage totals (QP, levels in `goals.json`) are recomputed by `check-data` from the steps, so a move that changes a stage's totals fails the check
   until the table is updated: no silent forecast drift.
5. **Migration:** none is needed for ids. A saved profile that has a moved step "done" keeps it done. A profile that has finished stage 3 but not the
   moved step shows it as open: that is the truth, and the player may close it with "done" or "skip".
6. Exported progress files and profiles are validated through `normalizeProgress`, which drops ids that no longer exist and reports the count; no id
   is removed by a reorder, so nothing is dropped.

## Rollback

- A reorder is one commit that changes array order (and, for item 1, the S2-01 split). Reverting it restores the old order; saves are untouched
  either way because they hold ids only.
- Release rollback is the previous portable build (kept per release on GitHub); the plugin protocol is not touched.

## Tests that would ship with it

- Every previously valid id still exists; none is reused for a different step (a frozen id list in the test).
- A save with each step done in turn loads with the same done/skipped map after the reorder.
- `nextStep` for a handful of saved profiles gives a step whose `requires` are closed.
- Stage QP and level totals still match `goals.json` (`check-data`).

## Not decided

- Whether the fast branch is the default or a switch. It changes what the route export looks like for everyone, so it is the owner's call.
