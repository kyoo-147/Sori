# Sori implementation schedule

This schedule is ordered so work can continue automatically while the captain is away. Each task should keep tests passing and preserve the local-first architecture boundary.

## Done

- Product plan and market/technology research captured.
- TypeScript/Fastify modular-monolith foundation.
- Project, artifact, and run domain boundaries.
- In-memory repositories and run lifecycle events.
- Basic tests and CI workflow.

## Next task queue

1. **SQLite metadata adapter**
   - Add migrations for `projects`, `artifacts`, `runs`, and `run_events`.
   - Keep repository interfaces unchanged.
   - Add tests shared between memory and SQLite adapters.

2. **Filesystem artifact store**
   - Add content-addressed storage under a configurable local data directory.
   - Record SHA-256, content type, size, and original filename.
   - Add delete/export primitives before real user audio.

3. **Workflow skeleton**
   - Define `transcribe_audio` and `generate_brief` run step types.
   - Implement stub adapters that consume text fixtures and produce a brief artifact.
   - Preserve evidence references and timestamps in structured output.

4. **Local UI or CLI**
   - Minimal path: create project, register audio/transcript artifact, start workflow, inspect run events.
   - Keep the UI replaceable; do not couple it to Pi/Herdr terminal state.

5. **Trust baseline**
   - Add retention policy fields.
   - Add export/delete operations.
   - Add an approval state for external API/model calls.

## Push blocker

GitHub push requires authentication on this machine. Run `gh auth login` or configure a credential helper/token, then push `main`.
