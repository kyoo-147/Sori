# Contributing to Sori

Thanks for helping improve Sori. The project is a Windows-first, local-first voice runtime, and contributions should preserve truthful capability boundaries: do not present fixture, mock, or diagnostic results as physical microphone or focused-app proof.

## Before you start

1. Create an issue or comment on an existing issue for non-trivial changes.
2. Keep changes focused and avoid committing generated artifacts, local data, credentials, models, or audio recordings.
3. Use an issue-scoped branch and open a pull request against `main`.

## Local checks

Install the repository dependencies, then run the checks relevant to your change:

```bash
npm install
npm run build
npm run test
npm run desktop:check
```

For Rust changes, run:

```bash
cargo test --workspace
```

The complete repository check is:

```bash
npm run check
```

Windows-only acceptance commands require the native prerequisites described in the relevant evidence report. If a prerequisite is missing, report the exact command and mark the result as blocked or unverified rather than substituting a fixture.

## Pull requests

A pull request should include:

- a concise explanation of the user-visible or maintenance change;
- the exact validation commands and results;
- explicit notes for any unavailable hardware, model, network, or Windows-only evidence;
- no unrelated formatting, generated files, or private artifacts.

Reviewers may request changes when a claim exceeds the evidence available from the test or runtime path.
