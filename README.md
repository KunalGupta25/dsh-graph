# DSH Workflow Studio

An n8n-style graph editor for your DeepSeek Harness. Open **Workflow Studio** in the sidebar.

## What it does
- **Graph of your real harness**: core services, plugin rows, bundles, MCP connections (with the tools they expose), agent presets (with their child plugins) and skills, read live from the Host.
- **Editable / read-only nodes**: infrastructure plugins and bundled items show a lock and cannot be changed or removed. Everything else is editable.
- **Inspector**: click a node for what it is, its description, package, origin, tools, and a **Settings** tab to edit config fields, add new fields (for example an API key) and enable, disable or remove it. Secret-looking values are masked and never sent to the browser.
- **Marketplace**: searches the official `@deepseek-ai/dsh-*` packages, the configured plugin market, npm (`dsh-plugin`, `dsh-skill` keywords), GitHub topics and the MCP registry. Add an item to the harness, or compare several.
- **AI panel** (collapsible, right): provider/model selector, compare marketplace items, design a plugin / MCP connection / skill. The AI only proposes changes; they appear in **Changes** and nothing happens until you press **Apply**.
- **Changes**: every edit is staged first. Applying calls the plugin manager and config editor; each step reports success or the exact error.

## Keeping the graph readable
A real harness has hundreds of nodes, so the canvas is decluttered by default:
- **Built-in plugins are hidden.** Shipped and read-only plugins are left out; use the **Built-in** toolbar button to show them. Core services, presets, MCP connections, skills, bundles and your own plugins always stay visible.
- **Group nodes.** Large families collapse into one stacked card: Client UI, Built-in plugins, MCP connections, Skills, tools by purpose (File & workspace, Shell, Web, Office, Agent & task, Other) and one **<Preset>’s Tools** group per preset. Click a card to expand or collapse it; **Expand groups / Collapse groups** handles all of them. Opening a group puts its members in a column to the right of it, lined up with the group, and the group keeps its own links.
- **Tool registry cluster.** Shipped tool packages hang off the Tool registry node behind a **▸ N tool packages** chip and open next to it. Registry-to-tool links are drawn only when you hover or select the registry or a tool.
- **Edge modes.** The **Edges** button cycles *faint* (default), *all* and *selected only*. Hovering or selecting a node always highlights its own links, and selecting a node fades unrelated nodes.
- **Filter box.** Shows only matching nodes (built-ins included) and re-packs the layout.
- **Stays put.** Expanding or collapsing never refits the canvas: the node you clicked stays where it is on screen. Nodes slide, fade in and fly back into their group smoothly (disabled when your system asks for reduced motion). **Auto Layout** resets dragged positions; **Fit** frames everything.
- Your choices (built-in toggle, open groups, edge mode, dragged positions) are remembered in the browser.

## AI setup
The assistant has no key or endpoint of its own. It sends every request through the harness model service, so it uses exactly the providers and credentials already configured on the dsh **Models** settings page. Pick a provider and model in the panel header (the ↻ button reloads the list). If the list is empty, add a provider in dsh settings first. Only your last provider/model choice is stored, in `$DSH_HOME/studio/ai.json`; no credential is ever stored or sent to the browser. A provider without a working credential reports an error that points you to the Models settings page.

## Notes
- Scaffolded bundles are written to `$DSH_HOME/studio/drafts/<id>` and only installed when you apply an install step.
- Installing a bundle runs its code in the Host. Review before applying.
- Package replacement may need a restart.

## Status
Verified and tested against DeepSeek Harness runtime:
- Slot names `sidebar.panellist` and `main` verified against official client packages.
- Theme tokens mapped to official `--dsw-alias-*` tokens from `@deepseek-ai/dsh-client-ui-theme`.
- `PluginManager` (`setBundleEnabled`, `removeBundle`, `installBundle`) and `ConfigEditor` (`edit`, `entries`, `configuration`) service signatures verified and implemented.
- `webServer.register` prefix and exact handler signatures verified against `@deepseek-ai/dsh-host-webserver`.
- All host modules exercised and verified with end-to-end test suite (`node --check` clean).
