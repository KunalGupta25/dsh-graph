---
status: draft
last_verified: YYYY-MM-DD
source_type: remote-repository | local-git | local-non-git | runtime-only | mixed
source_revision: <commit SHA, release version, snapshot identifier, or unknown>
repository_commit: <optional; only when Git metadata exists>
scope: <module-name>
confidence: low
---

# Module: <Name>

## Purpose

<What business or technical responsibility does this module own?>

## Responsibilities

- `<responsibility>`

## Non-responsibilities

- `<what belongs elsewhere>`

## Entry points

| Kind | Name | Source path / symbol | Notes |
|---|---|---|---|
| UI route | | | |
| API route | | | |
| CLI / command | | | |
| Event consumer | | | |
| Scheduled job | | | |
| Plugin hook | | | |

## Internal structure

| Layer / component | Responsibility | Source paths / symbols |
|---|---|---|
| Presentation / adapter | | |
| Application service / use case | | |
| Domain | | |
| Persistence | | |
| Async / integration | | |

## Dependencies

### Depends on

- `<module or service>` — `<reason and contract>`

### Depended on by

- `<module or service>` — `<reason>`

## Domain model and invariants

| Entity / value | Meaning | Important fields | Invariants / lifecycle |
|---|---|---|---|
| | | | |

## Data and persistence

- Tables / collections:
- Relationships and constraints:
- Tenant / ownership scope:
- Important queries and indexes:
- Migrations:
- Retention / deletion behavior:

## APIs and contracts

| Method / event | Contract | Authorization | Source |
|---|---|---|---|
| | | | |

## Events, jobs and side effects

| Trigger | Action | Retry / idempotency | Failure behavior |
|---|---|---|---|
| | | | |

## Security and permissions

- Authentication assumptions:
- Authorization checks:
- Tenant isolation:
- Sensitive data:
- Audit behavior:

## Configuration and feature flags

| Key | Default | Purpose | Secret? | Source |
|---|---|---|---|---|
| | | | | |

## Tests and quality evidence

| Test level | Test / suite | What it verifies | Gaps |
|---|---|---|---|
| Unit | | | |
| Integration | | | |
| Contract | | | |
| E2E | | | |

## Operational concerns

- Logs / metrics / traces:
- Health checks:
- Capacity / performance:
- Runbooks:

## Open questions, risks and contradictions

- `[UNKNOWN]` `<question>`
- `[INFERRED]` `<interpretation needing confirmation>`
- `[CONTRADICTORY]` `<sources disagree>`

## Evidence ledger

| Finding | Status | Confidence | Evidence path / symbol / test | Commit |
|---|---|---|---|---|
| | | | | |
