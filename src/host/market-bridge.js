import { callAny } from './util.js';

const TTL = 5 * 60 * 1000;
const TIMEOUT = 8000;
const safeHref = (u) => { try { const url = new URL(u); return url.protocol === 'https:' || url.protocol === 'http:' ? u : ''; } catch { return ''; } };

// Real packages shipped for DeepSeek Harness (from the installed-package catalogue). They are
// always listed so the marketplace is useful offline; installation goes through plugin_manager.
const OFFICIAL = [
  ['@deepseek-ai/dsh-mcp-client', 'MCP client', 'Connects to an MCP server and registers its tools.', 'mcp-client'],
  ['@deepseek-ai/dsh-mcp-manager', 'MCP manager', 'Settings-driven fleet of MCP clients with status, restart and probe.', 'mcp-manager'],
  ['@deepseek-ai/dsh-tool-bash', 'Bash tool', 'Model-facing bash tool with background-job support.', 'tool-bash'],
  ['@deepseek-ai/dsh-tool-pwsh', 'PowerShell tool', 'Model-facing PowerShell tool.', 'tool-pwsh'],
  ['@deepseek-ai/dsh-tool-fs', 'Filesystem tools', 'Read, write and edit files through the filesystem seam.', 'tool-fs'],
  ['@deepseek-ai/dsh-tool-fs-search', 'File search tools', 'glob and grep backed by ripgrep.', 'tool-fs-search'],
  ['@deepseek-ai/dsh-tool-str-replace-editor', 'String replace editor', 'View, create, replace and insert in files.', 'tool-str-replace-editor'],
  ['@deepseek-ai/dsh-tool-web', 'Web tools', 'web_search and web_fetch over the web seam.', 'tool-web'],
  ['@deepseek-ai/dsh-tool-subagent', 'Subagent tool', 'Delegate tasks to child agents.', 'tool-subagent'],
  ['@deepseek-ai/dsh-tool-workflow', 'Workflow tool', 'Run a JavaScript orchestration script over the workflow engine.', 'tool-workflow'],
  ['@deepseek-ai/dsh-tool-todo', 'Todo tool', 'todo_write over the session log.', 'tool-todo'],
  ['@deepseek-ai/dsh-tool-skill', 'Skill tool', 'Loads skills for the model.', 'tool-skill'],
  ['@deepseek-ai/dsh-tool-schedule', 'Schedule tools', 'Create, list, view and edit scheduled tasks.', 'tool-schedule'],
  ['@deepseek-ai/dsh-tool-ask-user', 'Ask user tool', 'ask_user_question for the human.', 'tool-ask-user'],
  ['@deepseek-ai/dsh-tool-office', 'Office tools', 'Render, convert and recalculate Office documents.', 'tool-office'],
  ['@deepseek-ai/dsh-skill-filesystem', 'Filesystem skills', 'Local filesystem skill provider.', 'skill-filesystem'],
  ['@deepseek-ai/dsh-skill-office', 'Office skills', 'Bundled Word, PowerPoint and Excel workflows.', 'skill-office'],
  ['@deepseek-ai/dsh-plan-mode', 'Plan mode', 'Per-agent plan mode with a user-reviewed exit.', 'plan-mode'],
  ['@deepseek-ai/dsh-goal', 'Goals', 'Same-session goal state and lifecycle.', 'goal'],
  ['@deepseek-ai/dsh-compaction-basic', 'Basic compaction', 'Token-meter-driven compaction with LLM summarisation.', 'compaction-basic'],
  ['@deepseek-ai/dsh-webhook', 'Webhooks', 'Webhook rule runtime that creates sessions.', 'webhook'],
  ['@deepseek-ai/dsh-schedule', 'Scheduler', 'Durable reminders delivered to sessions.', 'schedule'],
  ['@deepseek-ai/dsh-lsp-stdio', 'LSP (stdio)', 'Generic stdio language-server provider.', 'lsp-stdio'],
  ['@deepseek-ai/dsh-web-search-deepseek', 'DeepSeek web search', 'DeepSeek-backed search provider.', 'web-search-deepseek'],
].map(([name, title, description, id]) => ({
  id: `official:${id}`, kind: 'plugin', source: 'official', name, title, description, author: 'DeepSeek', official: true,
  installSpec: name, tags: ['official', ...id.split('-')],
}));

// Community catalogs. The index schema is not documented, so entries are parsed tolerantly.
// Extra indexes can be added with the `marketIndexes` config option (URL strings or {name,url}).
const DEFAULT_INDEXES = [
  { name: 'dshmarket', url: 'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json' },
  { name: 'awesome-dsh', url: 'https://awesome-dsh-plugin.com/plugins.json' },
  { name: 'dshmarket-site', url: 'https://dshmarket.com/index.json' },
];

// Sites without a machine-readable API: shown as links in the Marketplace drawer.
export const BROWSE_LINKS = [
  { name: 'DSH Plugin Hub', url: 'https://dsh-plugin.org/' },
  { name: 'DSH Market', url: 'https://dshmarket.com/' },
  { name: 'Awesome DSH Plugins', url: 'https://awesome-dsh-plugin.com/' },
];

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; };
const text = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? (v.en || v['en-US'] || Object.values(v).find((x) => typeof x === 'string') || '') : v == null ? '' : String(v));

function entriesOf(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of ['plugins', 'entries', 'items', 'packages', 'results', 'data']) {
    if (Array.isArray(data[k])) return data[k];
    if (data[k] && typeof data[k] === 'object' && !Array.isArray(data[k])) { const v = Object.entries(data[k]).map(([key, val]) => (val && typeof val === 'object' ? { name: key, ...val } : null)).filter(Boolean); if (v.length) return v; }
  }
  return [];
}

const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// Real shape of the awesome-dsh-plugin catalog (from the dsh-market source, src/registry.ts):
// { updated, count, categories: {id: {en, zh}}, plugins: [{ name, owner, url, category, description: {en, zh},
//   npm, tarball, stars, downloads, version, icon, install, added, deprecated, replacement,
//   capabilities, capabilityRedLines }] }. `url` is a GitHub URL, optionally .../tree/<branch>/<subpath>.
function normalizeEntry(e, source, cats = {}) {
  if (!e || typeof e !== 'object') return null;
  const npm = pick(e, ['npm', 'npmName', 'package', 'packageName']);
  const npmName = typeof npm === 'string' && NPM_NAME_RE.test(npm) ? npm : undefined;
  const repo = text(pick(e, ['url', 'repository', 'repo', 'github', 'homepage']));
  const rawName = text(pick(e, ['name', 'id', 'slug', 'title'])) || npmName || repo;
  if (!rawName) return null;
  const m = /^https:\/\/github\.com\/([^/]+\/[^/#?]+?)(?:\.git)?(?:\/tree\/[^/]+\/(.+?))?\/?$/.exec(repo);
  const gh = m?.[1] || (/^[\w.-]+\/[\w.-]+$/.test(rawName) && !rawName.startsWith('@') ? rawName : undefined);
  const subpath = m?.[2] && /^[A-Za-z0-9_./-]+$/.test(m[2]) && !m[2].split('/').some((s) => s === '..' || s === '.' || s === '') ? m[2] : undefined;
  const tarball = typeof e.tarball === 'string' && /^https:\/\/github\.com\//.test(e.tarball) && /\.(tgz|tar\.gz)$/.test(e.tarball) ? e.tarball : undefined;
  const name = npmName || (e.owner && !String(rawName).includes('/') ? `${e.owner}/${rawName}` : rawName);
  const installSpec = npmName || tarball || (gh ? `github:${gh}${subpath ? `#path:/${subpath}` : ''}` : undefined);
  const catIds = [].concat(e.category ?? []).filter((c) => typeof c === 'string');
  const cat = catIds.map((c) => text(cats[c]) || c).join(', ') || text(pick(e, ['category', 'categories']));
  const tags = [].concat(e.tags || e.topics || e.keywords || [], catIds, cat ? [cat] : []).map(String);
  const lower = `${name} ${tags.join(' ')} ${cat}`.toLowerCase();
  const kind = /\bmcp\b/.test(lower) ? 'mcp' : /\bskill/.test(lower) ? 'skill' : 'plugin';
  return {
    id: `${source}:${name}`, kind, source, name, title: text(pick(e, ['title', 'displayName'])) || name.replace(/^@[^/]+\//, ''),
    description: text(pick(e, ['description', 'desc', 'description_en', 'summary'])), version: text(pick(e, ['version', 'latestVersion'])) || undefined,
    author: text(pick(e, ['author', 'owner'])) || undefined, homepage: /^https?:/.test(repo) ? repo : undefined,
    repository: gh ? `https://github.com/${gh}` : undefined, installSpec, installable: Boolean(installSpec),
    stars: pick(e, ['stars', 'stargazers_count']), downloads: typeof e.downloads === 'number' ? e.downloads : undefined, tags,
    deprecated: e.deprecated === true || undefined, replacement: typeof e.replacement === 'string' ? e.replacement : undefined,
    // Capability disclosure from the catalog's static scan: undefined = never scanned, [] = scanned, nothing found.
    capabilities: Array.isArray(e.capabilities) ? e.capabilities.map(String) : undefined,
    capabilityRedLines: Array.isArray(e.capabilityRedLines) ? e.capabilityRedLines.map(String) : undefined,
  };
}

const cache = new Map();

async function getJson(url, init = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json', 'user-agent': 'dsh-workflow-studio', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  const value = await res.json();
  cache.set(url, { at: Date.now(), value });
  return value;
}

/** Aggregates the plugin market index, npm, the MCP registry and GitHub topics. */
export class MarketplaceBridge {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.options = options;
    this._updateApiBase = null;
  }

  /** Discover dsh-market update API v1 capabilities via GET /dsh-market/api/v1/capabilities */
  async discoverUpdateApi() {
    if (this._updateApiBase) return this._updateApiBase;
    const ws = this.ctx.webServer;
    if (!ws) return null;
    // The update API is served at /dsh-market/api/v1 relative to the host
    try {
      const res = await fetch('/dsh-market/api/v1/capabilities', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const caps = await res.json();
        if (caps && caps.version === 1 && caps.updateApi) {
          this._updateApiBase = '/dsh-market/api/v1';
          return this._updateApiBase;
        }
      }
    } catch { /* not available */ }
    return null;
  }

  /** Fetch updates from dsh-market update API v1 */
  async fetchUpdates() {
    const base = await this.discoverUpdateApi();
    if (!base) return { items: [], source: 'unavailable' };
    try {
      const res = await fetch(`${base}/updates?limit=50`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { items: data.updates || [], source: 'dsh-market-v1' };
    } catch (e) {
      return { items: [], source: 'dsh-market-v1', error: String(e.message || e) };
    }
  }

  async search(query = '', kind = 'all') {
    const q = String(query || '').trim();
    const jobs = [];
    const status = {};
    const run = (name, fn) => jobs.push(fn().then((items) => { status[name] = items.length; return items; }).catch((e) => { status[name] = `error: ${e.message}`; return []; }));

    run('official', async () => OFFICIAL.filter((i) => matches(i, q)));
    // Discover and use dsh-market update API v1 if available
    const updateApi = await this.discoverUpdateApi();
    if (updateApi && (kind === 'all' || kind === 'plugin')) {
      run('dsh-market-updates', async () => {
        const { items } = await this.fetchUpdates();
        return items.filter((i) => matches(i, q));
      });
    }
    if (kind === 'all' || kind === 'plugin' || kind === 'skill' || kind === 'mcp') {
      for (const idx of this.indexes()) run(idx.name, () => this.fromIndex(idx, q));
    }
    if (kind === 'all' || kind === 'plugin') {
      run('market-index', () => this.fromPluginMarket(q));
      run('npm', () => this.fromNpm(q, 'dsh-plugin', 'plugin'));
      run('github', () => this.fromGithub(q, 'dsh-plugin', 'plugin'));
    }
    if (kind === 'all' || kind === 'skill') {
      run('npm-skills', () => this.fromNpm(q, 'dsh-skill', 'skill'));
      run('github-skills', () => this.fromGithub(q, 'dsh-skill', 'skill'));
    }
    if (kind === 'all' || kind === 'mcp') run('mcp-registry', () => this.fromMcpRegistry(q));

    const lists = await Promise.all(jobs);
    const seen = new Set();
    const items = [];
    for (const item of lists.flat()) {
      if (kind !== 'all' && item.kind !== kind) continue;
      const key = `${item.kind}:${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    items.sort((a, b) => Number(b.official) - Number(a.official));
    items.sort((a, b) => Number(b.official) - Number(a.official) || (Number(b.stars) || 0) - (Number(a.stars) || 0));
    return { items: items.slice(0, 120), status, links: BROWSE_LINKS };
  }

  indexes() {
    const extra = (this.options.marketIndexes || []).map((x, i) => (typeof x === 'string' ? { name: `index-${i + 1}`, url: x } : x)).filter((x) => x && /^https:\/\//.test(x.url));
    const seen = new Set();
    return [...DEFAULT_INDEXES, ...extra].filter((x) => !seen.has(x.url) && seen.add(x.url));
  }

  async fromIndex(idx, q) {
    const data = await getJson(idx.url);
    const cats = data && typeof data === 'object' && !Array.isArray(data) && data.categories && typeof data.categories === 'object' ? data.categories : {};
    const list = entriesOf(data).map((e) => normalizeEntry(e, idx.name, cats)).filter(Boolean).filter((i) => matches(i, q));
    if (!list.length && !q && entriesOf(data).length === 0) throw new Error('unrecognised index format');
    const pop = (i) => (Number(i.downloads) || 0) + (Number(i.stars) || 0) * 10;
    return list.sort((a, b) => pop(b) - pop(a)).slice(0, 60);
  }

  async fromPluginMarket(q) {
    const market = this.ctx.get?.('pluginMarket') ?? this.ctx.pluginMarket;
    const res = await callAny(market, ['search', 'list', 'listEntries', 'entries', 'getEntries'], [[{ query: q }], [q], []]);
    if (!res.ok) throw new Error(res.error || 'market service unavailable');
    const list = Array.isArray(res.value) ? res.value : res.value?.entries || res.value?.items || [];
    return list.filter((e) => e && (e.name || e.package)).map((e) => ({
      id: `market:${e.name || e.package}`, kind: 'plugin', source: 'plugin-market', name: e.name || e.package,
      title: e.title || e.name || e.package, description: e.description || '', version: e.version, author: e.author,
      homepage: safeHref(e.homepage), installSpec: e.installSpec || e.name || e.package, tags: e.tags || [],
    })).filter((i) => matches(i, q));
  }

  async fromNpm(q, keyword, kind) {
    const text = encodeURIComponent(`keywords:${keyword}${q ? ` ${q}` : ''}`);
    const data = await getJson(`https://registry.npmjs.org/-/v1/search?text=${text}&size=25`);
    return (data.objects || []).map(({ package: p }) => ({
      id: `npm:${p.name}`, kind, source: 'npm', name: p.name, title: p.name.replace(/^@[^/]+\//, ''), description: p.description || '',
      version: p.version, author: p.publisher?.username || p.author?.name, homepage: safeHref(p.links?.homepage || p.links?.npm),
      repository: p.links?.repository, installSpec: p.name, tags: p.keywords || [],
    }));
  }

  async fromGithub(q, topic, kind) {
    const text = encodeURIComponent(`${q ? `${q} ` : ''}topic:${topic}`);
    const data = await getJson(`https://api.github.com/search/repositories?q=${text}&per_page=15&sort=stars`);
    return (data.items || []).map((r) => ({
      id: `github:${r.full_name}`, kind, source: 'github', name: r.full_name, title: r.name, description: r.description || '',
      author: r.owner?.login, homepage: r.html_url, repository: r.html_url, installSpec: `github:${r.full_name}`,
      stars: r.stargazers_count, tags: r.topics || [],
    }));
  }

  async fromMcpRegistry(q) {
    const url = `https://registry.modelcontextprotocol.io/v0/servers?limit=30${q ? `&search=${encodeURIComponent(q)}` : ''}`;
    const data = await getJson(url);
    return (data.servers || []).map((entry) => {
      const s = entry.server || entry;
      const remote = (s.remotes || []).find((r) => /http/.test(r.type || '')) || null;
      const pkg = (s.packages || []).find((p) => p.registryType === 'npm') || (s.packages || [])[0] || null;
      let mcp = null;
      if (remote) mcp = { transport: 'streamable-http', url: remote.url };
      else if (pkg?.registryType === 'npm') mcp = { transport: 'stdio', command: 'npx', args: ['-y', pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier] };
      else if (pkg?.registryType === 'pypi') mcp = { transport: 'stdio', command: 'uvx', args: [pkg.identifier] };
      const envVars = (pkg?.environmentVariables || []).map((v) => ({ name: v.name, description: v.description, required: Boolean(v.isRequired), secret: Boolean(v.isSecret) }));
      return {
        id: `mcp:${s.name}`, kind: 'mcp', source: 'mcp-registry', name: s.name, title: (s.title || s.name || '').split('/').pop(),
        description: s.description || '', version: s.version, homepage: safeHref(s.websiteUrl || s.repository?.url), repository: s.repository?.url,
        mcp, envVars, installable: Boolean(mcp), tags: ['mcp'],
      };
    });
  }

  findAlternatives(target, items = []) {
    const base = items.find((i) => i.id === target || i.name === target);
    if (!base) return items.slice(0, 4);
    const tags = new Set((base.tags || []).map(String));
    return items
      .filter((i) => i.id !== base.id && i.kind === base.kind)
      .map((i) => ({ i, score: (i.tags || []).filter((t) => tags.has(String(t))).length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.i);
  }
}

function matches(item, q) {
  if (!q) return true;
  const hay = `${item.title} ${item.name} ${item.description} ${(item.tags || []).join(' ')}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}
