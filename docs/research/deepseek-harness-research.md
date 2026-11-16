# DeepSeek Harness (`deepseek-ai/deepseek-harness`) Architecture & Plugin Research

**Document Status:** Verified against upstream repository (`deepseek-ai/deepseek-harness@master`)  
**Target Project:** `n8n like plugin for dsh`  
**Date:** November 2026  
**License of Target:** MIT  

---

## 1. Executive Summary

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) is DeepSeek AI's official open-source agent harness and runtime environment. It is engineered from first principles around an **"Everything-is-a-Plugin"** microkernel paradigm powered by **Cordis** (an inversion-of-control / spatiotemporal composability framework).

Unlike monolithic AI agent frameworks that hardcode execution loops, prompt strategies, model adapters, and UI components into a rigid core, DSH decomposes every single capability—including model adapters, filesystem access, session persistence, tool registration, subagent orchestration, the agent execution loop, and the React Web UI—into modular, hot-reloadable Cordis plugins.

### Upstream Repository Metadata
* **Repository:** `deepseek-ai/deepseek-harness`
* **Release Channel:** Developer Preview (iterating rapidly)
* **Core Runtime:** Node.js (with Electron for Desktop and headless/CLI runners)
* **Package Manager:** `pnpm` monorepo (`packages/*/*`, `apps/*`)
* **Primary Language:** TypeScript (NodeNext / ESM, target ES2022)

### Verified 2026-11-16 Findings

#### DeepSeek API (Live Model IDs)
* **`deepseek-flash`** (V4.1-Flash-1017) — 1M context, 384K max output, JSON output, tool calls, vision supported
* **`deepseek-v4-pro`** (V4-Pro-0813) — 1M context, 384K max output, JSON output, tool calls
* **Retired (2026-07-24):** `deepseek-chat` / `deepseek-reasoner` — **do not use**
* **V3.2-Speciale:** Temporary endpoint expired 2025-12-15

#### API Details (Verified 2026-11-16)
* **Base:** `https://api.deepseek.com` (OpenAI format) or `/anthropic`; beta `https://api.deepseek.com/beta`
* **Auth:** `Authorization: Bearer <key>`
* **Thinking:** **ON by default**; `thinking: { type: 'enabled' | 'disabled' }`; `reasoning_effort: none|low|high|max` (default high)
* **Max tokens:** 1–384K (8K non-thinking, 64K thinking, 128K at max); temperature ignored in thinking mode
* **Response:** `message.content` AND `message.reasoning_content` (same level); `message.tool_calls`
* **When `tools` present:** `reasoning_content` MUST be echoed back on every subsequent turn — omitting it returns HTTP 400
* **Errors:** `{"error":{message,type,param,code}}`; HTTP 400/401/402/408/413/422/429/500/503/504
* **Concurrency:** 2500 (flash) / 500 (pro); 429 on excess; `user_id` gives KV-cache/scheduling isolation
* **Keep-alive:** Empty lines (non-stream) or `: keep-alive` SSE comments

#### Self-Hosting / "Build" Options
* **Open weights MIT:** V4-Pro (1.6T/49B), V4-Flash (284B/13B), V4.1-Flash-1017
* **vLLM & SGLang** support DeepSeek-V4/V4.1
* **Ollama:** V4-Pro/V4-Flash mods available
* **GGUF quants:** unsloth/DeepSeek-V4.1-Flash-1017-GGUF → llama.cpp-family support plausible
* All expose OpenAI-compatible `/v1/chat/completions`; auth optional locally

#### dsh-market v1 Update API (Beta — Discover via Capabilities)
* **Envelope:** `dsh-market/update-api/v1`
* **Capabilities:** `GET /dsh-market/api/v1/capabilities` → `{ version: 1, updateApi: true }`
* **Routes:** `GET /updates/summary`, `GET|POST /updates`, `GET /operations`, `POST /rollback`, `POST /restart`
* **Limit:** `MAX_UPDATE_OPERATIONS_V1 = 50`
* **Exports:** `UPDATE_API_V1_SCHEMA`, `UpdateOperationStoreV1`
* **Integration:** Discover via capabilities, never hardcode; keep public-index fallbacks; optional GitHub token

#### Cordis Plugin Framework Constraints (DSH)
* **Manifest:** `cordis.patch.yml` with `insert: [{ id, name, config }]`
* **Host entry:** `export const inject = { required: [...], optional: [...] }; export const Config = {...}; export function apply(ctx, config) {...}`
* **Client entry:** `export const inject = ['slots', 'locale', 'theme']; export function apply(ctx) { ctx.slots.inject(...) }`
* **Client packaging:** `dsh.client.inject: ["@deepseek-ai/dsh-client-locale","@deepseek-ai/dsh-client-ui-settings","@deepseek-ai/dsh-client-ui-theme"]`
* **Preflight:** `preflight.mjs` enforces patch inserts package name, client.js loader-id prefix, top-level icon path/type/≤256KB/packaged, lockfile resolves only registry.npmjs.org

#### dsh-market AGENTS.md = Hard Constraint (Chinese)
* 自然 / 好理解 / 面向普通用户
* Errors: what happened + why + what to do now
* Say 不知道 rather than plausible filler
* Defaults are the product
* Progressive disclosure
* Reversible actions need no confirmation
* Every action needs immediate reaction + landing point
* zh/en copy parity
* Never expose internals (`bundle`, `profile`, `disable-carrier`, `ctx.${key}`, `rowId`)
* No steps for impossible errors

---

## 2. Core Architectural Pillars

```
+-----------------------------------------------------------------------------------+
|                                 Applications                                      |
|      CLI (`dsh`)   |   Web UI (`dsh web`)   |   Desktop (Electron)  |  ACP / SDK  |
+-----------------------------------------------------------------------------------+
|                                Profile Bundles                                    |
|   `dsh-base`  -->  `dsh-web-app` / `dsh-headless` / `dsh-sdk-app` / `dsh-acp-app`    |
|   (composed via `cordis.patch.yml` layer overlays and dynamic entry trees)        |
+-----------------------------------------------------------------------------------+
|                               Capability Seams                                    |
|   `ctx.llm`             | LLM Adapter seam (DeepSeek, OpenAI, Pi-AI, etc.)       |
|   `ctx.tools`           | Scoped Tool Registry & Multi-stage Execution Pipeline   |
|   `ctx.sessions`        | Append-only durable event log (JSONL v0/v1)             |
|   `ctx.agents`          | Live Agent Registry & Turn/Step Lifecycle               |
|   `ctx.workflowEngine`  | Scripted multi-agent fan-out & DAG orchestration        |
|   `ctx.ptcRuntime`      | Programmatic Tool Calling (TypeScript/Node runner)      |
|   `ctx.slots`           | Declarative Web UI extension slots & component factories|
+-----------------------------------------------------------------------------------+
|                          Cordis Meta-Framework Kernel                             |
|   Context (`ctx`), Service DI (`inject`), Typed Events, Reversible Effects (HMR)  |
+-----------------------------------------------------------------------------------+
```

### 2.1 The Cordis Framework Microkernel
At the bedrock of DSH is **Cordis**:
* **Context (`ctx`)**: Every plugin receives a `Context` instance representing its execution fiber.
* **Service Dependency Injection (`inject`)**: Plugins declare dependencies by name (e.g., `export const inject = ['tools', 'agents', 'sessions']`). Cordis suspends plugin activation until all required services are registered and active.
* **Reversible Effects (`ctx.effect()`)**: Any registration (event listener, tool, service, route, slot) is tracked as a fiber effect. When a plugin is unloaded or reloaded via HMR, all its registrations automatically unwind without leaking state or requiring manual teardown.
* **Event Dispatch Modes**: Cordis provides typed events supporting multiple execution semantics:
  * `emit`: Broadcast to all listeners.
  * `waterfall`: Sequential transformation pipeline where each listener calls `next()`.
  * `serial`: Sequential execution without transformation.
  * `parallel`: Concurrently awaited listeners.
  * `bail`: Halts at the first non-undefined return value.

### 2.2 Profiles and Bundles
A running DSH instance is constructed from ordered layer compositions:
* **Profile**: A named launch configuration (`web`, `headless`, `sdk`, `sdk-minimal`, `acp`, `desktop`).
* **Bundle**: A distribution package containing a `cordis.patch.yml` configuration and plugin tree.
* **`dsh-base`**: The foundational bundle providing logging, session store, tool registry, model adapters, and approval policies.

### 2.3 Durable Session Log ("Model-Visible Means Logged")
DSH enforces a strict consistency invariant:
* Context passed to any LLM must be 100% reconstructable from the append-only session event log (`session.vN.jsonl`).
* `deriveMessages()` computes model conversation history directly from durable session events (`turn/start`, `step/start`, `user/message`, `assistant/message`, `tool/call`, `tool/result`, `turn/end`).
* Transient streaming tokens travel across live process events (`agent/assistant-stream`), while final settled content is committed to durable storage.

---

## 3. Key Subsystems & Extension Seams

### 3.1 Tool Subsystem (`core/tools` -> `ctx.tools`)
* **Registration**: First-party tools use `defineTool()` with typed arguments and JSON Schema validation. Third-party or MCP tools register via `ctx.tools.register()`.
* **Execution Pipeline**:
  ```
  tool call
     ↓
  tools/pre-execute (waterfall: allow, deny, or ask confirmation)
     ↓
  tools/execute     (wraps execution lifetime: timeout, retry, metrics)
     ↓
  tools/post-execute (waterfall: result transformation / augmentation)
     ↓
  tools/result      (observe-only final outcome event)
  ```
* **Turn Termination**: A tool can invoke `ToolExecution.concludeTurn()` to signal the agent loop to end the current turn immediately upon step completion.

### 3.2 Workflow Subsystem (`packages/workflow` -> `ctx.workflowEngine`)
* **Purpose**: Orchestrates multi-agent fan-out where an agent or user executes scripts that coordinate subagents.
* **Execution Engine**: Runs via `dsh-workflow-ptc` inside a sandboxed Programmatic Tool Calling (PTC) Node process.
* **Script Primitives**: Inside workflow scripts, execution code can invoke `agent()`, `parallel()`, `pipeline()`, `phase()`, and `log()`.
* **Workflow Events**: `workflow/start`, `workflow/phase`, `workflow/agent-start`, `workflow/agent-end`, `workflow/log`, `workflow/end`.
* **UI Representation**: `dsh-client-ui-workflow-run` renders workflow runs directly into the conversation stream as structured nodes.

### 3.3 Web Client Stack & UI Extension System (`packages/client/*`)
* **Host vs Client Boundary**:
  * Host: Node.js service managing server RPC, session files, process execution, and network.
  * Client: Browser bundle (`lib/client.js`) loaded by Vite / dynamic plugin loader.
* **UI Slots (`ctx.slots`)**:
  * Hierarchical UI injection without hardcoded component imports: `ctx.slots.register({ name, children, store, inject }, Component)`.
  * Dynamic cross-package injection: `ctx.slots.inject('parent.slot', () => ctx.slots.register(...))`.
* **Conversation Chat Nodes**:
  * Plugins can render custom rich interactive cards in the chat timeline by registering a `ConversationNodeDefinition` and a keyed `conversation.chat.node` renderer.
* **Strict Client Discipline**:
  * Components receive data exclusively via five derived props: `PropsRuntime`, `PropsRenderSlots`, `PropsRenderFactories`, `PropsStore`, and the `inject` face.
  * Components never touch `ctx` or React Context directly.
  * Strict design tokens (`--dsw-*`), CSS Modules, zero inline color literals, and comprehensive i18n (`locale/*.json`).

---

## 4. Blueprint: Building an "n8n-like" Workflow Plugin for DSH

An **"n8n-like plugin for DSH"** translates visual, node-based workflow automation (DAG-based dataflow, triggers, branching, AI agent steps, tool executions, and integrations) into the native DSH plugin architecture.

### 4.1 Structural Architecture of the Plugin

```
packages/dsh-plugin-flow/ (or n8n-like plugin)
├── package.json               # Declares Cordis plugin, exports Host and ./client
├── tsconfig.json
├── src/
│   ├── index.ts               # Host-side entry: registers ctx.flowEngine, tools, webhooks
│   ├── engine/                # DAG execution engine (topological sort, data passing, runners)
│   │   ├── graph-runner.ts    # Node traversal, state propagation, cancellation
│   │   ├── node-registry.ts   # Node types catalog (trigger, action, agent, tool, condition)
│   │   └── nodes/             # Built-in node implementations
│   ├── storage/               # Workflow definition & run persistence
│   └── client/                # Client-side Web UI entry
│       ├── index.ts           # Client apply(): registers slots, views, conversation nodes
│       ├── canvas/            # Visual workflow canvas (nodes, edges, drag-and-drop)
│       ├── inspector/         # Node property inspector & parameter configuration
│       ├── chat-node/         # Interactive Conversation Node showing workflow progress in chat
│       └── store/             # Workflow editor state store (createSnapshotStore)
├── locale/
│   ├── en.json                # English strings & metadata
│   └── zh.json                # Chinese translations
└── README.md
```

### 4.2 Integration Seams Matrix

| Feature | DSH Integration Mechanism | Role in n8n-like Plugin |
|---|---|---|
| **Visual Workflow Canvas** | `ctx.slots.register()` / `ctx.slots.inject()` | Injects a dedicated "Workflows" tab / panel into the DSH Web UI shell. |
| **Node Execution Engine** | Custom Cordis Service `ctx.flowEngine` | Executes DAG nodes sequentially or concurrently, managing payload pipelines. |
| **Invoking DSH Tools in Nodes** | `ctx.tools.execute()` | Any installed DSH tool (filesystem, bash, web search, MCP) can be a drag-and-drop node. |
| **AI Agent Nodes** | `ctx.agents.create()` & `agent.followup()` | Nodes that delegate subtasks to autonomous AI agents with specialized system prompts. |
| **Webhook Triggers** | `ctx.webhookRuntime` or HTTP routes | Listens for inbound webhooks (e.g. GitHub events, Stripe, Slack) to trigger workflows. |
| **Scheduled Triggers (Cron)** | `ctx.schedule` | Triggers recurring workflows on timer/cron intervals. |
| **Chat Timeline Cards** | `ConversationNodeDefinition` (`conversation.chat.node`) | When an agent triggers a workflow, an interactive progress/result card appears in the chat stream. |
| **Agent-Facing Tool** | `ctx.tools.register()` (`run_workflow`, `list_workflows`) | Allows conversational agents to discover, trigger, or compose workflows autonomously. |

---

## 5. Implementation Roadmap for the Project

1. **Phase 1: Project Scaffold & Cordis Host Service**
   - Initialize workspace package structure conforming to DSH package constraints.
   - Implement `FlowEngine` service and register it on `ctx.flowEngine`.
   - Implement JSON schema for workflow definitions (Nodes, Edges, Parameters, Execution State).

2. **Phase 2: Execution Engine & Node Library**
   - Implement DAG execution runner supporting async step execution, branching (`If/Else`, `Switch`), and loops.
   - Create built-in node adapters:
     - *Trigger Nodes*: Manual, Webhook, Schedule, Chat Event.
     - *Action Nodes*: DSH Tool invocation (`ctx.tools`), Subagent execution (`ctx.agents`), HTTP Request, JavaScript/TypeScript code.
     - *Logic Nodes*: Filter, Transform, Branch, Merge.

3. **Phase 3: Web Client Canvas (DSH Slots Integration)**
   - Create client entrypoint (`./client`).
   - Register workflow view slot into DSH Web UI layout.
   - Implement node-graph editor using modern interactive canvas components matching DSH `--dsw-*` tokens and dark/light themes.

4. **Phase 4: Agent & Chat Integration**
   - Register conversational tools (`trigger_flow`, `inspect_flow`) on `ctx.tools`.
   - Register custom `ConversationNodeDefinition` for rich chat card visualization of workflow progress.
