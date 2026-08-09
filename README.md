# Sori

Sori is an early local-first product scaffold for a **voice-to-useful-output workspace**: capture or import audio, preserve evidence-backed transcripts, and generate structured briefs with timestamps, decisions, and follow-ups.

Remote origin: <https://github.com/kyoo-147/Sori>

## Current foundation

- TypeScript + Node.js modular monolith
- Fastify HTTP boundary
- In-memory repositories for projects, artifacts, and runs
- Append-only run events with a derived current state
- Local-first storage direction: SQLite metadata + filesystem artifacts next
- Agent orchestration boundary documented for future Pi/Firstmate/Herdr integration

## Scripts

```sh
npm install
npm run dev      # start local API at 127.0.0.1:3000
npm run build    # type-check and compile
npm test         # run tests
npm run check    # build + tests
```

## Documentation

- [Product plan](docs/product-plan.md)
- [Architecture](docs/architecture.md)

## Local orchestration

Firstmate is installed locally in `.firstmate/` and intentionally ignored by git. Project-local rules live in `AGENTS.md`.
