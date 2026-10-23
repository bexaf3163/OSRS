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
- Normal final response: a few lines at most, usually "Done." followed by "Changed", "Verified", and an important "Note" only when needed. Tiny tasks may use "Done — ...". For blockers, state "Blocked by: ..." and "Needed: ...". Explain in detail only when explicitly requested.
