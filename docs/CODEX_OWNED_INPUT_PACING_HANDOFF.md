# Owned inputs and GE replenishment pace — partial T12

Reproduced: a500-gp pie-shell target with14 already-owned dishes/dough took an estimated7.525 minutes only because the evaluator applied the dish purchase cap to production. The same inputs without that bottleneck took1.234 minutes. Owning the inputs does not require buying them again.

The existing cash/trip/sale simulation now separates work/sale pace from input replenishment pace. Each trip only receives a purchase penalty for limited inputs it actually needs to buy; owned quantities are consumed normally, then replenishment pacing resumes. Output liquidity still caps production, including owned-stock bursts. Explicit fast/typical/slow selection avoids collapsing a range when all steady-state figures share the same buy cap.

The steady-state hourly figure, prices/tax/opportunity cost, working-capital cash accounting, protected stock and input procurement remain in the existing engine. No new screen, state store, trade automation or sale-income assumption.

Four regressions cover owned stock with both healthy/thin sale markets, later stock exhaustion and another missing limited input. The original owned-stock case failed before the repair. Earlier local gate:1,940 tests; final output-liquidity follow-up:1,941 Vitest/153files, TypeScript/build, data0errors/warnings pass. No Java production code changed; latest full Java608 passed on the preceding Magic tree. Fresh cumulative browser/portable acceptance remains required.

Remaining: actual four-hour purchase windows, observed already-used/shared allowances, partial-trip purchase averaging and complete acquisition travel. Purchased inputs still use a conservative steady replenishment average. This block must not be described as a complete GE timing model or an observed profit guarantee. No current prices or limits were copied into runtime data.

Rule checked: https://oldschool.runescape.wiki/w/Buy_limit — purchase windows begin with the first purchase and reset after four hours; some variants share a limit. Existing live mapping supplies the item limits. In-game acceptance belongs to Claude: CLAUDE_IN_GAME_ACCEPTANCE.md.
