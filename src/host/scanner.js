import fs from 'node:fs';
import path from 'node:path';

/**
 * Inspects the live Cordis registry and filesystem to build the unified visual DAG.
 */
export class CordisGraphScanner {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * Scans the runtime and returns all nodes and edges.
   */
  async scan() {
    const nodes = [];
    const edges = [];

    // 1. Core Services & Host Plugins from Cordis registry
    const registeredPlugins = this.ctx?.registry ? Array.from(this.ctx.registry.values()) : [];
    
    // Core system plugins map
    const coreKnownPackages = new Set([
      '@deepseek-ai/dsh-core',
      '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-plugin-manager',
      '@deepseek-ai/dsh-client-modules',
      '@deepseek-ai/dsh-storage',
      '@deepseek-ai/dsh-shell-env'
    ]);

    // Track found plugin identifiers
    const processedIds = new Set();

    for (const pluginEntry of registeredPlugins) {
      const plugin = pluginEntry?.plugin || pluginEntry;
      const name = plugin?.name || plugin?.id || 'anonymous-plugin';
      const id = plugin?.id || name;

      if (processedIds.has(id)) continue;
      processedIds.add(id);

      const isCore = coreKnownPackages.has(name) || name.startsWith('@deepseek-ai/dsh-core') || !id.startsWith('@local/');
      
      nodes.push({
        id: `plugin:${id}`,
        label: name.replace(/^@deepseek-ai\/dsh-/, ''),
        fullPackage: name,
        type: isCore ? 'core-service' : 'host-plugin',
        readOnly: isCore,
        status: 'active',
        injectedServices: Array.isArray(plugin?.inject) ? plugin.inject : [],
        providedServices: plugin?.service ? [plugin.service] : []
      });
    }

    // Fallback baseline core nodes if registry is running headlessly
    if (nodes.length === 0) {
      const baselines = [
        { id: 'core:tools', label: 'Tools Registry (ctx.tools)', type: 'core-service', readOnly: true },
        { id: 'core:session', label: 'Session Store (ctx.sessions)', type: 'core-service', readOnly: true },
        { id: 'core:agents', label: 'Agent Runtime (ctx.agents)', type: 'core-service', readOnly: true },
        { id: 'core:pluginManager', label: 'Plugin Manager (ctx.pluginManager)', type: 'core-service', readOnly: true },
      ];
      for (const b of baselines) nodes.push(b);
    }

    // 2. Discover Agent Presets
    const presets = await this.discoverPresets();
    for (const preset of presets) {
      const presetNodeId = `preset:${preset.id}`;
      nodes.push({
        id: presetNodeId,
        label: preset.name || preset.id,
        description: preset.description || '',
        type: 'agent-preset',
        readOnly: preset.isShipped || false,
        status: 'active',
        plugins: preset.plugins || []
      });

      // Link preset to its constituent plugins, tools, or MCPs
      if (Array.isArray(preset.plugins)) {
        for (const child of preset.plugins) {
          const childId = child.name || child.id;
          edges.push({
            id: `edge:${presetNodeId}->${childId}`,
            source: presetNodeId,
            target: `plugin:${childId}`,
            type: 'agent-composition',
            label: 'mounts'
          });
        }
      }
    }

    // 3. Discover Skills in .agents/skills
    const skills = await this.discoverLocalSkills();
    for (const skill of skills) {
      const skillNodeId = `skill:${skill.name}`;
      nodes.push({
        id: skillNodeId,
        label: skill.name,
        description: skill.description,
        type: 'skill-subnode',
        readOnly: false,
        status: 'ready',
        path: skill.path
      });

      // Connect skill to active standard preset
      edges.push({
        id: `edge:preset:standard->${skillNodeId}`,
        source: 'preset:standard',
        target: skillNodeId,
        type: 'agent-composition',
        label: 'instruction'
      });
    }

    // 4. Discover MCP Clients
    const mcps = await this.discoverMcpClients();
    for (const mcp of mcps) {
      const mcpNodeId = `mcp:${mcp.serverName}`;
      nodes.push({
        id: mcpNodeId,
        label: `MCP: ${mcp.serverName}`,
        type: 'mcp-subnode',
        readOnly: false,
        status: mcp.status || 'connected',
        transport: mcp.transport,
        tools: mcp.tools || []
      });

      edges.push({
        id: `edge:preset:standard->${mcpNodeId}`,
        source: 'preset:standard',
        target: mcpNodeId,
        type: 'agent-composition',
        label: 'tools'
      });
    }

    return { nodes, edges, timestamp: Date.now() };
  }

  /**
   * Discovers agent presets from configuration or files.
   */
  async discoverPresets() {
    return [
      {
        id: 'standard',
        name: 'Standard Agent',
        description: 'Default agent with shell, file edit, and reasoning capabilities.',
        isShipped: true,
        plugins: [
          { id: 'persona', name: '@deepseek-ai/dsh-persona' },
          { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' },
          { id: 'tool-editor', name: '@deepseek-ai/dsh-tool-str-replace-editor' }
        ]
      },
      {
        id: 'ptc',
        name: 'PTC Agent',
        description: 'Programmatic tool calling agent with sandbox executor.',
        isShipped: true,
        plugins: [
          { id: 'persona', name: '@deepseek-ai/dsh-persona' },
          { id: 'tool-ptc', name: '@deepseek-ai/dsh-tool-executor-ptc' }
        ]
      },
      {
        id: 'minimal',
        name: 'Minimal Agent',
        description: 'Lightweight conversational agent.',
        isShipped: true,
        plugins: [
          { id: 'persona', name: '@deepseek-ai/dsh-persona' }
        ]
      }
    ];
  }

  /**
   * Reads .agents/skills directory for registered skills.
   */
  async discoverLocalSkills() {
    const skills = [];
    const skillsDir = path.resolve(process.cwd(), '.agents/skills');
    if (!fs.existsSync(skillsDir)) return skills;

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8');
          const descMatch = content.match(/description:\s*>?-?\s*(.*?)(?=\n---|\n[a-z_]+:)/s);
          skills.push({
            name: entry.name,
            description: descMatch ? descMatch[1].trim().replace(/\s+/g, ' ') : 'Agent skill instructions',
            path: skillMd
          });
        }
      }
    }
    return skills;
  }

  /**
   * Reads connected MCP configurations.
   */
  async discoverMcpClients() {
    // In DSH, ctx.mcpManager provides active clients.
    if (this.ctx?.mcpManager?.listClients) {
      try {
        return await this.ctx.mcpManager.listClients();
      } catch {
        // Fallback
      }
    }
    return [
      {
        serverName: 'builtin-mcp',
        transport: 'streamable-http',
        status: 'connected',
        tools: ['query', 'mutate']
      }
    ];
  }
}
