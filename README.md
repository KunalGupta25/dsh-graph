# DSH Workflow Studio (`dsh-graph`)
### Visual Cordis Workflow & Marketplace Studio for DeepSeek Harness

**DSH Workflow Studio** transforms DeepSeek Harness into a visual, node-based composable workflow environment (analogous to **n8n** or **ComfyUI**). It allows developers and users to inspect runtime Cordis plugins as nodes, wire skills and MCP servers as sub-nodes, browse community marketplaces, and interactively scaffold new plugins using an in-built AI Copilot in Creator Mode.

---

## Key Features

1. **Live Cordis Graph Visualization**:
   - Inspect all active DeepSeek Harness plugins, core services, host plugins, client UI widgets, and agent compositions as an interactive DAG.
   - Smooth canvas navigation: pan, zoom, port snapping, and curved spline connections.
2. **Core vs. User Mutability Guard**:
   - Clear visual differentiation between **Core / System Plugins** (read-only, shipped with runtime) and **User / Workspace Bundles** (editable, patchable).
3. **Skills & MCP Servers as Sub-Nodes**:
   - Model skills (`.agents/skills/*`) and Model Context Protocol servers (`@deepseek-ai/dsh-mcp-client`) are rendered as docked sub-nodes and tool ports attached to agent presets.
4. **Pre-Existing DSH Plugin Market Integration**:
   - Natively connects to `@deepseek-ai/dsh-plugin-market` and `@deepseek-ai/dsh-client-ui-plugin-market` Discover indexes, as well as community hubs (`dshmarket.com`, `dsh-plugin.org`) and MCP registries.
5. **Interactive AI Copilot & In-Built Creator Mode Side Panel**:
   - **AI Chat Tab**: Ask questions about active plugins, compare tools, get recommendations, and highlight/focus nodes on the canvas.
   - **In-Built Creator Tab**: Uses the official `dsh-doc` / `cordis-plugin-development` rules to generate complete plugin bundles (`package.json`, `cordis.patch.yml`, `index.js`, `locale/`, `icon.svg`) on demand, immediately rendering them as editable draft nodes on the canvas.
   - **Marketplace Explorer Tab**: Browse, search, filter, and 1-click stage community plugins, MCP servers, and skills.
6. **Safe Staging & Patch Diff Reviewer**:
   - Visual edits are kept in an in-memory staging state.
   - Generates unified diffs against `cordis.patch.yml`.
   - 1-click commit & hot-reload via DSH `plugin_manager`.

---

## Project Structure

```
.
├── package.json               # Manifest declaring host and client exports & DSH metadata
├── cordis.patch.yml           # Host bundle patch mounting the plugin
├── index.js                   # Host plugin entry point (Cordis service, RPC endpoints & tools)
├── client.js                  # Client UI plugin (Canvas view, SVG/React nodes, tabs, Copilot)
├── icon.svg                   # Vector icon following DSH artwork guidelines (36x36)
├── docs/
│   ├── DETAIL.md              # Plugin Manager detail document (English)
│   ├── DETAIL.zh.md           # Plugin Manager detail document (Chinese)
│   └── preview.svg            # Detail feature graphic (640x300)
├── locale/
│   ├── en.json                # English localized metadata & titles
│   └── zh.json                # Chinese localized metadata & titles
└── src/
    └── host/
        ├── scanner.js         # Cordis runtime introspection (registry & rows)
        ├── patcher.js         # cordis.patch.yml generation & diff computation
        ├── market-bridge.js   # Catalog aggregator for DSH market, MCP & skills
        └── creator-engine.js  # In-built Creator Mode bundle scaffolder
```

---

## Installation in DeepSeek Harness

### Method 1: Via DeepSeek Harness UI
1. Open DeepSeek Harness Web or Desktop.
2. Navigate to **Plugins** &rarr; **Add plugin** &rarr; **Install local directory**.
3. Select this repository folder: `c:\Projects\n8n like plugin for dsh` (or your clone path).
4. DeepSeek Harness will install the bundle and mount the **Workflow Studio** launcher button into the composer dock.

### Method 2: Via Agent Creator Mode / `plugin_manager`
If interacting via a DeepSeek Harness agent session:
```json
{
  "tool": "plugin_manager",
  "action": "install_bundle",
  "target": "c:\\Projects\\n8n like plugin for dsh"
}
```

---

## Development & Testing

- **Verify Manifest and Resources**:
  Ensure all files in `files` array exist and are readable:
  ```bash
  node -e "console.log(JSON.parse(fs.readFileSync('package.json')).files)"
  ```
- **Inspect Graph Tools**:
  When active, host tools are registered under:
  - `dsh_workflow_studio_graph`
  - `dsh_workflow_studio_market`
  - `dsh_workflow_studio_scaffold`

---

## License
MIT
