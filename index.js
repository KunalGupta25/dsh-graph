import { CordisGraphScanner } from './src/host/scanner.js';
import { CordisPatcher } from './src/host/patcher.js';
import { MarketplaceBridge } from './src/host/market-bridge.js';
import { CreatorEngine } from './src/host/creator-engine.js';
import { AiBackend } from './src/host/ai.js';
import { HarnessOps } from './src/host/ops.js';
import { createRouter, registerRoutes } from './src/host/routes.js';
import z from '@deepseek-ai/schemastery';

// All services are read lazily via ctx.get() so the plugin activates in any profile.
export const inject = {};

export const Config = z.object({
  enabled: z.boolean().loose(),
  ai: z.object({
    baseUrl: z.string().loose(),
    model: z.string().loose(),
  }).loose(),
  skillRoots: z.array(z.string()).loose(),
  marketIndexes: z.array(z.string()).loose(),
}).loose();

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

  if (typeof ctx.provide === 'function') ctx.provide('workflowStudio', studio);

  const routes = registerRoutes(ctx, createRouter({ ctx, studio, ai, ops }));
  ctx.on?.('dispose', routes.dispose);

  // Lazy-load tools service; only register agent tools if available
  const tools = ctx.get('tools');
  if (tools?.register) {
    tools.register({
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
    });

    tools.register({
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
    });

    tools.register({
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
    });
  }
}
