import { CordisGraphScanner } from './src/host/scanner.js';
import { CordisPatcher } from './src/host/patcher.js';
import { MarketplaceBridge } from './src/host/market-bridge.js';
import { CreatorEngine } from './src/host/creator-engine.js';
import { AiBackend } from './src/host/ai.js';
import { HarnessOps } from './src/host/ops.js';
import { createRouter, registerRoutes } from './src/host/routes.js';
import z from '@deepseek-ai/schemastery';

// Cordis 4: every entry of `inject` is REQUIRED, and there is no "optional" form. An object such as
// `{ required: [...], optional: [...] }` is read as services literally named "required" / "optional", so the
// plugin would wait for them forever. List only what this plugin cannot start without:
//   - `tools`        the agent tools below.
// Everything else is optional and handled without blocking activation:
//   - `webServer`    routes are registered inside ctx.inject(['webServer'], ...) in apply().
//   - `pluginManager`, `pluginMarket`, `configEditor`, `loader`, `credentials`, `llm`, ...
//                    read lazily with ctx.get(name) at call time (undefined when this profile lacks them).
export const inject = ['tools'];

export const Config = z.object({
  enabled: z.boolean().loose(),
  ai: z.object({
    provider: z.string().loose(),
    model: z.string().loose(),
  }).loose(),
  skillRoots: z.array(z.string()).loose(),
  marketIndexes: z.array(z.string()).loose(),
}).loose();

function toolDefinitions(studio) {
  return [
    {
      name: 'dsh_workflow_studio_graph',
      description: 'Lists plugins, MCP connections, skills, presets and core services of this harness as graph nodes.',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'object', properties: { nodesCount: { type: 'number' }, edgesCount: { type: 'number' }, nodes: { type: 'array' }, edges: { type: 'array' } } },
        render: (_a, v) => [{ type: 'text', text: `Harness graph: ${v?.nodesCount || 0} nodes, ${v?.edgesCount || 0} edges.` }],
      },
      async execute() {
        const g = await studio.getGraph();
        return { nodesCount: g.nodes.length, edgesCount: g.edges.length, nodes: g.nodes, edges: g.edges };
      },
    },
    {
      name: 'dsh_workflow_studio_market',
      description: 'Searches community sources (npm, GitHub topics, MCP registry, plugin market) for DSH plugins, MCP servers and skills.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          kind: { type: 'string', enum: ['all', 'plugin', 'mcp', 'skill'] },
        },
      },
      output: {
        schema: { type: 'object', properties: { items: { type: 'array' }, status: { type: 'object' } } },
        render: (_a, v) => [{
          type: 'text',
          text: v?.items?.length ? `Found ${v.items.length} item(s):\n${v.items.slice(0, 20).map((i) => `- ${i.title || i.name} [${i.kind}] ${i.source}`).join('\n')}` : 'No matching items.',
        }],
      },
      async execute(args) {
        return studio.searchMarketplace(args.query || '', args.kind || 'all');
      },
    },
    {
      name: 'dsh_workflow_studio_scaffold',
      description: 'Generates (without installing) a DSH bundle: host-tool, decoration, mcp, preset or skill. Returns the files.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['host-tool', 'decoration', 'mcp', 'preset', 'skill'] },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'type', 'title'],
      },
      output: {
        schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, files: { type: 'object' } } },
        render: (_a, v) => [{ type: 'text', text: `Scaffolded ${v?.type} '${v?.name}': ${Object.keys(v?.files || {}).join(', ')}` }],
      },
      async execute(args) {
        return studio.scaffoldPlugin(args);
      },
    },
  ];
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) return;

  const scanner = new CordisGraphScanner(ctx, { skillRoots: config.skillRoots || [] });
  const patcher = new CordisPatcher();
  const market = new MarketplaceBridge(ctx, { marketIndexes: config.marketIndexes || [] });
  const creator = new CreatorEngine();
  const ai = new AiBackend(ctx, config.ai || {});
  const ops = new HarnessOps(ctx, { scanner, creator, market });

  const studio = {
    getGraph: () => scanner.scan(),
    searchMarketplace: (query, kind) => market.search(query, kind),
    findAlternatives: (target, items) => market.findAlternatives(target, items),
    scaffoldPlugin: (spec) => creator.scaffoldBundle(spec),
    generatePatch: (staging) => patcher.generatePatch(staging),
    computeDiff: (before, after) => patcher.computeDiff(before, after),
    applyChanges: async (changes) => ops.apply(changes, await scanner.scan()),
  };

  // Owned by this plugin's fiber: removed automatically when the plugin unloads or reloads.
  ctx.provide('workflowStudio', studio);

  // Agent tools. Each registration is an effect, so a reload unregisters it before registering it again.
  for (const def of toolDefinitions(studio)) {
    ctx.effect(() => {
      const dispose = ctx.tools.register(def);
      return typeof dispose === 'function' ? dispose : () => ctx.tools.unregister?.(def.name);
    }, `tool ${def.name}`);
  }

  // Browser API. Waits for webServer without holding up the tools: the callback runs when the service
  // is available and is unloaded (routes removed) when it goes away or this plugin unloads.
  ctx.inject(['webServer'], (webCtx) => {
    const routes = registerRoutes(webCtx, createRouter({ ctx: webCtx, studio, ai, ops }));
    webCtx.effect(() => routes.dispose, 'workflow-studio routes');
  });
}
