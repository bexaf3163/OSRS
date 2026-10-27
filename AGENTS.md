# Codex project instructions

These preferences apply only to Codex. They do not configure Claude Code or other agents. Read the existing project rules in [CLAUDE.md](CLAUDE.md) and [PROJECT_GUIDELINES.md](PROJECT_GUIDELINES.md); the owner's latest explicit instructions take precedence over conflicting older guidance.

## Persistent Codex preferences — 2026-10-23

Apply to Codex in this project and future related sessions:

- Use English for responses, explanations, plans, code comments, commits, documentation and development communication, even when the owner writes in Russian. Use another language only when explicitly requested for translation or output. Reason in English; never disclose chain-of-thought.
- Be extremely concise. Avoid filler, repeated requests, obvious-step narration and unnecessary summaries or code explanations. Spend tokens on implementation and verification, not commentary.
- Priority: correctness, full implementation, verification, token efficiency, then minimal visible explanation. Never reduce analysis or implementation quality, skip necessary checks, or weaken tests to save tokens.
- Inspect relevant implementation, dependencies, architecture, side effects, edge cases and existing behavior before important changes. Determine repository facts from source rather than guessing or asking the owner unnecessarily.
- Work autonomously when requirements are clear. Preserve working behavior, reuse project patterns, and prefer simple, maintainable production-quality solutions. Do not request routine implementation confirmations; retain applicable explicit permission requirements.
- Run relevant tests, validation, type checks, builds and linting. Report failures and unverified areas honestly; never imply checks ran when they did not.
- The owner permits batching publication while work continues to reduce overhead. Keep repairs in separate commits and the Claude handoff current; publish only after the final tree passes the required release gates.
- Owner decision2026-10-24: in-game tests belong to Claude. Continue code, desktop/browser and packaged automated verification; preserve explicit unverified game scenarios in docs/CLAUDE_IN_GAME_ACCEPTANCE.md. Do not require the owner to launch/play RuneLite for Codex, or count deferred game tests as passed.
- Silent execution mode: omit progress updates unless the owner must decide, grant permission or resolve a blocker. Do not narrate thoughts, speculation, deliberation, next steps, tool calls, file reads, commands or successful intermediate checks. Report intermediate success only when it materially affects the final result. Preserve sufficient internal reasoning, implementation quality and full verification.
- Final response: at most three short lines, reporting only the relevant result. Add explanation only when an error, risk or blocker requires it. For blockers, state "Blocked by: ..." and "Needed: ...".

## Publication preference — 2026-10-27

- Publish every completed, verified implementation batch autonomously to main with a new normal portable release through the existing Release workflow. No repeated owner confirmation is needed. Do not substitute previews/prereleases or hourly rebuilds. Synchronize package.json, package-lock.json and BridgeServer.PLUGIN_VERSION, add release notes and update the Claude handoff. Wait for release gates and verify the downloadable EXE digest before calling publication complete. Keep unfinished work out of the release; never overwrite existing release assets.
