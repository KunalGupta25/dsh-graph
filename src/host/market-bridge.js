/**
 * Bridges to DSH plugin market, external custom indexes, MCP registries, and skill libraries.
 */
export class MarketplaceBridge {
  constructor(ctx) {
    this.ctx = ctx;
    this.customIndexUrls = [];
  }

  /**
   * Searches the aggregated catalog.
   */
  async search(query = '', category = 'all') {
    const results = [];

    // 1. Official and Community DSH Plugins
    const plugins = this.getCuratedDshPlugins();
    for (const p of plugins) {
      if (this.matches(p, query, category)) {
        results.push(p);
      }
    }

    // 2. Curated MCP Servers
    const mcps = this.getCuratedMcpServers();
    for (const m of mcps) {
      if (this.matches(m, query, category)) {
        results.push(m);
      }
    }

    // 3. Recommended Skills
    const skills = this.getCuratedSkills();
    for (const s of skills) {
      if (this.matches(s, query, category)) {
        results.push(s);
      }
    }

    return results;
  }

  /**
   * Finds alternatives for a given package or tool.
   */
  async findAlternatives(targetName) {
    const catalog = [
      ...this.getCuratedDshPlugins(),
      ...this.getCuratedMcpServers(),
      ...this.getCuratedSkills()
    ];

    const current = catalog.find(item => item.name === targetName || item.id === targetName);
    if (!current) {
      return catalog.slice(0, 3);
    }

    // Match by category and shared tags
    return catalog
      .filter(item => item.id !== current.id && (item.category === current.category || item.tags.some(t => current.tags.includes(t))))
      .slice(0, 4);
  }

  matches(item, query, category) {
    const q = query.toLowerCase();
    const matchesCat = category === 'all' || item.category === category;
    const matchesText = !query || 
      item.title.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.tags && item.tags.some(t => t.toLowerCase().includes(q)));
    return matchesCat && matchesText;
  }

  getCuratedDshPlugins() {
    return [
      {
        id: 'dsh-tool-bash',
        name: '@deepseek-ai/dsh-tool-bash',
        title: 'Bash Execution Tool',
        category: 'tools',
        description: 'Enables model execution of safe terminal commands inside the workspace.',
        author: 'DeepSeek AI',
        version: '1.0.0',
        tags: ['shell', 'terminal', 'cli', 'execution'],
        type: 'dsh-plugin',
        installable: true
      },
      {
        id: 'dsh-tool-str-replace-editor',
        name: '@deepseek-ai/dsh-tool-str-replace-editor',
        title: 'File Str Replace Editor',
        category: 'tools',
        description: 'Precise targeted text file viewing, replacement, and insertion.',
        author: 'DeepSeek AI',
        version: '1.0.0',
        tags: ['files', 'editor', 'code'],
        type: 'dsh-plugin',
        installable: true
      },
      {
        id: 'dsh-web-search',
        name: '@deepseek-ai/dsh-web-search',
        title: 'Web Search & Fetch',
        category: 'tools',
        description: 'Provides live web query search and webpage scraping capability.',
        author: 'DeepSeek AI',
        version: '1.0.0',
        tags: ['web', 'search', 'browsing'],
        type: 'dsh-plugin',
        installable: true
      },
      {
        id: 'dsh-plugin-redis',
        name: '@community/dsh-plugin-redis',
        title: 'Redis Connector Plugin',
        category: 'data',
        description: 'Connects DeepSeek Harness agents to Redis clusters for caching and pub/sub.',
        author: 'Community',
        version: '0.4.1',
        tags: ['redis', 'database', 'cache', 'kv'],
        type: 'dsh-plugin',
        installable: true
      },
      {
        id: 'dsh-plugin-postgres',
        name: '@community/dsh-plugin-postgres',
        title: 'PostgreSQL Manager',
        category: 'data',
        description: 'Inspect schemas, run SQL queries, and manage Postgres connections.',
        author: 'Community',
        version: '0.5.0',
        tags: ['sql', 'postgres', 'database'],
        type: 'dsh-plugin',
        installable: true
      }
    ];
  }

  getCuratedMcpServers() {
    return [
      {
        id: 'mcp-github',
        name: '@modelcontextprotocol/server-github',
        title: 'GitHub MCP Server',
        category: 'mcp',
        description: 'Model Context Protocol connector to GitHub APIs, repositories, issues, and PRs.',
        author: 'Anthropic / MCP',
        version: '1.2.0',
        transport: 'stdio',
        tags: ['github', 'git', 'vcs', 'mcp'],
        type: 'mcp',
        installable: true
      },
      {
        id: 'mcp-postgres',
        name: '@modelcontextprotocol/server-postgres',
        title: 'Postgres MCP Server',
        category: 'mcp',
        description: 'Read-only and transactional database access over MCP protocol.',
        author: 'Anthropic / MCP',
        version: '1.1.0',
        transport: 'stdio',
        tags: ['database', 'sql', 'mcp'],
        type: 'mcp',
        installable: true
      },
      {
        id: 'mcp-sqlite',
        name: 'mcp-server-sqlite',
        title: 'SQLite Local MCP Server',
        category: 'mcp',
        description: 'Fast local SQLite database query and schema inspection.',
        author: 'Community',
        version: '0.9.0',
        transport: 'stdio',
        tags: ['sqlite', 'database', 'local', 'mcp'],
        type: 'mcp',
        installable: true
      }
    ];
  }

  getCuratedSkills() {
    return [
      {
        id: 'skill-antislop',
        name: 'antislop',
        title: 'Anti-Slop Clean Code Skill',
        category: 'skills',
        description: 'Enforces crisp, fluff-free coding practices and eliminates boilerplate comments.',
        author: 'Community',
        version: '1.0.0',
        tags: ['code-quality', 'refactor', 'clean-code'],
        type: 'skill',
        installable: true
      },
      {
        id: 'skill-gravitas',
        name: 'gravitas',
        title: 'Gravitas Verification Runtime',
        category: 'skills',
        description: 'Engineering reliability runtime enforcing evidence-backed verification and strict scoping.',
        author: 'Community',
        version: '2.0.0',
        tags: ['reliability', 'testing', 'verification'],
        type: 'skill',
        installable: true
      }
    ];
  }
}
