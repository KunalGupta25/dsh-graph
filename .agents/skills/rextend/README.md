# ReXtend — Project-Aware Software Engineering Skill

**ReXtend = Re-engineer + Extend.**

**Understand deeply. Engineer naturally. Extend confidently.**

ReXtend is a reusable, evidence-driven Agent Skill that helps an AI agent build and maintain a deep understanding of an existing software project, then use that context throughout the engineering lifecycle. It is designed for more than reverse engineering: it supports architecture-aware feature development, customization, debugging, refactoring, test design, quality assurance, and continuous project evolution.

ReXtend works with remote repositories, local Git checkouts, non-Git project folders, running applications, and multi-project workspaces. Git is optional.

## What ReXtend helps an agent do

- **Understand:** Discover product behavior, domain concepts, architecture, modules, dependencies, APIs, data models, integrations, and runtime flows.
- **Remember:** Build and maintain a durable, evidence-backed project knowledge base instead of relying on conversation memory.
- **Design:** Turn requirements into project-fitting technical designs, impact analyses, acceptance criteria, and implementation plans.
- **Extend:** Implement features and customizations that follow existing architecture, conventions, UX patterns, permissions, and data contracts.
- **Improve:** Diagnose defects, refactor safely, identify technical debt, and assess security, performance, and reliability.
- **Test:** Design and execute staged unit, integration, contract, API, UI, E2E, regression, security, performance, and acceptance test suites.
- **Validate:** Compare expected and actual behavior, verify compatibility, and keep documentation aligned with the code.

## Package contents

- `SKILL.md` — main skill instructions and workflow router.
- `references/` — detailed playbooks for discovery, reverse engineering, architecture/security/quality, feature implementation, testing, documentation, project entry modes, and safe tooling.
- `templates/` — reusable Markdown templates for project knowledge, architecture, features, module dossiers, APIs, data dictionaries, parity, testing, and ADRs.
- `scripts/project_inventory.py` — read-only local project inventory helper. Works with or without Git.
- `scripts/repo_inventory.py` — backwards-compatible alias for the earlier helper name.

## Supported project sources

1. Remote Git repository URL or accessible hosted repository.
2. Local Git clone, checkout, or worktree.
3. Existing local project folder without Git or commit history.
4. Existing configured or running application, with source when available.
5. Monorepo, multi-package workspace, or collection of related repositories.

ReXtend does not require Git. During discovery it must preserve existing files and local changes, avoid destructive operations, and never read or disclose secret values.

## Installation

ReXtend follows the portable Agent Skills folder convention. The skill folder must be named **`rextend`** (lowercase), matching the `name` field in `SKILL.md`.

### Quick Install with `npx skills` (Recommended)

Using the official [Agent Skills CLI](https://skills.sh):

```bash
# Install to current project
npx skills add KunalGupta25/ReXtend

# Or install globally across all supported agents
npx skills add KunalGupta25/ReXtend -g
```

---

### Method 1: Global Installation via Git

Clone the repository directly into your AI agent's global skills directory:

#### Antigravity / Gemini CLI

- **macOS / Linux:**
  ```bash
  git clone https://github.com/KunalGupta25/ReXtend.git ~/.gemini/config/skills/rextend
  ```

- **Windows (PowerShell):**
  ```powershell
  git clone https://github.com/KunalGupta25/ReXtend.git "$HOME\.gemini\config\skills\rextend"
  ```

#### Claude Code

- **macOS / Linux:**
  ```bash
  git clone https://github.com/KunalGupta25/ReXtend.git ~/.claude/skills/rextend
  ```

- **Windows (PowerShell):**
  ```powershell
  git clone https://github.com/KunalGupta25/ReXtend.git "$HOME\.claude\skills\rextend"
  ```

---

### Method 2: Project-Local Installation (Available within a specific project)

Install into your target project's root directory under `.agents/skills/rextend` (supported by most portable agent environments):

- **Direct clone:**
  ```bash
  git clone https://github.com/KunalGupta25/ReXtend.git .agents/skills/rextend
  ```

- **Or as a Git Submodule:**
  ```bash
  git submodule add https://github.com/KunalGupta25/ReXtend.git .agents/skills/rextend
  ```

*(If your environment uses `.gemini/skills/` or `.claude/skills/`, clone into that location instead.)*

---

### Method 3: Manual Download (Without Git)

1. Download the repository source as a ZIP:
   - [Download ZIP](https://github.com/KunalGupta25/ReXtend/archive/refs/heads/main.zip)
2. Extract the archive.
3. Rename the extracted folder (e.g. `ReXtend-main`) to **`rextend`**.
4. Move the `rextend` folder into your global or project-local skills directory.

---

### Verification

To verify that the skill is loaded and active, start a turn with your agent and prompt:

> Use the ReXtend skill. Inspect this project and summarize its architecture.

## First-use prompt: understand an existing project

> Use the ReXtend skill. Deeply inspect the project source I have provided, whether it is a remote repository, local Git checkout, ordinary local folder, running application, or multi-project workspace. First establish the project root, source type, scope, and access boundaries. Inspect read-only before making changes. Build an evidence-backed understanding of the product, business domain, architecture, modules, dependencies, data model, APIs, integrations, runtime workflows, security, operations, and existing tests. Distinguish verified facts from inferences, assumptions, unknowns, and contradictions. Create or update a persistent project knowledge base using the existing documentation conventions. Do not implement product changes during initial discovery. Report the understood scope, evidence, gaps, risks, and recommended next steps.

## First-use prompt: build a feature that fits

> Use ReXtend and the existing project knowledge base. Before coding, inspect the relevant module and trace the requested behavior through UI, API, domain logic, persistence, permissions, events/jobs, integrations, and tests. Identify existing conventions and dependencies. Produce a concise impact analysis, acceptance criteria, implementation plan, and staged test plan. Implement the smallest complete vertical slice that fits the existing product and architecture. Run relevant tests, add regression coverage, update affected documentation and the feature parity matrix, and report changed files, verification evidence, and remaining risks.

## Safety and engineering principles

- Evidence before conclusions; record provenance and confidence.
- Understand affected behavior before changing it.
- Respect the existing architecture and UX conventions; do not impose unnecessary technologies or patterns.
- Start read-only and preserve user changes.
- Do not expose secrets or sensitive project data.
- Use small, reviewable, testable vertical slices.
- Design tests from requirements, architecture, risks, and observed behavior—not only from implementation details.
- Keep project knowledge synchronized with code and verified runtime behavior.

## Version

`1.2.0`
