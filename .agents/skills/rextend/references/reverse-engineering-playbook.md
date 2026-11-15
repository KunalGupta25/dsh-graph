# Reverse Engineering Playbook

Use this reference when investigating a remote repository, a local Git checkout, a non-Git project directory, an existing application/runtime, or a multi-folder workspace; reconstruct architecture, understand modules, or compare an existing system with a reimplementation.

## 1. Establish the source baseline

Record:

- Product/project name and purpose as currently understood.
- Source type: remote repository, local Git checkout/worktree, non-Git project directory, runtime-only application, or mixed workspace.
- Resolved project root and investigation boundary.
- Project shape: single app, monorepo, service collection, SDK, library, infrastructure, or mixed.
- Whether source files are present, whether the app is already configured/running, and what runtime access is available.
- Version evidence: commit SHA / branch / tag when Git exists; release metadata or manifest version where available; otherwise `no Git metadata` / `unknown`.
- Working-tree status only when Git metadata exists.
- Linked projects, nested repositories, submodules, symlinks and external dependencies, with boundary notes.
- Languages, frameworks, runtime versions and package managers supported by manifests.
- Official setup/build/test commands and known environmental prerequisites.
- Existing docs, contribution rules, license, changelog, ADRs and security policy.
- What is in scope and explicitly out of scope for the investigation.

Do not infer the production architecture from a local development Compose file alone. Look for deployment manifests and deployment documentation.

## 2. Source discovery checklist

### Product and entry points

- README, docs, website references and release notes.
- Executable entry points, `main` functions, app bootstrap, server startup, CLI commands.
- Route registration and page/router definitions.
- Plugin/extension registration and dependency injection containers.
- Feature flags and configuration loading.

### Backend

- Routes/controllers/handlers/resolvers.
- Middleware, guards, filters, interceptors and validators.
- Application services / use cases.
- Domain entities, aggregates, value objects, policies and state machines.
- Repositories, ORM models, query builders and direct SQL.
- Transactions, locks, constraints and concurrency controls.
- Serializers, DTOs, schemas and error mapping.

### Frontend

- Route and page tree.
- Layouts, shared components, design system and themes.
- State containers, context providers and server-state/cache layer.
- API clients, request interceptors and generated clients.
- Forms, validation, tables, filters, search and bulk actions.
- Navigation guards and permission-dependent rendering.
- Responsive behavior, accessibility patterns and localization.

### Data

- Schema definitions and migrations.
- Seeders, fixtures and test factories.
- Foreign keys, uniqueness, check constraints and indexes.
- Tenant/organization ownership model.
- Soft deletion, retention, archival and audit history.
- Search indexes, caches, object storage and derived data.

### Async processing and integrations

- Queue definitions and worker consumers.
- Event publishers/subscribers and event schema/versioning.
- Scheduled jobs and cron definitions.
- Webhooks, callbacks, outbound HTTP clients and SDK integrations.
- Retry, timeout, backoff, deduplication and dead-letter behavior.
- Outbox/inbox patterns or compensating actions.

### Security and operations

- Identity provider, login/session/token handling and MFA/SSO support.
- RBAC, ABAC, policy definitions and permission checks.
- Tenant scoping and cross-tenant data access prevention.
- Secrets references, encryption, signing and key management.
- Audit trail and sensitive-data access.
- Docker, Kubernetes, Terraform, Helm, reverse proxy, TLS and DNS config.
- Health/readiness checks, logs, metrics, traces and alerts.
- Backup, restore, upgrade and disaster recovery procedures.

### Quality and delivery

- Unit/integration/e2e/contract/performance/security test directories.
- Test runners, fixtures, mocks, snapshots and coverage thresholds.
- Lint, formatter, type checker and static analysis.
- CI pipelines, build artifacts, release jobs and dependency scanning.
- Versioning, changelog and migration/release policy.

## 3. Trace one behavior end to end

For each high-value feature, create a trace like this:

| Stage | What to locate | Evidence to record |
|---|---|---|
| Entry point | UI route, CLI command, API route, event, scheduled task | Path, symbol, route/event name |
| Presentation/caller | Component, form, client or caller | State, validation, payload construction |
| Transport | HTTP/RPC/API client | Method, path, headers, schema, status codes |
| Access control | Authentication and authorization | Identity source, policy, tenant scope |
| Input boundary | Parser, validator, serializer | Required fields, types, constraints |
| Application logic | Handler, use case, service | Orchestration and transaction boundary |
| Domain logic | Entity, aggregate, policy, state machine | Invariants, valid transitions and rules |
| Persistence | Repository, ORM, SQL, database | Tables, queries, constraints and indexes |
| Async side effects | Events, queues, notifications, integrations | Payload, ordering, retries, idempotency |
| Output | Response mapping and UI update | Response shape, state changes, errors |
| Tests | Unit, integration and E2E | Names, fixtures, assertions, gaps |

When there are multiple implementations (for example REST and GraphQL), trace each entry point to shared domain logic and note where behavior diverges.

## 4. Understand the domain, not just the code structure

For each domain object, record:

- Business meaning and synonyms.
- Identity and ownership.
- Important fields and data types.
- Relationships and cardinality.
- Valid lifecycle states and transitions.
- Invariants and validation rules.
- Who can create/read/update/delete/transition it.
- Side effects and events.
- Retention, archival and deletion behavior.
- Whether the entity is tenant-scoped.

Distinguish domain entities from transport DTOs, ORM records, UI view models and external provider objects. Similar field names do not guarantee equivalent semantics.

## 5. Reconstruct runtime behavior

When the system can be run safely:

1. Create a test account and non-sensitive test data.
2. Perform a single focused workflow.
3. Capture browser/network request, API response and visible state.
4. Observe persisted data using a safe test database or supported admin interface.
5. Inspect emitted events/jobs and downstream effects.
6. Repeat with invalid, forbidden, duplicate and boundary inputs.
7. Restart relevant components and verify state/recovery behavior where relevant.
8. Save reproducible steps and sanitized evidence.

Do not use production user data for experimentation. Do not bypass access controls to observe behavior.

## 6. Understand the test architecture

For each module, locate:

- Fast unit tests and their naming conventions.
- Integration test harness and dependency setup.
- API/contract tests and generated schema validation.
- Browser/E2E setup and stable selectors.
- Fixtures, factories, seed data and cleanup hooks.
- Mocking policy and what must remain real in integration tests.
- Coverage configuration and any quality gates.
- Known skipped, flaky or quarantined tests.

A test name suggests intent; inspect assertions to know what is actually verified.

## 7. Search strategy

Use targeted searches instead of opening every file indiscriminately:

1. Search for visible route, feature name, API path, schema/type, event name or UI label.
2. Follow imports, symbol references and callers.
3. Search for database table/entity references and migration history.
4. Search for test names, fixtures and snapshots related to the feature.
5. Search configuration and feature flag references.
6. Search release notes/commits for recent behavioral changes.

Avoid spending time reading generated output, vendored packages, minified assets, build caches or dependency trees unless the investigation explicitly concerns them.

## 8. Evidence ledger format

Use this format for important findings:

| ID | Finding | Status | Confidence | Evidence | Version | Open question |
|---|---|---|---|---|---|---|
| OBS-001 | Example: invoice creation checks tenant membership before persistence | Verified | High | `src/invoices/create.ts:createInvoice`; `tests/invoices/create.test.ts` | `<commit>` | Does the async export repeat the check? |

Use stable IDs for findings cited by other documents. Avoid using line numbers as the only locator because they change frequently.

## 9. Investigation exit criteria

An area is sufficiently mapped for a specific task when:

- Its entry points and callers are known.
- Its core behavior and domain rules are described.
- Its data reads/writes and side effects are identified.
- Its access-control boundary is understood.
- Its relevant tests and known gaps are located.
- Its important failure paths are known or explicitly marked unknown.
- Dependencies and likely change impact are documented.

This is scoped understanding, not proof that the whole product has been understood.
