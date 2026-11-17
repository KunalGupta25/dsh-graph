import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { callAny, dshHome, maskSecrets } from './util.js';

const CORE_SERVICES = [
  ['tools', 'Tool registry', 'Registers model-facing tools and runs every tool call through the execution pipeline.'],
  ['sessions', 'Session store', 'Append-only, event-sourced conversation log that everything the model sees derives from.'],
  ['agents', 'Agent runtime', 'Live agents, turns and steps.'],
  ['llm', 'LLM adapters', 'Provider-neutral model streaming; adapters register here.'],
  ['skills', 'Skill registry', 'Merges skill catalogs from providers and serves skill bodies to the model.'],
  ['subagents', 'Subagents', 'Delegation to child agents through registered backends.'],
  ['pluginManager', 'Plugin manager', 'Installs, enables, disables and removes bundles for the current profile.'],
  ['pluginMarket', 'Plugin market', 'Reads the configured plugin market indexes.'],
  ['settings', 'Settings', 'Configuration forms for plugin config fields.'],
  ['credentials', 'Credentials', 'Secret storage; config carries references, providers hold values.'],
  ['storage', 'Storage hub', 'Named storage backends and data forms.'],
  ['fs', 'Filesystem seam', 'Filesystem provider used by file tools.'],
  ['shell', 'Shell seam', 'Bash/PowerShell executor used by shell tools.'],
  ['webServer', 'Web server', 'HTTP routes for the browser client.'],
  ['workflowEngine', 'Workflow engine', 'Scripted multi-agent orchestration.'],
];

// Plugins that keep the harness itself running. Their config can be read but the studio will not
// let you disable or remove them.
const LOCKED = /^@deepseek-ai\/dsh-(agent|agent-loop|session|session-persistence-jsonl|tools|plugin-manager|config-editor|hmr|storage|storage-domain|storage-json|typert-.+|system-prompt|llm|api-.+|host-.+|client-(connection|modules|hmr|resources|locale)|client-ui-(renderer|layout|theme|session|sidebar|settings|plugin-manager))$/;

export function classify(name = '') {
  if (/dsh-mcp-(client|manager)$/.test(name)) return 'mcp';
  if (/dsh-agent-preset$/.test(name)) return 'preset';
  if (/dsh-(tool|command)-/.test(name)) return 'tool';
  return 'plugin';
}

const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const pickTitle = (meta, fallback) => {
  const m = meta?.en?.meta || meta?.en || meta?.meta || meta;
  return (m && typeof m.title === 'string' && m.title) || fallback;
};
const pickDescription = (meta, fallback = '') => {
  const m = meta?.en?.meta || meta?.en || meta?.meta || meta;
  return (m && typeof m.description === 'string' && m.description) || fallback;
};

export class CordisGraphScanner {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.options = options;
  }

  svc(key) {
    try {
      return typeof this.ctx.get === 'function' ? this.ctx.get(key) : this.ctx[key];
    } catch {
      return undefined;
    }
  }

  async scan() {
    const nodes = [];
    const edges = [];
    const seen = new Set();
    const sources = {};
    const add = (node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      nodes.push(node);
      return true;
    };
    const link = (from, to, kind = 'composition') => {
      if (!seen.has(from) || !seen.has(to)) return;
      const id = `${from}->${to}`;
      if (!edges.some((e) => e.id === id)) edges.push({ id, from, to, kind });
    };

    // 1. Core services that are live in this process.
    for (const [key, label, description] of CORE_SERVICES) {
      if (this.svc(key) === undefined) continue;
      add({
        id: `core:${key}`, label, type: 'core', package: `ctx.${key}`, editable: false,
        lockReason: 'Core service provided by the runtime', origin: 'core', state: 'active', description,
      });
    }
    sources.core = nodes.length > 0;

    // 2. Bundles (what is installed in the profile) and their declared rows.
    const bundles = await this.listBundles(sources);
    const rowMeta = new Map(); // row id -> { bundle, official }
    for (const b of bundles) {
      const official = Boolean(b.official) || (!b.source && /^@deepseek-ai\//.test(b.name || ''));
      const bundleId = `bundle:${b.name}`;
      if (!official) {
        add({
          id: bundleId, label: pickTitle(b.meta, b.name), type: 'bundle', package: b.name, version: b.version,
          editable: true, origin: 'profile', state: b.error ? 'error' : b.enabled === false ? 'disabled' : 'active',
          description: pickDescription(b.meta, b.description || ''), source: b.source, error: b.error?.message || (typeof b.error === 'string' ? b.error : undefined),
          bundle: b.name, enabled: b.enabled !== false,
        });
      }
      for (const row of arr(b.rows ?? b.plugins ?? b.entries)) {
        const id = row?.id ?? row?.entry ?? row?.name;
        if (id) rowMeta.set(String(id), { bundle: b.name, official, bundleNodeId: official ? null : bundleId, row });
      }
    }

    // 3. Live Loader entries (every plugin row that exists in this process).
    const entries = await this.loaderEntries(sources);
    const rows = entries.length ? entries : [...rowMeta.entries()].map(([id, m]) => ({ id, options: { id, name: m.row?.name, config: m.row?.config, disabled: m.row?.disabled }, live: false }));
    for (const entry of rows) {
      const o = entry.options || {};
      const id = String(o.id ?? entry.id);
      const pkg = o.name || '';
      const meta = rowMeta.get(id);
      const type = classify(pkg);
      const locked = LOCKED.test(pkg) || pkg === '@local/dsh-workflow-studio';
      const label = (meta && pickTitle(meta.row?.meta, '')) || id.replace(/^(preset|mcp|tool)-/, '');
      const node = {
        id: `row:${id}`, rowId: id, label, type, package: pkg, version: undefined,
        editable: !locked, lockReason: locked ? 'Infrastructure plugin: configuration can be viewed, but it cannot be disabled or removed here' : undefined,
        origin: meta && !meta.official ? 'profile' : 'shipped', bundle: meta?.bundle,
        state: o.disabled === true ? 'disabled' : entry.live === false ? 'declared' : entry.state || 'active',
        description: pickDescription(meta?.row?.meta, '') || this.describePackage(pkg),
        config: maskSecrets(o.config ?? {}),
        hasConfig: o.config !== undefined && o.config !== null && Object.keys(o.config || {}).length > 0,
      };
      if (!add(node)) continue;
      if (meta?.bundleNodeId) link(meta.bundleNodeId, node.id, 'bundle');
      if (type === 'tool' || type === 'mcp') link('core:tools', node.id, 'tools');
      if (type === 'preset') link('core:agents', node.id, 'core-flow');

      // Preset compositions: children listed in config.plugins.
      if (type === 'preset' && Array.isArray(o.config?.plugins)) {
        node.presetId = o.config.id;
        node.presetPlugins = o.config.plugins.map((p) => ({ id: p.id, name: p.name }));
        for (const child of o.config.plugins) {
          const childId = `row:${id}/${child.id ?? child.name}`;
          add({
            id: childId, rowId: `${id}/${child.id ?? child.name}`, label: String(child.id ?? child.name).replace(/^tool-/, ''),
            type: classify(child.name), package: child.name, editable: node.editable, origin: node.origin,
            state: child.disabled === true ? 'disabled' : 'active', parent: node.id,
            description: this.describePackage(child.name), config: maskSecrets(child.config ?? {}), hasConfig: Boolean(child.config && Object.keys(child.config).length),
            lockReason: node.editable ? undefined : node.lockReason,
          });
          link(node.id, childId, 'composition');
        }
      }
    }

    // 4. MCP tools exposed through ctx.tools (mcp__<server>__<tool>).
    const toolNames = await this.toolNames(sources);
    const byServer = new Map();
    for (const t of toolNames) {
      const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(t);
      if (m) byServer.set(m[1], [...(byServer.get(m[1]) || []), m[2]]);
    }
    for (const n of nodes.filter((x) => x.type === 'mcp')) {
      const server = n.config?.serverName;
      if (server && byServer.has(server)) n.tools = byServer.get(server);
    }

    // 5. Skills.
    const skills = await this.listSkills(sources);
    for (const s of skills) {
      const id = `skill:${s.name}`;
      add({
        id, label: s.name, type: 'skill', package: s.path ? path.basename(path.dirname(s.path)) : s.name, editable: s.editable !== false,
        origin: s.origin || 'profile', state: 'active', description: s.description || 'Agent skill', path: s.path,
        lockReason: s.editable === false ? 'Provided by a bundled skill provider' : undefined,
      });
      link('core:skills', id, 'instruction');
    }

    return { nodes, edges, sources, timestamp: Date.now(), profile: process.env.DSH_PROFILE || null };
  }

  describePackage(name) {
    return name ? `Plugin package ${name}.` : '';
  }

  async listBundles(sources) {
    const pm = this.svc('pluginManager');
    const res = await callAny(pm, ['listBundles'], [[], [{}]]);
    sources.pluginManager = res.ok;
    if (!res.ok) { sources.pluginManagerError = res.error; return []; }
    const v = res.value;
    return arr(v?.bundles ?? v);
  }

  /**
   * Reads entries from the Cordis loader.
   * Verified: In Cordis runtime, loader.entries() is a generator method (*entries()) yielding Entry objects.
   */
  async loaderEntries(sources) {
    let loader;
    try { loader = typeof this.ctx.get === 'function' ? this.ctx.get('loader') : this.ctx.loader; } catch { /* unavailable */ }
    if (!loader) { sources.loader = false; return []; }
    let rawEntries = [];
    if (typeof loader.entries === 'function') {
      try {
        const iter = loader.entries();
        // Handle both sync and async generators
        if (iter && typeof iter.next === 'function') {
          // Check if it's an async generator (has [Symbol.asyncIterator])
          if (iter[Symbol.asyncIterator]) {
            for await (const e of iter) rawEntries.push(e);
          } else {
            for (const e of iter) rawEntries.push(e);
          }
        }
      } catch { /* fallback */ }
    } else if (loader.entries && typeof loader.entries === 'object') {
      rawEntries = Object.values(loader.entries);
    }
    sources.loader = rawEntries.length > 0;
    return rawEntries.map((entry) => ({
      id: entry?.options?.id ?? entry?.id,
      options: entry?.options ?? entry?.config ?? {},
      state: entry?.fiber ? 'active' : 'inactive',
      live: true,
      entry,
    }));
  }

  async toolNames(sources) {
    const tools = this.svc('tools');
    const res = await callAny(tools, ['list', 'names', 'listTools', 'getAll'], [[]]);
    sources.tools = res.ok;
    if (!res.ok) return [];
    return arr(res.value).map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
  }

  async listSkills(sources) {
    const skillsSvc = this.svc('skills');
    const res = await callAny(skillsSvc, ['list', 'listSkills', 'catalog', 'getCatalog'], [[], [{}]]);
    if (res.ok) {
      const list = arr(res.value?.skills ?? res.value).filter((s) => s && s.name);
      if (list.length) { sources.skills = 'service'; return list.map((s) => ({ name: s.name, description: s.description, path: s.path || s.location })); }
    }
    const roots = [
      path.join(dshHome(), 'skills'), path.join(os.homedir(), '.agents', 'skills'),
      ...(this.options.skillRoots || []),
    ];
    const out = [];
    for (const root of roots) {
      let dirs = [];
      try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const file = path.join(root, d.name, 'SKILL.md');
        try {
          const text = fs.readFileSync(file, 'utf8');
          out.push({ name: d.name, path: file, description: parseSkillDescription(text), origin: 'profile' });
        } catch { /* not a skill dir */ }
      }
    }
    sources.skills = out.length ? 'filesystem' : false;
    return out;
  }

  /**
   * Locate the live Loader entry for a row id.
   * Verified: Iterates loader.entries() generator or fallback map.
   */
  async findEntry(rowId) {
    let loader;
    try { loader = typeof this.ctx.get === 'function' ? this.ctx.get('loader') : this.ctx.loader; } catch { /* unavailable */ }
    if (!loader) return undefined;
    let list = [];
    if (typeof loader.entries === 'function') {
      try {
        const iter = loader.entries();
        if (iter && typeof iter.next === 'function') {
          if (iter[Symbol.asyncIterator]) {
            for await (const e of iter) list.push(e);
          } else {
            for (const e of iter) list.push(e);
          }
        }
      } catch { /* fallback */ }
    } else if (loader.entries && typeof loader.entries === 'object') {
      list = Object.values(loader.entries);
    }
    return list.find((e) => e?.options?.id === rowId || e?.id === rowId);
  }
}

export function parseSkillDescription(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const body = fm ? fm[1] : text.slice(0, 1500);
  const m = /description:\s*(?:[>|][-+]?\s*\r?\n)?([\s\S]*?)(?=\r?\n[A-Za-z_-]+:|$)/.exec(body);
  return m ? m[1].replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '').slice(0, 400) : '';
}
