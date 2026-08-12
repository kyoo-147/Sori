# Sori agent rules

- Route every project task, investigation, plan, audit, and coding change through Firstmate rather than doing project work directly when a crew workflow is available.
- Default crew runtime: Pi harness.
- Default crew model: GPT 5.6 Luna (`gpt-5.6-luna`).
- Default reasoning/thinking effort: `medium`.
- Default session backend: Herdr.
- Crew agents may use Pi and Herdr to supervise work and call additional agents when a task benefits from delegation.
- This repository is public on GitHub and uses direct PR workflow for now.
- No Mistakes is intentionally disabled until the MVP shape is proven.
- The agent may review and merge acceptable PRs without asking for captain approval during this early phase.
- Add stricter approval flow and No Mistakes guardrails after MVP.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
