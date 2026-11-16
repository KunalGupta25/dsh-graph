import { slug, toYaml } from './util.js';

const COLORS = { 'host-tool': '#10b981', decoration: '#6366f1', mcp: '#06b6d4', preset: '#f59e0b', skill: '#a855f7' };

function icon(type) {
  const c = COLORS[type] || '#64748b';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">\n  <rect x="6" y="6" width="24" height="24" rx="6" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="1.8"/>\n  <path d="M12 18h12M18 12v12" stroke="${c}" stroke-width="2" stroke-linecap="round"/>\n</svg>\n`;
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** Builds DeepSeek Harness bundles (following the dsh-doc bundle rules). Pure: returns files, writes nothing. */
export class CreatorEngine {
  scaffoldBundle(spec = {}) {
    const id = slug(spec.name) || 'my-plugin';
    const pkgName = spec.name && String(spec.name).startsWith('@') ? spec.name : `@local/${id}`;
    const title = String(spec.title || id);
    const description = String(spec.description || `${title} for DeepSeek Harness.`);
    const type = ['host-tool', 'decoration', 'mcp', 'preset', 'skill'].includes(spec.type) ? spec.type : 'host-tool';
    const ctxInfo = { id, pkgName, title, description, spec };
    const files = this[`build_${type.replace('-', '_')}`](ctxInfo);
    return { id, name: pkgName, type, title, files, notes: this.notes(type) };
  }

  notes(type) {
    if (type === 'skill') return 'Saved as a skill directory; it appears once a skill provider scans that folder.';
    return 'Installing a bundle runs its code in the Host process. Review the generated files before applying.';
  }

  locale({ title, description }) {
    return json({ meta: { title, description }, detail: 'docs/DETAIL.md' });
  }

  docs({ title, description }) {
    return `# ${title}\n\n${description}\n`;
  }

  baseManifest({ pkgName, description }, extra = {}) {
    return {
      name: pkgName, version: '1.0.0', description, private: true, type: 'module',
      exports: { ...(extra.exports || {}), './locale/*.json': './locale/*.json', './icon': './icon.svg' },
      files: [...(extra.files || []), 'cordis.patch.yml', 'locale/*.json', 'docs', 'icon.svg'],
      ...(extra.rest || {}),
      dsh: { bundle: { patch: './cordis.patch.yml' }, ...(extra.dsh || {}) },
    };
  }

  build_host_tool(c) {
    const toolName = `${c.id.replace(/-/g, '_')}_run`;
    return {
      'package.json': json(this.baseManifest(c, { exports: { '.': './index.js' }, files: ['index.js'] })),
      'cordis.patch.yml': toYaml([{ insert: [{ id: c.id, name: c.pkgName, config: {} }] }]),
      'index.js': `export const inject = ['tools'];\n\nexport function apply(ctx) {\n  ctx.tools.register({\n    name: ${JSON.stringify(toolName)},\n    description: ${JSON.stringify(c.description)},\n    parameters: { type: 'object', properties: { input: { type: 'string', description: 'Input text' } }, required: ['input'] },\n    output: {\n      schema: { type: 'object', properties: { result: { type: 'string' } } },\n      render: (_args, value) => [{ type: 'text', text: String(value?.result ?? '') }],\n    },\n    async execute(args) {\n      return { result: \`Processed: \${args.input}\` };\n    },\n  });\n}\n`,
      'locale/en.json': this.locale(c),
      'locale/zh.json': this.locale(c),
      'docs/DETAIL.md': this.docs(c),
      'icon.svg': icon('host-tool'),
    };
  }

  build_decoration(c) {
    const slot = c.spec.slot || 'conversation.composer.dock';
    return {
      'package.json': json(this.baseManifest(c, {
        exports: { '.': './index.js', './client': './client.js' }, files: ['index.js', 'client.js'],
        dsh: { client: { platform: 'web', immediately: true, inject: ['@deepseek-ai/dsh-client-ui-conversation'] } },
      })),
      'cordis.patch.yml': toYaml([{ insert: [{ id: c.id, name: c.pkgName }] }]),
      'index.js': 'export function apply() {}\n',
      'client.js': `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(c.pkgName)},\n  factory(require) {\n    const React = require('react');\n    const h = React.createElement;\n    function Widget() {\n      return h('div', { style: { padding: 8, fontSize: 13 } }, ${JSON.stringify(c.title)});\n    }\n    return {\n      inject: ['slots'],\n      apply(ctx) {\n        ctx.slots.inject(${JSON.stringify(slot)}, () => ctx.slots.register({ name: ${JSON.stringify(slot)}, id: ${JSON.stringify(c.id)}, order: 10 }, Widget));\n      },\n    };\n  },\n});\n`,
      'locale/en.json': this.locale(c),
      'locale/zh.json': this.locale(c),
      'docs/DETAIL.md': this.docs(c),
      'icon.svg': icon('decoration'),
    };
  }

  build_mcp(c) {
    const s = c.spec;
    const config = { serverName: slug(s.serverName || c.id), failOnStartupError: true };
    if (s.transport === 'streamable-http' || s.url) {
      config.transport = 'streamable-http';
      config.url = s.url || 'http://127.0.0.1:3000/mcp';
    } else {
      config.transport = 'stdio';
      config.command = s.command || 'npx';
      config.args = Array.isArray(s.args) ? s.args : ['-y', s.package || c.id];
      if (s.env && typeof s.env === 'object' && Object.keys(s.env).length) config.env = s.env;
    }
    return {
      'package.json': json({
        name: c.pkgName, version: '1.0.0', description: c.description, private: true, type: 'module',
        exports: { './locale/*.json': './locale/*.json', './icon': './icon.svg' },
        files: ['cordis.patch.yml', 'locale/*.json', 'docs', 'icon.svg'], dsh: { bundle: { patch: './cordis.patch.yml' } },
      }),
      'cordis.patch.yml': toYaml([{ insert: [{ id: `mcp-${c.id}`, name: '@deepseek-ai/dsh-mcp-client', config }] }]),
      'locale/en.json': this.locale(c),
      'locale/zh.json': this.locale(c),
      'docs/DETAIL.md': this.docs(c),
      'icon.svg': icon('mcp'),
    };
  }

  build_preset(c) {
    const s = c.spec;
    const plugins = Array.isArray(s.plugins) && s.plugins.length ? s.plugins : [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: s.prompt || 'You are a specialised agent.' } },
      { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' },
    ];
    return {
      'package.json': json({
        name: c.pkgName, version: '1.0.0', description: c.description, private: true, type: 'module',
        exports: { './locale/*.json': './locale/*.json', './icon': './icon.svg' },
        files: ['cordis.patch.yml', 'locale/*.json', 'docs', 'icon.svg'], dsh: { bundle: { patch: './cordis.patch.yml' } },
      }),
      'cordis.patch.yml': toYaml([{ insert: [{ id: `preset-${c.id}`, name: '@deepseek-ai/dsh-agent-preset', config: { id: c.id, name: c.title, description: c.description, order: 15, plugins } }] }]),
      'locale/en.json': this.locale(c),
      'locale/zh.json': this.locale(c),
      'docs/DETAIL.md': this.docs(c),
      'icon.svg': icon('preset'),
    };
  }

  build_skill(c) {
    return {
      'SKILL.md': `---\nname: ${c.id}\ndescription: ${JSON.stringify(c.description)}\n---\n\n# ${c.title}\n\n${c.spec.instructions || 'Describe when to use this skill and the steps the agent should follow.'}\n`,
    };
  }
}
