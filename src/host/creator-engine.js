import path from 'node:path';

/**
 * In-Built Creator Mode Scaffolder.
 * Follows DeepSeek Harness and Cordis plugin development specifications.
 */
export class CreatorEngine {
  /**
   * Scaffolds a complete DSH bundle based on user specification.
   * @param {Object} spec
   * @param {string} spec.name - Package name (e.g. '@local/my-tool')
   * @param {string} spec.type - 'host-tool' | 'decoration' | 'mcp' | 'preset'
   * @param {string} spec.title - Human readable title
   * @param {string} spec.description - Description
   * @param {string} spec.code - Optional custom implementation
   */
  scaffoldBundle(spec) {
    const pkgName = spec.name.startsWith('@') ? spec.name : `@local/${spec.name}`;
    const cleanId = pkgName.replace(/^@.*\//, '');

    const files = {};

    switch (spec.type) {
      case 'mcp':
        return this.scaffoldMcpBundle(pkgName, cleanId, spec);
      case 'decoration':
        return this.scaffoldDecorationBundle(pkgName, cleanId, spec);
      case 'preset':
        return this.scaffoldPresetBundle(pkgName, cleanId, spec);
      case 'host-tool':
      default:
        return this.scaffoldHostToolBundle(pkgName, cleanId, spec);
    }
  }

  scaffoldHostToolBundle(pkgName, cleanId, spec) {
    const files = {};

    files['package.json'] = JSON.stringify({
      name: pkgName,
      version: '1.0.0',
      private: true,
      type: 'module',
      exports: {
        '.': './index.js',
        './locale/*.json': './locale/*.json',
        './icon': './icon.svg'
      },
      files: ['index.js', 'cordis.patch.yml', 'locale/*.json', 'icon.svg'],
      dsh: {
        bundle: { patch: './cordis.patch.yml' }
      }
    }, null, 2);

    files['cordis.patch.yml'] = `- insert:
    - id: ${cleanId}
      name: '${pkgName}'
      config: {}
`;

    files['index.js'] = `/**
 * ${spec.title || cleanId} - DeepSeek Harness Host Plugin
 */
export const inject = ['tools'];

export function apply(ctx, config) {
  // Register custom tool
  ctx.tools.register({
    name: '${cleanId}_execute',
    description: ${JSON.stringify(spec.description || 'Custom tool generated in Workflow Studio Creator Mode')},
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input data' }
      },
      required: ['input']
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          result: { type: 'string' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: value?.result || String(value?.status)
      }]
    },
    async execute(args) {
      return {
        status: 'success',
        result: \`Processed: \${args.input}\`
      };
    }
  });
}
`;

    files['locale/en.json'] = JSON.stringify({
      meta: {
        title: spec.title || cleanId,
        description: spec.description || 'Custom host tool bundle.'
      }
    }, null, 2);

    files['icon.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
  <rect x="6" y="6" width="24" height="24" rx="6" fill="#10b981" fill-opacity="0.2" stroke="#10b981" stroke-width="1.8"/>
  <path d="M12 18H24M18 12V24" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
</svg>`;

    return { id: cleanId, name: pkgName, type: 'host-tool', files };
  }

  scaffoldMcpBundle(pkgName, cleanId, spec) {
    const files = {};

    files['package.json'] = JSON.stringify({
      name: pkgName,
      version: '1.0.0',
      private: true,
      type: 'module',
      dsh: {
        bundle: { patch: './cordis.patch.yml' }
      }
    }, null, 2);

    files['cordis.patch.yml'] = `- insert:
    - id: mcp-${cleanId}
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: '${cleanId}'
        transport: '${spec.transport || 'stdio'}'
        ${spec.transport === 'streamable-http' ? `url: '${spec.url || 'http://localhost:8080/sse'}'` : `command: '${spec.command || 'npx'}'
        args: ${JSON.stringify(spec.args || ['-y', cleanId])}`}
        failOnStartupError: true
`;

    files['locale/en.json'] = JSON.stringify({
      meta: {
        title: spec.title || `MCP ${cleanId}`,
        description: spec.description || `MCP server bridge for ${cleanId}`
      }
    }, null, 2);

    return { id: `mcp-${cleanId}`, name: pkgName, type: 'mcp', files };
  }

  scaffoldDecorationBundle(pkgName, cleanId, spec) {
    const files = {};

    files['package.json'] = JSON.stringify({
      name: pkgName,
      version: '1.0.0',
      private: true,
      type: 'module',
      exports: {
        '.': './index.js',
        './client': './client.js',
        './locale/*.json': './locale/*.json',
        './icon': './icon.svg'
      },
      files: ['index.js', 'client.js', 'cordis.patch.yml', 'locale/*.json', 'icon.svg'],
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: {
          platform: 'web',
          immediately: true,
          inject: ['slots']
        }
      }
    }, null, 2);

    files['cordis.patch.yml'] = `- insert:
    - id: ${cleanId}
      name: '${pkgName}'
`;

    files['index.js'] = `/** Host half of UI plugin */\nexport function apply() {}\n`;

    files['client.js'] = `window.__ModuleLoader__.load({
  id: '${pkgName}',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    function Widget() {
      return h('div', { style: { padding: '8px', fontSize: '13px' } }, '${spec.title || cleanId}');
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('${spec.slot || 'conversation.composer.dock'}', () => ctx.slots.register({
          name: '${spec.slot || 'conversation.composer.dock'}', id: '${cleanId}', order: 10,
        }, Widget));
      },
    };
  },
});
`;

    files['locale/en.json'] = JSON.stringify({
      meta: {
        title: spec.title || cleanId,
        description: spec.description || 'UI decoration plugin.'
      }
    }, null, 2);

    return { id: cleanId, name: pkgName, type: 'decoration', files };
  }

  scaffoldPresetBundle(pkgName, cleanId, spec) {
    const files = {};

    files['package.json'] = JSON.stringify({
      name: pkgName,
      version: '1.0.0',
      private: true,
      type: 'module',
      dsh: {
        bundle: { patch: './cordis.patch.yml' }
      }
    }, null, 2);

    files['cordis.patch.yml'] = `- insert:
    - id: preset-${cleanId}
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: '${cleanId}'
        name: '${spec.title || cleanId}'
        description: '${spec.description || 'Custom composition preset.'}'
        order: 15
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: '${spec.prompt || 'You are a specialized agent.'}'
          - id: tool-bash
            name: '@deepseek-ai/dsh-tool-bash'
`;

    return { id: `preset-${cleanId}`, name: pkgName, type: 'preset', files };
  }
}
