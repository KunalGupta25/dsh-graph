---
status: draft
last_verified: YYYY-MM-DD
source_type: remote-repository | local-git | local-non-git | runtime-only | mixed
source_revision: <commit SHA, release version, snapshot identifier, or unknown>
repository_commit: <optional; omit when Git metadata is unavailable>
---

# Project Source and Runtime Map

## Project source identity

- Product:
- Source type (remote repository / local Git / local non-Git / runtime-only / mixed):
- Repository URL or local project path:
- Git metadata available? (yes/no/not applicable):
- Branch / commit / tag (omit or mark unavailable when no Git metadata exists):
- Release/version metadata (if available):
- Workspace root and approved inspection boundary:
- Monorepo, single project, nested projects, or multi-repository workspace:
- Languages and runtime versions (manifest-evidenced):
- Package managers / build systems:

## Top-level project structure

| Path | Purpose | Key contents | Evidence |
|---|---|---|---|
| | | | |

## Applications and processes

| Process / app | Entry point | Runtime | Responsibilities | How to run |
|---|---|---|---|---|
| Web/API/worker/CLI | | | | |

## Build and development commands

| Purpose | Command | Prerequisites | Verified? | Result / notes |
|---|---|---|---|---|
| Install | | | | |
| Build | | | | |
| Run | | | | |
| Unit tests | | | | |
| Integration tests | | | | |
| E2E tests | | | | |
| Lint/typecheck | | | | |

## Configuration

| Variable / key | Purpose | Required? | Secret value? | Default / source |
|---|---|---|---|---|
| `<NAME ONLY>` | | | Yes/No | |

Never record actual secret values.

## CI/CD and release

- Workflow files:
- Build artifacts:
- Release process:
- Migration / deployment order:
- Rollback mechanism:

## Existing local runtime (if applicable)

- Is the application already configured or running?
- Runtime entry point / URL / port (only if supplied or safely observed):
- Services and dependencies already active:
- Runtime observations verified:
- Processes/services not inspected or modified:

## Excluded or opaque areas

- Generated / vendored code:
- External repositories/services:
- Areas not inspected:
