# Sori product plan

## Product thesis

Start Sori as a narrow **voice-to-useful-output workspace**: upload or capture audio, preserve an evidence-backed transcript, and generate a structured brief with timestamps, decisions, follow-ups, and exportable artifacts.

This is intentionally narrower than a generic voice assistant or meeting bot. The first validation target is multilingual interview/research audio, with creator repurposing and Korean learning kept as later options.

## Milestones

### Phase 0 — Foundation (current)

- Establish TypeScript modular-monolith skeleton.
- Define durable domain boundaries: projects, artifacts, runs, events, approvals.
- Keep storage local-first and replaceable.
- Add a small HTTP health/API boundary and testable in-memory repositories.

### Phase 1 — Prototype workflow

- Audio artifact registration and metadata.
- Transcript artifact import or adapter stub for transcription providers.
- Structured brief generation adapter with evidence links.
- Local UI or CLI for: create project → add audio → run workflow → review output.

### Phase 2 — Trust and validation

- Consent/retention settings per project.
- Deletion/export flows.
- Cost and usage accounting per run.
- 15–20 customer interviews and 20–30 concierge-processed recordings.

### Phase 3 — Pilot

- Replace local storage adapters with SQLite/object storage adapters.
- Add authentication boundary if hosted collaboration is validated.
- Add integrations for one destination such as Notion, Google Docs, or Slack.

## Near-term implementation priorities

1. Keep all product state behind repository interfaces.
2. Treat model/tool output as untrusted and auditable.
3. Store run events append-only; derive current state from events.
4. Make every expensive or external side effect explicit and cancellable.
5. Avoid premature vector databases, microservices, or cloud lock-in.

## Open decisions for the captain

- First beachhead: researchers/interviewers, meeting-heavy teams, creators, or Korean learning?
- First client: local web app, desktop shell, CLI, or hosted browser app?
- First transcription path: import transcripts, local model, or hosted API?
- Required privacy posture for pilot data retention and provider training opt-out?
