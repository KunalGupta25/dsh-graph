# Project Knowledge Base

> Entry point for agents and developers. Link to canonical documentation; do not duplicate deep technical details here.

## Project identity

- **Product:** `<name>`
- **Source type:** `remote-repository | local-git | local-non-git | runtime-only | mixed`
- **Source location:** `<repository URL, local project path, or workspace reference>`
- **Version / revision analyzed:** `<release version, commit SHA, snapshot identifier, or unknown>`
- **Git metadata:** `<available / unavailable / not applicable>`
- **Last verified:** `<YYYY-MM-DD>`
- **Documentation status:** `draft | partial | verified | stale`

## What this project does

`<Brief, evidence-backed explanation of the product and primary users.>`

## Start here

| Topic | Canonical document |
|---|---|
| Product, scope and glossary | [Project overview](project/product-overview.md) |
| Project source and runtime map | [Project map](reverse-engineering/project-map.md) |
| Observed architecture | [Architecture](reverse-engineering/architecture-observed.md) |
| Modules | [Module catalog](architecture/module-catalog.md) |
| Features and workflows | [Feature inventory](reverse-engineering/feature-inventory.md) · [Workflow catalog](reverse-engineering/workflow-catalog.md) |
| Data | [Database design](architecture/database-design.md) |
| APIs and integrations | [API catalog](architecture/api-catalog.md) · [Integrations](reverse-engineering/integration-catalog.md) |
| Security and access | [Security model](architecture/security-model.md) |
| Tests and quality | [Test strategy](quality/test-strategy.md) |
| Development and operations | [Local development](operations/local-development.md) · [Deployment](operations/deployment.md) |
| Decisions | [Architecture decisions](architecture/decisions/) |
| Unknowns and risks | [Assumptions and open questions](project/assumptions-and-open-questions.md) |

> Update links to match the actual project structure.

## Quick commands

```bash
# install
<command>

# run locally
<command>

# run focused tests
<command>

# run full validation
<command>
```

## Verified scope and known gaps

- **Verified:** `<what has actually been inspected and tested>`
- **Partially understood:** `<areas with incomplete evidence>`
- **Unknown / blocked:** `<questions and blockers>`
- **Out of scope:** `<areas not investigated>`

## Current engineering priorities

1. `<priority>`
2. `<priority>`
3. `<priority>`
