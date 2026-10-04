# OSRS «Путь» — project rules

Binding operating contract for every task in this repo: @PROJECT_GUIDELINES.md (verbatim copy of `OSRS_Path_Master_Project_Guidelines.md`). Follow it strictly; it overrides default habits.

Key points to keep in mind every time:
- Reply in concise English; player-facing UI text stays natural Russian (`Русское название (English Name)`); new developer comments, commit messages and type keys are English; do not translate existing Russian comments or test names.
- Inspect existing code first, reuse existing systems, make small surgical diffs, no parallel implementations.
- State is `PRESENT | MISSING | UNKNOWN`; never turn unavailable data into `0` or `MISSING`.
- Never invent requirements, coordinates or availability; mark them for verification.
- Automation is a companion, never a bot: in the game itself at most ~2 clicks every several minutes, no movement/combat/skilling; never spend GP automatically.
- Before declaring completion run: `npm run build`, `npm test -- --reporter=dot`, `npm run check-data`, `cd runelite-bridge && ./gradlew -q testClasses` (plus the full Gradle `test` when plugin logic changed). Never report PASS if a check failed or was skipped.
- Final response: changed files and verification results in 1–2 sentences.
