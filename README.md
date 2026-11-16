# DSH Workflow Studio

An n8n-style graph editor for your DeepSeek Harness. Open **Workflow Studio** in the sidebar.

## What it does
- **Graph of your real harness**: core services, plugin rows, bundles, MCP connections (with the tools they expose), agent presets (with their child plugins) and skills, read live from the running Host.
- **Editable / read-only nodes**: infrastructure plugins and bundled items show a lock and cannot be changed or removed. Everything else is editable.
- **Inspector**: click a node for what it is, its description, package, origin, tools, and a **Settings** tab to edit config fields, add new fields (for example an API key) and enable, disable or remove it. Secret-looking values are masked and never sent to the browser.
- **Marketplace**: searches the official `@deepseek-ai/dsh-*` packages, the configured plugin market, npm (`dsh-plugin`, `dsh-skill` keywords), GitHub topics and the MCP registry. Add an item to the harness, or compare several.
- **AI panel** (collapsible, right): model selector, compare marketplace items, design a plugin / MCP connection / skill. The AI only proposes changes; they appear in **Changes** and nothing happens until you press **Apply**.
- **Changes**: every edit is staged first. Applying calls the plugin manager and config editor; each step reports success or the exact error.

## AI setup
Open the gear in the AI panel and paste an OpenAI-compatible key (DeepSeek by default), or set `DEEPSEEK_API_KEY`. The key is stored in `$DSH_HOME/studio/ai.json` with owner-only permissions.

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
