# Tooling and Command Safety

Use available project tools (file search, code search, Git when present, shell, IDE, test runner, browser/runtime) according to the agent environment. Tool names differ; the principles below are portable. A project directory does not need to be a Git repository to be investigated.

## 1. Safe inspection order

Prefer:

1. Confirm the intended project root and access boundary.
2. Determine whether Git exists. If it does, record status and revision; if not, explicitly record that version history is unavailable and continue.
3. List the project structure and inspect top-level and nested documentation/manifests.
4. Search targeted symbols, routes, schemas and configuration.
5. Inspect relevant source and tests.
6. Run read-only inventory or static inspection.
7. Run existing local tests/builds when environment and dependencies are known.
8. Start local services only after understanding their configuration and side effects. Never stop an already-running application merely to simplify inspection.

## 2. Git hygiene (only when Git metadata exists)

Useful read-only commands (adapt to the environment):

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -20
git tag --sort=-version:refname | head -20
git diff --stat
git diff --check
```

Before editing, inspect existing user changes when Git exists. In a non-Git project, preserve existing files and record the initial file state as best the environment allows. Never discard or overwrite user work. Do not initialize Git as part of discovery. Do not reset, clean, force-push, rebase shared history, or rewrite commits unless explicitly requested and authorized.

## 3. Local project inventory

The bundled script can produce a file inventory for any local project directory without executing project code or requiring Git:

```bash
python scripts/project_inventory.py /path/to/project --out /tmp/project-inventory
```

For backward compatibility, `scripts/repo_inventory.py` calls the same helper. The inventory records Git metadata when available and reports it as unavailable for non-Git folders. The output may contain local paths and manifest metadata. Review it before sharing externally. Do not assume ignored or hidden directories contain no important project behavior; include them selectively when needed, while continuing to exclude secrets and large generated/vendor output by default.

## 4. Command risk classes

| Class | Examples | Default behavior |
|---|---|---|
| Read-only | list files, inspect Git if present, search source, read docs | Allowed within approved project boundary |
| Local validation | lint, typecheck, unit tests, build | Run when command is known and environment is safe |
| Environment mutation | install dependencies, start containers, generate files | Inspect command and expected effects first |
| Data mutation | migrations, seeders, scripts that edit data | Use disposable local/test data; seek approval if scope is unclear |
| External side effect | deploy, publish package, send email/webhook, modify cloud resource | Explicit authorization required |
| Destructive | delete data/files, drop schema, force reset, clean, rotate production key | Never do without explicit, specific authorization and safeguards |

## 5. Secrets and sensitive data

- Never dump `.env`, credential stores, private keys, tokens or production database records.
- Inspect variable names or example templates with values redacted.
- Avoid logging full environment variables or process environments.
- Redact Authorization headers, cookies, API keys, passwords, personal data and signed URLs from traces.
- Do not add secrets to test fixtures, snapshots, docs or commits.

## 6. Running tests safely

- Read package scripts, Make targets, test configuration and setup hooks before running unknown commands.
- Prefer a targeted test first, then affected suite, then full suite if feasible.
- Determine whether tests require a disposable database, cloud service or paid API.
- Confirm cleanup behavior before running integration tests that write data.
- Avoid parallel test execution where shared fixtures or global resources can corrupt results.
- Record exact commands and results; distinguish skipped, blocked, flaky and failed tests.

## 7. Search and output management

- Exclude dependency trees, build output and generated/minified files from broad searches unless relevant.
- Search by symbol/route/schema and follow references iteratively.
- Summarize long tool output; preserve source paths and key evidence.
- Avoid copying large source files into docs. Link to them and summarize behavior.
