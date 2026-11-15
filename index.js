import { CordisGraphScanner } from './src/host/scanner.js';
import { CordisPatcher } from './src/host/patcher.js';
import { MarketplaceBridge } from './src/host/market-bridge.js';
import { CreatorEngine } from './src/host/creator-engine.js';

export const inject = ['tools'];

/**
 * DeepSeek Harness Workflow Studio Host Plugin.
 */
export function apply(ctx, config) {
  const scanner = new CordisGraphScanner(ctx);
  const patcher = new CordisPatcher();
  const market = new MarketplaceBridge(ctx);
  const creator = new CreatorEngine();

  // Host Studio operations service
  const studio = {
    async getGraph() {
      return await scanner.scan();
    },

    async searchMarketplace(query, category) {
      return await market.search(query, category);
    },

    async findAlternatives(targetName) {
      return await market.findAlternatives(targetName);
    },

    scaffoldPlugin(spec) {
      return creator.scaffoldBundle(spec);
    },

    generatePatch(staging) {
      return patcher.generatePatch(staging);
    },

    computeDiff(baseline, staged) {
      return patcher.computeDiff(baseline, staged);
    },

    async applyPatch(patchYaml) {
      if (!ctx.pluginManager?.installBundle) {
        return {
          success: false,
          error: 'ctx.pluginManager is not available in the current context'
        };
      }
      return { success: true, message: 'Patch staged for application' };
    }
  };

  // Provide service safely in Cordis without triggering "cannot set property without provide"
  if (typeof ctx.provide === 'function') {
    ctx.provide('workflowStudio', studio);
  }

  // Register Agent Tools for Creator Mode & Copilot integration
  if (ctx.tools?.register) {
    ctx.tools.register({
      name: 'dsh_workflow_studio_graph',
      description: 'Inspects all active plugins, core services, agent presets, skills, and MCP clients in DeepSeek Harness as a node graph.',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: {
          type: 'object',
          properties: {
            nodesCount: { type: 'number' },
            edgesCount: { type: 'number' },
            nodes: { type: 'array' },
            edges: { type: 'array' }
          }
        },
        render: (_args, value) => [{
          type: 'text',
          text: `DSH Workflow Graph: ${value?.nodesCount || 0} active nodes, ${value?.edgesCount || 0} edges.`
        }]
      },
      async execute() {
        const graph = await studio.getGraph();
        return {
          nodesCount: graph.nodes.length,
          edgesCount: graph.edges.length,
          nodes: graph.nodes,
          edges: graph.edges
        };
      }
    });

    ctx.tools.register({
      name: 'dsh_workflow_studio_market',
      description: 'Searches the DeepSeek Harness plugin market, MCP registries, and community skills catalog.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          category: { type: 'string', enum: ['all', 'tools', 'mcp', 'skills', 'data'], description: 'Category filter' }
        }
      },
      output: {
        schema: {
          type: 'array',
          items: { type: 'object' }
        },
        render: (_args, value) => [{
          type: 'text',
          text: Array.isArray(value) && value.length > 0
            ? `Found ${value.length} marketplace item(s):\n` + value.map(i => `- ${i.title || i.name} [${i.type}]`).join('\n')
            : 'No matching marketplace items found.'
        }]
      },
      async execute(args) {
        return await studio.searchMarketplace(args.query || '', args.category || 'all');
      }
    });

    ctx.tools.register({
      name: 'dsh_workflow_studio_scaffold',
      description: 'Generates a compliant DeepSeek Harness bundle in Creator Mode (host-tool, decoration, mcp, or preset).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Package name (e.g. my-custom-tool)' },
          type: { type: 'string', enum: ['host-tool', 'decoration', 'mcp', 'preset'], description: 'Bundle template type' },
          title: { type: 'string', description: 'Display title' },
          description: { type: 'string', description: 'What the plugin does' }
        },
        required: ['name', 'type', 'title']
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            files: { type: 'object' }
          }
        },
        render: (_args, value) => [{
          type: 'text',
          text: `Scaffolded ${value?.type} bundle '${value?.name}' with files: ${Object.keys(value?.files || {}).join(', ')}`
        }]
      },
      async execute(args) {
        return studio.scaffoldPlugin(args);
      }
    });
  }

  // Cleanup effect
  return () => {
    // Cordis automatically disposes services provided via ctx.provide
  };
}
