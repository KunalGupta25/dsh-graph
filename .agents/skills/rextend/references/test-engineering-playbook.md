# Test Engineering Playbook

Use this reference to design test cases and test suites from project behavior, business requirements, architecture and risk.

## 1. Start with a traceable test basis

A test should trace to one or more of:

- Requirement or acceptance criterion.
- Observed reference behavior.
- Domain invariant or state transition.
- API/schema contract.
- Security policy or trust boundary.
- Reliability/performance objective.
- Regression defect or production incident.

Record the trace link. Avoid writing tests whose purpose is unclear.

## 2. Select test levels

| Level | Scope | Good at finding | Avoid |
|---|---|---|---|
| Static checks | Syntax, types, lint, dependency rules | Mechanical errors and unsafe patterns | Treating clean static checks as proof of behavior |
| Unit | Pure function/class/domain rule | Branches, edge cases, invariants | Excessive mocking of the behavior under test |
| Component | UI component or isolated service | Rendering, validation, local interactions | Recreating the whole system unnecessarily |
| Integration | Real interaction among app components and dependencies | ORM/query/config/serialization/queue wiring defects | Fragile reliance on shared mutable state |
| Contract | Provider/consumer schema and protocol | Compatibility drift | Duplicating all business behavior in contract tests |
| End-to-end | User workflow across deployed-like system | Routing, auth, integration and UX gaps | Making every small branch an expensive E2E test |
| Non-functional | Load, security, accessibility, resilience, recovery | Operational limits | Running production-impacting experiments without authorization |

## 3. Test design dimensions

Apply relevant dimensions to the feature; do not mechanically create every possible combination.

### Functional

- Valid inputs and successful workflows.
- Required/optional fields and defaults.
- Invalid types, missing values and malformed payloads.
- Boundary values, maximum lengths, empty values and large collections.
- Duplicate and conflicting operations.
- State transitions, illegal transitions and lifecycle termination.
- Pagination, filters, sorting, search, bulk actions and export.

### Authorization and tenancy

- Unauthenticated request.
- Authenticated user without permission.
- Read permission without write permission.
- Cross-role and privilege-escalation attempts.
- Cross-tenant access through IDs, filters, exports, search and background jobs.
- Object-level authorization, not only route-level access.
- Revoked/expired sessions and stale permissions.

### Data integrity and concurrency

- Foreign-key and uniqueness violations.
- Transaction rollback on partial failure.
- Simultaneous updates and lost-update behavior.
- Optimistic/pessimistic lock conflicts.
- Duplicate event delivery and request retries.
- Idempotency key reuse and conflicting payloads.
- Ordering and out-of-order events where order matters.
- Soft-delete, restore, retention and archival rules.

### Integration and resilience

- Provider success, slow response, timeout and outage.
- Rate limiting and retry-after behavior.
- Invalid/malformed provider response.
- Network interruption during request or callback.
- Partial success across multiple side effects.
- Retry exhaustion and dead-letter handling.
- Duplicate webhook delivery and signature verification.

### Time, locale and presentation

- Timezone boundaries, daylight-saving transitions where relevant, midnight and date rollover.
- Currency precision, rounding and locale formatting.
- Long labels, right-to-left text and translated content where supported.
- Keyboard-only navigation, focus handling, screen reader names and contrast.
- Responsive viewport states and browser compatibility.
- Loading, empty, forbidden, validation and error states.

### Security

- Input validation and injection vectors.
- Output encoding and script injection.
- CSRF/session fixation where applicable.
- SSRF/path traversal/file upload abuse where applicable.
- Rate-limit and abuse controls.
- Secret leakage in logs/errors.
- Sensitive object access and audit trail integrity.
- Dependency and supply-chain risks.

### Non-functional

- Latency under expected workload.
- Throughput, concurrent users and burst behavior.
- Memory, CPU, connection and queue saturation.
- Large dataset behavior and query plan regressions.
- Failover, restart and recovery time.
- Backup restore and migration duration.

## 4. Test-case format

Each test should contain:

| Field | Description |
|---|---|
| ID | Stable identifier, e.g. `BILL-API-014` |
| Title | Clear behavior under test |
| Level | Unit/component/integration/contract/E2E/security/performance |
| Requirement link | Requirement, acceptance criterion, observation or defect ID |
| Priority | P0 critical, P1 high, P2 normal, P3 low; define project-specific meaning |
| Preconditions | User, role, tenant, data, feature flag and system state |
| Input / test data | Exact values or factory/fixture reference |
| Steps | Deterministic actions |
| Expected result | Observable response, persisted state and side effects |
| Cleanup | How data and resources are isolated/removed |
| Automation | Automated/manual and tool location |
| Evidence | Assertion, API response, screenshot, trace, log or query reference |

Avoid expected results such as "works correctly". Specify the response, state, emitted event, denied action or other measurable outcome.

## 5. Test suite by development stage

### Stage 0 — Before implementation

- Characterization tests for current behavior when changing an existing system.
- Acceptance scenarios and decision tables.
- API/schema contract expectations.
- Risk-based test plan.
- Baseline test and build status.

### Stage 1 — During implementation

- Unit tests for domain rules and error branches.
- Component tests for UI behavior.
- Static checks, type checks and lint.
- Migration/schema validation.
- Targeted tests on each small change.

### Stage 2 — Feature verification

- API integration tests.
- Persistence and transaction tests.
- Authorization and tenant isolation tests.
- Event/job and external adapter tests.
- UI flow tests for all key states.

### Stage 3 — Module integration

- Cross-component workflows within the module.
- Contract compatibility with adjacent modules.
- Failure and retry scenarios.
- Search/report/export/cache consistency.

### Stage 4 — System regression

- Critical end-to-end journeys.
- Cross-module workflows.
- Role and tenant matrix.
- Upgrade and data migration scenarios.
- Existing defect regression suite.

### Stage 5 — Pre-release / operational readiness

- Security checks and threat-specific tests.
- Performance/load/stress tests with documented workload assumptions.
- Backup restoration and disaster recovery rehearsal.
- Rolling deployment and rollback rehearsal if applicable.
- Smoke/health/readiness checks.
- Observability and alert verification.

### Stage 6 — Post-deployment verification

- Smoke tests using safe synthetic accounts/data.
- Error rate, latency and saturation monitoring.
- Queue lag and failed job checks.
- Audit and business-event checks.
- Rollback triggers and owner/runbook confirmation.

## 6. Test data strategy

- Prefer factories/builders and isolated fixtures.
- Make test data deterministic and independent of execution order.
- Avoid production data; use synthetic or approved anonymized data.
- Include realistic relational data and permission ownership.
- Reset database/queues/object storage safely between tests.
- Use fixed clocks and controlled randomness for time-sensitive logic.
- Use realistic large datasets for performance tests, not tiny unit fixtures.
- Keep secrets out of fixtures, snapshots and test logs.

## 7. Reference implementation parity testing

When the original app is the behavior reference:

1. Pin the original app version and environment.
2. Define identical preconditions and synthetic test data.
3. Run the same scenario against both systems.
4. Capture API response, state changes, persisted data, side effects and visible result.
5. Normalize only irrelevant differences (generated IDs, timestamps, nondeterministic ordering) and document normalization.
6. Compare field semantics, permission decisions, status transitions and errors.
7. Investigate mismatches; do not hide meaningful differences with broad normalization.
8. Maintain a parity matrix with `Not investigated`, `Verified match`, `Known difference`, `Blocked` or `Not applicable`.

Screenshots can help compare presentation but do not prove backend or security parity.

## 8. Prioritization and coverage

Prioritize tests using impact × likelihood × exposure, with explicit escalation for security, data loss, financial, safety or tenant-isolation consequences. Do not optimize for line coverage alone. Use coverage as a diagnostic signal alongside risk-based scenario coverage and mutation/negative testing where practical.

## 9. Exit criteria

A test stage exits when the defined suite has run, failures are triaged, blockers are resolved or accepted by an authorized owner, skipped tests are explained, and evidence is retained in the build/CI system or project report.
