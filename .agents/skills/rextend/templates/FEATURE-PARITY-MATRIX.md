# Feature and Behavior Parity Matrix

**Reference version:** `<original version/commit>`  
**Reimplementation version:** `<new version/commit>`  
**Last verified:** `<YYYY-MM-DD>`

Allowed statuses: `Not investigated`, `In analysis`, `Implemented`, `Verified match`, `Known difference`, `Blocked`, `Not applicable`.

| ID | Module | Feature / scenario | Original evidence | Required behavior | New implementation evidence | Test IDs | Status | Gap / notes |
|---|---|---|---|---|---|---|---|---|
| PAR-001 | | | | | | | Not investigated | |

## Parity verification rules

- Pin both system versions and comparable environments.
- Use equivalent synthetic test data and preconditions.
- Compare user-visible results, API contracts, persisted state, authorization outcomes and side effects.
- Normalize generated IDs or timestamps only when they are semantically irrelevant; document normalization.
- Record intentional differences and obtain product approval where needed.
- A screenshot or a matching status code alone does not prove parity.
