# Sori architecture

## Baseline

Sori starts as a local-first TypeScript modular monolith. The foundation separates domain logic from adapters so the first prototype can run locally while still leaving a path to PostgreSQL, object storage, hosted workers, and agent orchestration.

```text
HTTP/API adapter
      |
Application services
      |
Domain modules: projects, artifacts, runs
      |
Repository interfaces
      |
Storage adapters: memory now, SQLite/filesystem next
```

## Domain modules

- **Projects**: user-visible workspace for a research/interview/audio workflow.
- **Artifacts**: audio, transcript, generated brief, export, and supporting files. Large bytes live outside the metadata store.
- **Runs**: durable jobs that transform artifacts. Runs emit append-only events and expose a derived current state.

## Run lifecycle

```text
queued -> running -> waiting_approval -> completed
                  \-> failed
                  \-> cancelled
```

Every transition should be recorded as an event with actor, timestamp, and machine-readable payload. Notifications are not authority; stored events are.

## Agent boundary

Pi, Firstmate, and Herdr are operator/development orchestration tools for this repository. Sori product code must not depend on terminal rendering or a specific harness. Future agent integration should use an `AgentRunner` adapter with typed inputs, capability scopes, approval policies, cancellation, and audit events.

## Storage direction

- Current scaffold: in-memory repositories for fast tests and API shape.
- Next: SQLite metadata and filesystem artifacts.
- Later hosted mode: PostgreSQL plus object storage.

## Security defaults

- Model/tool outputs are untrusted until validated.
- No irreversible action without an explicit approval transition.
- Secrets do not enter prompts, artifacts, git, or logs.
- Retention/export/delete behavior must exist before real user audio pilots.
