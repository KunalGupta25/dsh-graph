# Knowledge Base and Documentation Governance

The project knowledge base is the durable memory that lets a new agent or developer understand the codebase without relying on old conversations. It should be accurate, navigable, concise at the top level, and detailed only where needed.

## 1. Discover before creating

1. Search for existing documentation in the project directory, its workspace, and relevant linked projects. The source may be a non-Git local folder.
2. Identify the current convention (`docs/`, `documentation/`, ADR folder, wiki, generated API docs, etc.).
3. Reuse and improve existing documents instead of creating competing copies.
4. Identify docs that are generated and update their source definitions rather than editing generated output.
5. Keep project-specific instructions in the appropriate project-level agent instruction file if the environment supports one; keep reusable methodology in this skill.

## 2. Suggested knowledge-base layout

Adapt to project size. A compact project can combine related files; a large product may split them by bounded context.

```text
docs/
├── index.md                         # Entry point and navigation
├── project/
│   ├── charter.md
│   ├── product-overview.md
│   ├── scope-and-glossary.md
│   └── assumptions-and-open-questions.md
├── reverse-engineering/
│   ├── project-map.md
│   ├── runtime-and-deployment-map.md
│   ├── architecture-observed.md
│   ├── feature-inventory.md
│   ├── workflow-catalog.md
│   ├── integration-catalog.md
│   └── evidence-ledger.md
├── architecture/
│   ├── system-architecture.md
│   ├── module-catalog.md
│   ├── database-design.md
│   ├── api-catalog.md
│   ├── security-model.md
│   ├── events-and-jobs.md
│   └── decisions/
├── requirements/
│   ├── functional-requirements.md
│   ├── non-functional-requirements.md
│   ├── roles-and-permissions.md
│   └── feature-parity-matrix.md
├── quality/
│   ├── test-strategy.md
│   ├── test-catalog.md
│   ├── performance-and-reliability.md
│   └── known-gaps.md
└── operations/
    ├── local-development.md
    ├── deployment.md
    ├── observability.md
    └── backup-and-recovery.md
```

## 3. Recommended entry-point document

`docs/index.md` should answer:

- What is this project?
- What is the current version/commit covered by the docs?
- Where is the system overview?
- Where are module dossiers and user workflows?
- How do I build, run and test it?
- Where are API, database, security and deployment references?
- What is not yet understood?
- When were key documents last verified?

Keep the index short and link to detailed documents.

## 4. Module dossier structure

For each significant module or bounded context, record:

1. Purpose and ownership.
2. Responsibilities and explicit non-responsibilities.
3. Entry points (routes, jobs, events, CLI, plugin hooks).
4. Important source paths and symbols.
5. Dependencies and dependents.
6. Domain entities and invariants.
7. APIs and contracts.
8. Data tables, indexes, migrations and tenant scope.
9. Events, jobs and side effects.
10. Authentication, authorization and audit behavior.
11. Configuration and feature flags.
12. Tests and coverage gaps.
13. Failure modes and operational signals.
14. Known limitations, open questions and evidence.

## 5. Evidence and freshness metadata

At the top of substantial investigation documents, include:

```yaml
status: verified | partial | draft | stale
last_verified: YYYY-MM-DD
source_type: remote-repository | local-git | local-non-git | runtime-only | mixed
source_revision: <commit SHA, release version, snapshot identifier, or unknown>
repository_commit: <optional; omit when Git metadata does not exist>
scope: <module or behavior>
confidence: high | medium | low
```

This metadata is illustrative Markdown/YAML, not a required parser format. Update the commit and date when evidence changes. If only part of a document was verified, state which parts.

For each significant claim, cite project-relative paths and symbols (or stable remote source URLs/revision references when available). Include line numbers where helpful, but also include stable symbols because line numbers drift. Distinguish verified observations from inferences and unresolved questions.

## 6. Keep documents synchronized

Update relevant documents when changes affect:

- Routes, APIs, event schemas or external contracts.
- Domain rules, entities, states or relationships.
- Database schema, migrations, indexes or data retention.
- Permissions, identity, tenant isolation or audit behavior.
- Module boundaries, dependencies or runtime topology.
- Configuration, environment variables, feature flags or defaults.
- Tests, quality gates, supported versions or setup steps.
- Deployment, scaling, monitoring, backups or recovery.

Do not update every file for every code change. Update the canonical document(s) that own the affected facts and add links from adjacent docs if needed.

## 7. Avoid documentation failure modes

- Do not create enormous files containing duplicated facts.
- Do not treat a generated inventory as a complete architecture analysis.
- Do not leave stale screenshots or copied API responses without version context.
- Do not document secret values or production personal data.
- Do not call planned architecture "implemented".
- Do not leave status fields permanently set to "verified" after major releases.
- Do not create diagrams that disagree with current code; include the commit/date and source references.
- Do not use a feature parity checkbox as proof without a test/evidence link.

## 8. Definition of a useful project knowledge base

A new competent agent should be able to use the index to find:

- How the system is structured and starts.
- What the major modules own.
- How a representative end-to-end workflow works.
- Where core data is stored and how it relates.
- What the public/internal contracts are.
- How identity, permissions and tenancy work.
- How async processing and integrations work.
- How to build, test, deploy and observe the project.
- Which areas are understood, uncertain, risky or out of scope.

The knowledge base should enable focused investigations; it cannot replace reading the relevant source code before every risky change. Do not use the absence of Git history as a reason to omit source maps, evidence, or project documentation.
