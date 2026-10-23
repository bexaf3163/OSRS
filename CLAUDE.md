# OSRS Path — project rules

Binding operating contract for every task in this repo: @PROJECT_GUIDELINES.md (verbatim copy of `OSRS_Path_Master_Project_Guidelines.md`). Follow it strictly; it overrides default habits.

For desktop or RuneLite interface work, also read @CLAUDE_REDESIGN_HANDOFF.md. It records the accepted Modern dark evolution of Clear Path, preserved functionality, implementation map, audit findings and regression checks; do not restore an older design over it.

Key points to keep in mind every time:
- Reply in concise English. Player-facing UI text (desktop, HUD, overlays, dialogs, warnings) is native English with canonical OSRS Wiki / Quest Helper names — no Cyrillic, no dual naming (section 3, amended). Code comments, commit messages and docs are English. The whole project is English now; do not reintroduce Cyrillic text (`tests/questStages.test.ts` guards the quest data).
- Inspect existing code first, reuse existing systems, make small surgical diffs, no parallel implementations.
- State is `PRESENT | MISSING | UNKNOWN`; never turn unavailable data into `0` or `MISSING`.
- Never invent requirements, coordinates or availability; mark them for verification.
- Automation is a companion, never a bot: in the game itself at most ~2 clicks every several minutes, no movement/combat/skilling; never spend GP automatically.
- Before declaring completion run: `npm run build`, `npm test -- --reporter=dot`, `npm run check-data`, `cd runelite-bridge && ./gradlew -q testClasses` (plus the full Gradle `test` when plugin logic changed). Never report PASS if a check failed or was skipped.
- Final response: changed files and verification results in 1–2 sentences.

## Persistent owner preferences — 2026-10-23

Apply to this project and future related sessions:

- Use English for responses, explanations, plans, code comments, commits, documentation and development communication, even when the owner writes in Russian. Use another language only when explicitly requested for translation or output. Reason in English; never disclose chain-of-thought.
- Be extremely concise. Avoid filler, repeated requests, obvious-step narration and unnecessary summaries or code explanations. Spend tokens on implementation and verification, not commentary.
- Priority: correctness, full implementation, verification, token efficiency, then minimal visible explanation. Never reduce analysis or implementation quality, skip necessary checks, or weaken tests to save tokens.
- Inspect relevant implementation, dependencies, architecture, side effects, edge cases and existing behavior before important changes. Determine repository facts from source rather than guessing or asking the owner unnecessarily.
- Work autonomously when requirements are clear. Preserve working behavior, reuse project patterns, and prefer simple, maintainable production-quality solutions. Do not request routine implementation confirmations; retain applicable explicit permission requirements.
- Run relevant tests, validation, type checks, builds and linting. Report failures and unverified areas honestly; never imply checks ran when they did not.
- Normal final response: a few lines at most, usually "Done." followed by "Changed", "Verified", and an important "Note" only when needed. Tiny tasks may use "Done — ...". For blockers, state "Blocked by: ..." and "Needed: ...". Explain in detail only when explicitly requested.
