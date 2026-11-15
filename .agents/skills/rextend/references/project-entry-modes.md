# Project Entry Modes and Source Discovery

Use this reference at the start of every substantial project task. The user may provide a hosted repository, a local Git checkout, an ordinary local folder, an existing running application, or a workspace containing multiple projects. **Git is optional.**

## 1. Entry-mode decision table

| Input provided | How to proceed | What to record |
|---|---|---|
| Hosted Git URL / repository connector | Use the authorized Git-hosting or repository tools available in the environment. If only a URL is provided and no source access exists, explain the limitation; do not pretend the code was inspected. | Host, owner/project, branch/tag/commit if actually resolved, accessible paths, unavailable areas |
| Local Git clone / checkout | Inspect the provided folder. Check whether `.git` is a directory or a worktree file. Record current commit, branch and user changes before any edits. | Absolute root privately; project-relative source paths in reports; commit, branch, status |
| Local folder without Git | Treat it as a fully valid project source. Inspect files, manifests, source, tests, config templates and docs. Do not initialize Git. | Source type `local-non-git`; version metadata if present; revision `unknown` if not available |
| Existing local app / runtime | Separate source analysis from observations of the running app. Use only supplied URLs, ports, accounts and safe local access. Do not stop/restart services or inspect unrelated process data without authorization. | Runtime state evidence, supplied endpoint, observed behavior, source/runtime correlation and limitations |
| Workspace / monorepo / multi-repo | Identify root manifests and nested project roots. Map which folders belong to the requested product; identify submodules, linked packages, workspace manifests and nested Git roots. | Workspace topology, project boundaries, internal dependencies, external dependencies |
| Binary/build artifact only | Inspect metadata and behavior that can be accessed safely, but do not claim source-level understanding. Request source code or a permitted runtime interface when deeper analysis is necessary. | Artifact type/version, observable behavior, missing source-level evidence |

A project can match more than one row. For example, a local Git checkout may also be a running application and a monorepo.

## 2. Resolve the project root safely

Use this precedence:

1. Exact path explicitly supplied by the user.
2. Current IDE/workspace root or selected project folder that is clearly the intended target.
3. A project folder attached, extracted, or materialized for the current task.
4. Ask one concise question only if two or more plausible project roots remain and selecting one would risk inspecting unrelated content.

Do not search the user's entire home directory, parent directories, or unrelated sibling folders to guess the project. Do not widen the scope just because a referenced path is inaccessible.

Before detailed inspection:

- Resolve the path and confirm it exists and is a directory when a local path is supplied.
- Record the approved boundary.
- Determine whether the supplied directory itself is the project root or a workspace containing several projects.
- Check for `.git` as either a directory or a file; a `.git` file is normal for worktrees and some submodule arrangements.
- Check for nested `.git` roots and submodules without assuming they should automatically be modified.
- Identify symlinks. Do not follow links outside the approved boundary unless that is necessary and authorized.
- Keep local absolute paths out of shareable documentation unless the user specifically needs them. Prefer project-relative paths.

## 3. Git is an evidence source, not a prerequisite

When Git exists, inspect it before making changes:

```bash
git -C /path/to/project rev-parse --show-toplevel
git -C /path/to/project status --short --branch
git -C /path/to/project rev-parse HEAD
git -C /path/to/project log -1 --oneline
```

Run commands only when the path is known and Git is available. Do not assume the supplied folder is the Git root; a path may be inside a larger worktree.

When Git does not exist:

- Record `Git metadata: unavailable` and `Source type: local-non-git`.
- Continue with normal inventory and source analysis.
- Look for version metadata in manifests, release files, changelogs, generated metadata or application about/version screens.
- Do not run `git init`, create a fake commit, or mark a project uninspectable because its history is absent.
- If a baseline comparison is needed, record a timestamped inventory or content hashes only when appropriate and safe; do not hash or expose secrets or huge generated artifacts.

When Git exists but history is shallow, detached, unavailable, or the working tree is dirty, state that precisely. Do not equate a dirty tree with a broken project.

## 4. Discover local projects without assuming a conventional layout

A local project may have no README, no `src/` folder, no package manifest, or no standard framework. Begin broadly and then narrow the investigation.

Look for:

- Project manifests and lockfiles for the languages and package managers present.
- Source directories, application entry points and bootstrap files.
- Build scripts, compiler configuration, generated code and artifact directories.
- Tests, fixtures, mocks, factories and test-runner configuration.
- Database schemas, migrations, seed data and local database files.
- API contracts, route definitions, client SDKs and integration adapters.
- Docker, Compose, devcontainer, service and infrastructure configuration.
- Environment templates and configuration key names, without reading secret values.
- Existing docs, ADRs, changelogs, contributor instructions and license files.
- Local scripts, schedulers, jobs, workers and process definitions.
- UI assets, static content, localization and design-system resources when relevant.

Treat generated, vendored, dependency and build directories as low-priority by default, not as proof that they are irrelevant. Inspect them selectively when behavior depends on them.

## 5. Existing local runtime and application state

If the user says the application is already running or configured:

1. Identify the exact runtime endpoint or local service the user has authorized you to inspect.
2. Prefer read-only health, version, UI and API observations first.
3. Do not restart, kill, reconfigure, migrate, seed, reset or deploy the application as part of passive discovery.
4. Do not dump process environments, command-line arguments containing secrets, browser storage, cookies, tokens or production data.
5. Use test accounts and synthetic data where interaction is required.
6. Record whether an observation came from source code, test execution, configuration or runtime behavior.
7. If local runtime behavior differs from the source tree, record both and investigate build/version drift rather than assuming one is correct.

If the runtime is unavailable, continue with static analysis and mark runtime findings as unverified.

## 6. Inventory helper

For local folders, invoke the bundled helper from the installed skill directory (replace the skill path with the actual installation path):

```bash
python /path/to/rextend/scripts/project_inventory.py /path/to/project --out /tmp/project-inventory
```

It is designed to work without Git and does not execute project code or read secret-file contents. It records Git metadata only when Git is available. Inspect the script and generated output before using them in sensitive environments. It is an inventory aid, not a substitute for architecture reconstruction.

## 7. Documentation metadata for every source type

At the top of substantial project documents, use fields appropriate to the source:

```yaml
status: draft | partial | verified | stale
last_verified: YYYY-MM-DD
source_type: remote-repository | local-git | local-non-git | runtime-only | mixed
source_revision: <commit SHA, release version, snapshot identifier, or unknown>
repository_commit: <optional; only when Git metadata exists>
scope: <project, module or behavior>
confidence: high | medium | low
```

Do not fabricate commit hashes, release numbers, timestamps, source URLs, or runtime observations. For a non-Git local folder, project-relative file paths and observed behavior are sufficient provenance when no revision metadata exists.

## 8. Stop conditions and reporting

Stop and report a limitation when:

- The user-provided path is inaccessible and no authorized alternate source exists.
- There are multiple plausible project roots and choosing one could inspect unrelated content.
- Required code is absent and only a binary/runtime artifact is available.
- Access would require bypassing permissions, credentials, sandbox boundaries or network restrictions.
- A requested action would modify a running service or production data without explicit authorization.

A useful report says what source was available, what was inspected, whether Git existed, what could be verified, and what remains unavailable. Never imply that a non-Git folder is less valid than a repository.
