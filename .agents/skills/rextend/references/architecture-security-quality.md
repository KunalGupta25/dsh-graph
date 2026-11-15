# Architecture, Security and Enterprise Quality Reference

Use this reference for architecture reconstruction, design reviews, security reviews, and production-readiness assessments.

## 1. Architecture map

Identify actual components and boundaries rather than assigning fashionable labels.

### Context and deployment

- External actors, systems and trust boundaries.
- User-facing apps, APIs, workers, schedulers, command-line tools and admin interfaces.
- Runtime processes, containers, hosts, regions and network zones.
- Shared infrastructure: database, cache, broker, object store, search, identity provider.
- Synchronous and asynchronous communication paths.

### Design and code structure

- Layered / hexagonal / clean architecture, if used.
- Modular monolith, service-oriented or microservice boundaries, if applicable.
- Domain contexts, ownership and dependency direction.
- Framework-specific conventions and generated-code boundaries.
- Shared libraries and cross-cutting services.
- Plugin, extension and customization boundaries.

### Runtime lifecycle

- Startup, configuration resolution and dependency initialization.
- Request/job/event lifecycle.
- Transaction and consistency boundaries.
- Graceful shutdown and in-flight work handling.
- Health, readiness and liveness behavior.

## 2. Data architecture review

- Authoritative source for each important entity.
- Identity, ownership and tenant key strategy.
- Relationships, constraints and invariants.
- Transaction boundaries and isolation assumptions.
- Concurrency controls and race-condition exposure.
- Index strategy and high-cost queries.
- Cache ownership, invalidation and staleness guarantees.
- Search/reporting denormalization and rebuild procedures.
- Data retention, deletion, archival and export.
- Encryption, data classification and access logging.
- Migration, backfill, downgrade and restore strategies.

## 3. API and integration review

- API inventory, schema source and version strategy.
- Authentication and authorization at each endpoint.
- Input limits, validation and output serialization.
- Standard success/error contracts.
- Pagination, filtering, sorting and bulk-operation semantics.
- Rate limiting, timeouts and request size limits.
- Idempotency and retry behavior.
- Webhook signature validation and replay protection.
- Compatibility of SDKs, plugins and third-party consumers.

## 4. Security review checklist

Use a threat-model mindset. Identify assets, actors, attack surfaces, trust boundaries, abuse cases, mitigations and residual risks.

### Identity and access

- Authentication mechanism and session/token lifecycle.
- MFA/SSO/federation support where required.
- Role/attribute/policy model and default-deny behavior.
- Object-level authorization and permission inheritance.
- Tenant isolation across API, search, exports, caches, events and workers.
- Privileged account separation and administrative audit.

### Input and execution

- Validation at every untrusted boundary.
- Parameterized database access.
- Output encoding and safe templating.
- File upload/download validation and storage isolation.
- SSRF, path traversal, command injection and deserialization risks where applicable.
- Safe sandboxing for user-supplied code or plugins.

### Data and secrets

- Data classification and minimization.
- TLS and appropriate encryption at rest.
- Secret storage, rotation and least privilege.
- Key management and cryptographic library use.
- Redaction of sensitive values in logs, error messages, traces and telemetry.
- Retention, deletion, export and access audit.

### Supply chain and delivery

- Dependency pinning and vulnerability monitoring.
- Reproducible builds and artifact provenance.
- SBOM and signing where appropriate.
- CI credential scope and protected release process.
- Container/image and infrastructure hardening.

## 5. Reliability and distributed behavior

Review only the patterns relevant to actual architecture:

- Explicit timeout budgets.
- Bounded retries with exponential backoff and jitter.
- Idempotent operations and deduplication.
- Circuit breakers or bulkheads where they provide value.
- Queue visibility, retry count and dead-letter handling.
- Transactional outbox/inbox where cross-system consistency requires it.
- Ordering guarantees and event schema evolution.
- Graceful degradation for optional dependencies.
- Backpressure, quotas and resource limits.
- Graceful shutdown and worker draining.
- Recovery objectives, backup testing and failover.

Do not state that the system is highly available merely because it has multiple containers. Verify failure domains and recovery behavior.

## 6. Observability and operations

- Structured logs with correlation/request/tenant identifiers that do not reveal secrets.
- Metrics for traffic, errors, latency and saturation.
- Distributed traces across service and queue boundaries.
- Business metrics for important workflows.
- Health/readiness checks that reflect actual dependency needs.
- Alert thresholds, ownership, escalation and runbooks.
- Deployment/version markers and feature-flag visibility.
- SLOs and error budgets where appropriate.
- Incident and postmortem process.

## 7. Performance and capacity

Record measurable assumptions:

- Expected users, requests/second, concurrency and burst patterns.
- Data volume, growth, retention and tenant distribution.
- Latency targets by critical workflow.
- Database connection and query budgets.
- Queue throughput and acceptable lag.
- File sizes, upload/download throughput and object storage costs.
- Cache hit assumptions and invalidation behavior.
- CPU, memory and network limits.

Profile before optimizing. Use query plans, traces and representative workloads. Do not invent capacity numbers; identify who supplied each target.

## 8. Quality finding format

| Field | Required content |
|---|---|
| ID | Stable identifier such as `SEC-004` or `REL-002` |
| Title | Specific finding |
| Severity | Critical / High / Medium / Low / Informational, with project scale defined |
| Evidence | File/symbol, test, runtime observation or configuration |
| Impact | What could happen and to whom |
| Likelihood | Evidence-based likelihood or exploitability |
| Recommendation | Actionable mitigation |
| Verification | Test, scan, review or runtime evidence that closes it |
| Status | Open / Accepted / Mitigated / Verified / False positive |

## 9. Readiness decision

Do not reduce enterprise readiness to one score. Report by dimension:

- Functional completeness.
- Security posture.
- Data integrity and isolation.
- Reliability and recoverability.
- Performance and capacity evidence.
- Observability and operational ownership.
- Upgradeability and maintainability.
- Accessibility and compatibility.
- Documentation and support readiness.

A readiness statement must include scope, environment, version/commit, evidence, unresolved risks and explicit exclusions. Code inspection alone cannot certify regulatory compliance or production safety.
