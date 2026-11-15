# Feature and Customization Workflow

Use this reference before implementing a feature, altering existing behavior, creating an extension, or customizing an existing product.

## 1. Classify the change

| Change type | Typical considerations |
|---|---|
| Configuration | Defaults, validation, precedence, restart behavior, secrets |
| UI/theme customization | Design system, accessibility, responsive states, navigation, permissions |
| New UI capability | Existing APIs, client state, loading/error/empty states |
| Domain feature | Invariants, lifecycle, transactions, authorization, audit |
| API change | Contract compatibility, versioning, clients, generated SDKs |
| Data model change | Migration, backfill, indexes, rollback, old application versions |
| Async/integration change | Event schema, retries, idempotency, ordering, partial failure |
| Plugin/extension | Manifest, lifecycle, version compatibility, trust boundary, permissions |
| Refactor | Behavior preservation, dependency boundaries, test characterization |

## 2. Feature intake

A feature request should be converted into:

- Problem statement.
- Users/actors and their goals.
- Desired outcome.
- Functional scope.
- Explicit non-goals.
- Acceptance criteria written as observable outcomes.
- Authorization and tenant rules.
- Error and recovery expectations.
- Data and audit implications.
- Compatibility constraints.
- Performance or scale expectations, if material.

Use examples and Given/When/Then scenarios where they clarify behavior.

## 3. Change impact map

For each affected area mark: `Changed`, `Reviewed-no-change`, `Not-applicable`, or `Unknown`.

| Area | Review questions |
|---|---|
| UX | Are all states represented: loading, empty, success, validation, forbidden, error? |
| API | Are schemas, status codes, error codes and compatibility preserved? |
| Domain | Are business rules and state transitions explicit? |
| Data | Are constraints, indexes, backfill and rollback considered? |
| Security | Is access checked server-side? Are tenant boundaries enforced? |
| Events/jobs | Are duplicates, retries, ordering and poison messages handled? |
| Integrations | Are provider outages, rate limits, timeouts and schema changes handled? |
| Caching/search | Can stale data or invalidation bugs occur? |
| Reporting/export | Do aggregates, filters, exports and audit history remain correct? |
| Operations | Are logs, metrics, alerts and runbooks adequate? |
| Tests | Are unit, integration, E2E and regression tests updated? |
| Docs | Are user, API, architecture and deployment docs updated? |

## 4. Design constraints

- Keep domain behavior in the appropriate domain/application layer.
- Keep transport adapters thin: parse, authenticate/authorize, invoke application behavior, map result.
- Validate untrusted input at trust boundaries.
- Enforce permissions on the server even if the UI hides controls.
- Include tenant identity in authorization and data access where the system is multi-tenant.
- Use explicit transactions for atomic changes.
- For async side effects, consider outbox/inbox, idempotency keys, deduplication, retries and dead-letter handling.
- Make external calls timeout-bounded and resilient; do not hold database transactions open across slow remote calls unless the architecture intentionally requires it.
- Preserve API compatibility or deliberately version and document breaking changes.
- Make migrations safe for the deployment's rollout strategy (for example expand/migrate/contract when old and new versions may overlap).
- Prefer supported extension points when they satisfy the requirement.

## 5. Implementation sequence

A typical sequence is:

1. Add or update domain types and invariants.
2. Add persistence changes and migration.
3. Add application use case/service.
4. Add authorization and audit behavior.
5. Add API/transport contract.
6. Add UI/client behavior.
7. Add async processing/integration if needed.
8. Add tests at each layer.
9. Update docs, examples, telemetry and release notes.

Adapt the order to the actual architecture. Do not create layers that do not exist just to follow this sequence.

## 6. Customization and upstream divergence

Before changing an upstream-based project:

- Check configuration, theme tokens, hooks, plugin APIs and extension points.
- Identify what can be implemented outside the upstream core.
- Record modified upstream files and patch rationale.
- Track the upstream version/commit from which the fork diverges.
- Document upgrade conflicts and regression checks.
- Avoid editing generated files unless the source generator or source definition is also updated.

A customization is maintainable only when there is a documented method to configure, test, upgrade and remove it.

## 7. Feature acceptance checklist

- [ ] Requirement and non-goals are recorded.
- [ ] User journeys and permission rules are mapped.
- [ ] Existing behavior and extension points are understood.
- [ ] Impact review covers UI, API, domain, data, security and operations.
- [ ] Design decision is documented where material.
- [ ] Acceptance criteria are testable.
- [ ] Positive, negative and boundary tests are defined.
- [ ] Implementation follows project conventions.
- [ ] Migration and rollback strategy are documented if needed.
- [ ] API and user documentation are updated.
- [ ] Targeted and regression checks have run.
- [ ] Remaining limitations are disclosed.
